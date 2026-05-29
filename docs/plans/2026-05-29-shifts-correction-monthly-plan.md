# Plan: Корректировка смен + Месячный отчёт + Алерты

## Цель
Дать бухгалтеру инструменты контроля и корректировки данных.

## Архитектура

```
/admin  →  вкладки: Сотрудники | Должности | Смены (новая) | Лог изменений (новая)
/admin/monthly  →  новая страница: месячный отчёт
/schedule  →  добавить кнопку «Экспорт план/факт»
```

### Поток корректировки часов
1. Бухгалтер выбирает вкладку «Смены» в /admin
2. Фильтрует по дате / филиалу / сотруднику / статусу
3. Незакрытые смены выделены красным
4. Кнопка «Закрыть вручную» (для open) или «Изменить часы» (для closed)
5. Модалка: вводит часы + причина
6. Backend: обновляет Shift → пересчитывает PayrollEntry → обновляет FotSummary
7. Все отчёты (дашборд, ФОТ, admin) сразу видят новые данные

## Tech Stack
- Backend: FastAPI + SQLAlchemy async + Alembic
- Frontend: Next.js 14 + TypeScript

## Files

| File | Action | Purpose |
|------|--------|---------|
| `backend/app/routers/admin.py` | edit | новые эндпоинты shifts, monthly, log |
| `backend/app/schemas/admin.py` | edit | новые схемы |
| `frontend/src/app/admin/page.tsx` | edit | вкладка «Смены» + «Лог изменений» |
| `frontend/src/app/admin/monthly/page.tsx` | create | страница месячного отчёта |
| `frontend/src/lib/api.ts` | edit | новые методы API |
| `frontend/src/app/schedule/page.tsx` | edit | кнопка «Экспорт план/факт» |

---

## Tasks

### Task 1: Backend — GET /admin/shifts (список смен с фильтрами)
Files: `backend/app/routers/admin.py`, `backend/app/schemas/admin.py`

- [ ] Добавить схему `ShiftAdminOut`:
  ```python
  class ShiftAdminOut(BaseModel):
      id: int
      employee_id: int
      employee_name: str
      branch_id: int
      branch_name: str
      date: date
      opened_at: datetime
      closed_at: datetime | None
      approved_hours: Decimal | None
      status: str
      is_corrected: bool
      note: str | None
      model_config = {"from_attributes": True}
  ```
- [ ] Добавить эндпоинт:
  ```python
  @router.get("/shifts", response_model=list[ShiftAdminOut])
  async def list_shifts_admin(
      from_date: date,
      to_date: date,
      branch_id: int | None = None,
      employee_id: int | None = None,
      status: str | None = None,  # "open" | "closed"
      db: AsyncSession = Depends(get_db),
      current_user: User = Depends(require_accountant),
  ):
      q = (select(Shift)
          .options(selectinload(Shift.employee), selectinload(Shift.branch))
          .where(Shift.date >= from_date, Shift.date <= to_date)
          .order_by(Shift.date.desc(), Shift.opened_at.desc()))
      if branch_id: q = q.where(Shift.branch_id == branch_id)
      if employee_id: q = q.where(Shift.employee_id == employee_id)
      if status: q = q.where(Shift.status == status)
      result = await db.execute(q)
      shifts = result.scalars().all()
      return [ShiftAdminOut(
          id=s.id, employee_id=s.employee_id,
          employee_name=s.employee.full_name,
          branch_id=s.branch_id, branch_name=s.branch.name,
          date=s.date, opened_at=s.opened_at, closed_at=s.closed_at,
          approved_hours=s.approved_hours, status=s.status.value,
          is_corrected=bool(s.payroll_entry and s.payroll_entry.is_corrected) if hasattr(s, 'payroll_entry') else False,
          note=s.note,
      ) for s in shifts]
  ```
- [ ] Commit: `feat(backend): GET /admin/shifts — список смен для бухгалтера`

---

### Task 2: Backend — PATCH /admin/shifts/{shift_id} (корректировка / ручное закрытие)
Files: `backend/app/routers/admin.py`, `backend/app/schemas/admin.py`

- [ ] Добавить схему запроса:
  ```python
  class ShiftCorrectRequest(BaseModel):
      approved_hours: Decimal  # новые часы (0 = убрать из расчёта)
      note: str | None = None
  ```
- [ ] Добавить эндпоинт:
  ```python
  @router.patch("/shifts/{shift_id}", response_model=ShiftAdminOut)
  async def correct_shift(
      shift_id: int,
      body: ShiftCorrectRequest,
      db: AsyncSession = Depends(get_db),
      current_user: User = Depends(require_accountant),
  ):
      # 1. Найти смену
      shift = await db.get(Shift, shift_id)
      if not shift: raise HTTPException(404)
      
      # 2. Обновить смену
      shift.approved_hours = body.approved_hours
      shift.status = ShiftStatus.closed
      if body.note: shift.note = body.note
      
      # 3. Пересчитать PayrollEntry
      # Получить сотрудника для ставки
      emp = await db.get(Employee, shift.employee_id)
      hours = body.approved_hours
      
      pe_result = await db.execute(
          select(PayrollEntry).where(PayrollEntry.shift_id == shift_id)
      )
      pe = pe_result.scalar_one_or_none()
      
      base_pay = hours * emp.hourly_rate if emp.payment_type == 'hourly' else emp.fixed_daily_rate or Decimal(0)
      total_pay = base_pay + (pe.bonus if pe else Decimal(0))
      
      if pe:
          pe.approved_hours = hours
          pe.hours_worked = hours
          pe.base_pay = base_pay
          pe.total_pay = total_pay
          pe.is_corrected = True
          pe.corrected_by = current_user.id
          pe.corrected_at = datetime.now(UTC)
          pe.notes = body.note
      else:
          pe = PayrollEntry(
              employee_id=shift.employee_id, branch_id=shift.branch_id,
              date=shift.date, shift_id=shift_id,
              hours_worked=hours, approved_hours=hours,
              rate=emp.hourly_rate, base_pay=base_pay,
              bonus=Decimal(0), total_pay=total_pay,
              payment_type=emp.payment_type,
              is_corrected=True, corrected_by=current_user.id,
              corrected_at=datetime.now(UTC), notes=body.note,
          )
          db.add(pe)
      
      await db.flush()
      
      # 4. Пересчитать FotSummary за этот день
      await _recalculate_fot_summary(db, shift.branch_id, shift.date)
      
      await db.commit()
      await db.refresh(shift)
      return shift  # ... (формирование ответа как в Task 1)
  ```
- [ ] Реализовать `_recalculate_fot_summary(db, branch_id, date)`:
  - Загрузить все PayrollEntry за день для филиала
  - Суммировать по категориям (kitchen, admin, tech, courier, reserve)
  - Обновить или создать FotSummary
  - Пересчитать проценты и статусы
- [ ] Commit: `feat(backend): PATCH /admin/shifts/{id} — корректировка и ручное закрытие смены`

---

### Task 3: Backend — GET /admin/monthly-report
Files: `backend/app/routers/admin.py`, `backend/app/schemas/admin.py`

- [ ] Добавить схему:
  ```python
  class MonthlyEmployeeRow(BaseModel):
      employee_id: int
      employee_name: str
      position: str
      category: str
      payment_type: str
      rate: Decimal
      days_worked: int
      total_hours: Decimal
      base_pay: Decimal
      bonus: Decimal
      total_pay: Decimal
      has_corrections: bool

  class MonthlyReportOut(BaseModel):
      year: int; month: int
      branch_id: int | None; branch_name: str | None
      rows: list[MonthlyEmployeeRow]
      total_hours: Decimal
      total_pay: Decimal
  ```
- [ ] Добавить эндпоинт:
  ```python
  @router.get("/monthly-report", response_model=MonthlyReportOut)
  async def get_monthly_report(
      year: int, month: int,
      branch_id: int | None = None,
      db: AsyncSession = Depends(get_db),
      current_user: User = Depends(require_accountant),
  ):
      from_date = date(year, month, 1)
      to_date = date(year, month, calendar.monthrange(year, month)[1])
      q = (select(PayrollEntry)
          .options(selectinload(PayrollEntry.employee).selectinload(Employee.position))
          .where(PayrollEntry.date >= from_date, PayrollEntry.date <= to_date))
      if branch_id: q = q.where(PayrollEntry.branch_id == branch_id)
      entries = (await db.execute(q)).scalars().all()
      
      # Группировать по employee_id
      by_emp: dict[int, list[PayrollEntry]] = {}
      for e in entries:
          by_emp.setdefault(e.employee_id, []).append(e)
      
      rows = []
      for emp_id, emp_entries in by_emp.items():
          emp = emp_entries[0].employee
          rows.append(MonthlyEmployeeRow(
              employee_id=emp_id,
              employee_name=emp.full_name,
              position=emp.position.name if emp.position else '',
              category=emp.category or '',
              payment_type=emp_entries[0].payment_type,
              rate=emp_entries[0].rate,
              days_worked=len(emp_entries),
              total_hours=sum(e.approved_hours for e in emp_entries),
              base_pay=sum(e.base_pay for e in emp_entries),
              bonus=sum(e.bonus for e in emp_entries),
              total_pay=sum(e.total_pay for e in emp_entries),
              has_corrections=any(e.is_corrected for e in emp_entries),
          ))
      rows.sort(key=lambda r: r.employee_name)
      return MonthlyReportOut(
          year=year, month=month,
          branch_id=branch_id, branch_name=None,
          rows=rows,
          total_hours=sum(r.total_hours for r in rows),
          total_pay=sum(r.total_pay for r in rows),
      )
  ```
- [ ] Commit: `feat(backend): GET /admin/monthly-report — месячный отчёт по сотрудникам`

---

### Task 4: Backend — GET /admin/corrections-log + GET /admin/plan-vs-fact
Files: `backend/app/routers/admin.py`

- [ ] Лог изменений:
  ```python
  @router.get("/corrections-log")
  async def corrections_log(
      from_date: date, to_date: date,
      branch_id: int | None = None,
      db: AsyncSession = Depends(get_db),
      current_user: User = Depends(require_accountant),
  ):
      q = (select(PayrollEntry)
          .options(selectinload(PayrollEntry.employee), selectinload(PayrollEntry.corrected_by_user))
          .where(PayrollEntry.is_corrected == True,
                 PayrollEntry.date >= from_date, PayrollEntry.date <= to_date))
      if branch_id: q = q.where(PayrollEntry.branch_id == branch_id)
      entries = (await db.execute(q)).scalars().all()
      return [{"id": e.id, "employee": e.employee.full_name,
               "date": e.date, "hours": e.approved_hours,
               "pay": e.total_pay, "notes": e.notes,
               "corrected_by": e.corrected_by_user.username if e.corrected_by_user else None,
               "corrected_at": e.corrected_at} for e in entries]
  ```
- [ ] Plan vs Fact:
  ```python
  @router.get("/plan-vs-fact")
  async def plan_vs_fact(
      week_start: date, branch_id: int,
      db: ..., current_user: User = Depends(require_manager),
  ):
      week_end = week_start + timedelta(days=6)
      # Загрузить SchedulePlan + Shifts за неделю
      # Вернуть список: employee | planned_hours | actual_hours | diff
  ```
- [ ] Commit: `feat(backend): corrections-log + plan-vs-fact эндпоинты`

---

### Task 5: Frontend api.ts — новые методы
Files: `frontend/src/lib/api.ts`

- [ ] Добавить методы:
  ```typescript
  getAdminShifts: (params: {from_date: string, to_date: string, branch_id?: number, status?: string}) =>
    request<ShiftAdmin[]>(`/admin/shifts?${new URLSearchParams(params as any)}`),
  
  correctShift: (shiftId: number, body: {approved_hours: number, note?: string}) =>
    request<ShiftAdmin>(`/admin/shifts/${shiftId}`, {method: 'PATCH', body: JSON.stringify(body)}),
  
  getMonthlyReport: (year: number, month: number, branch_id?: number) =>
    request<MonthlyReport>(`/admin/monthly-report?year=${year}&month=${month}${branch_id ? `&branch_id=${branch_id}` : ''}`),
  
  getCorrectionsLog: (params: {from_date: string, to_date: string, branch_id?: number}) =>
    request<CorrectionLog[]>(`/admin/corrections-log?${new URLSearchParams(params as any)}`),
  
  getPlanVsFact: (week_start: string, branch_id: number) =>
    request<PlanVsFact[]>(`/admin/plan-vs-fact?week_start=${week_start}&branch_id=${branch_id}`),
  ```
- [ ] Добавить TypeScript типы для всех новых сущностей
- [ ] Commit: `feat(frontend): api.ts — методы для смен, месячного отчёта, лога`

---

### Task 6: Frontend — вкладка «Смены» в /admin
Files: `frontend/src/app/admin/page.tsx`

- [ ] Добавить вкладку «Смены» в навигацию рядом с Сотрудники / Должности
- [ ] UI вкладки:
  ```
  Фильтры: [от] [до] [Филиал▼] [Сотрудник▼] [Статус▼] [Обновить]
  
  Таблица:
  Дата | Сотрудник | Филиал | Открыта | Закрыта | Часы | Статус | Действие
  2026-05-25 | Иванова Мария | Челябинск | 09:00 | 18:00 | 8.5 | ✅ | [Изменить]
  2026-05-25 | Петров Алексей | Челябинск | 10:00 | — | — | 🔴 Открыта | [Закрыть]
  ```
- [ ] Строки со статусом "open" → красный фон
- [ ] Исправленные строки (is_corrected) → иконка ✏️ рядом с часами
- [ ] Модалка «Изменить/Закрыть»:
  - Поле: Часов отработано (число, шаг 0.5)
  - Поле: Причина изменения (текст, необязательно)
  - Кнопки: Сохранить | Отмена
- [ ] После сохранения → перезагрузить список
- [ ] Commit: `feat(frontend): вкладка Смены в /admin — список, алерты, корректировка`

---

### Task 7: Frontend — вкладка «Лог изменений» в /admin
Files: `frontend/src/app/admin/page.tsx`

- [ ] Добавить вкладку «Лог»
- [ ] Фильтры: [от] [до] [Филиал▼]
- [ ] Таблица:
  ```
  Дата | Сотрудник | Часы | Сумма | Причина | Кто изменил | Когда
  ```
- [ ] Commit: `feat(frontend): вкладка Лог изменений в /admin`

---

### Task 8: Frontend — страница /admin/monthly
Files: `frontend/src/app/admin/monthly/page.tsx`

- [ ] Новая страница (доступна accountant + owner)
- [ ] Навигация: добавить ссылку «Месячный отчёт» в /admin
- [ ] UI:
  ```
  [◀ Май 2026 ▶]  [Филиал▼]  [Экспорт Excel]
  
  Таблица:
  Сотрудник | Категория | Тип | Ставка | Дней | Часов | Начислено | Бонус | К выплате | Коррекции
  Иванова М. | Кухня | ч/ставка | 200₽/ч | 20 | 160 | 32000₽ | 1400₽ | 33400₽ | —
  ...
  ИТОГО: | | | | 200 | 1640 | 328000₽ | 14000₽ | 342000₽
  ```
- [ ] Строки с корректировками → иконка ✏️
- [ ] Excel экспорт: та же таблица в .xlsx через exceljs
- [ ] Commit: `feat(frontend): страница /admin/monthly — месячный отчёт`

---

### Task 9: Frontend — кнопка «Экспорт план/факт» на /schedule
Files: `frontend/src/app/schedule/page.tsx`

- [ ] Добавить кнопку рядом с CSV/XLSX
- [ ] Скачивает Excel: Employee | Mon план | Mon факт | ... | Итого план | Итого факт | Разница
- [ ] Commit: `feat(frontend): schedule — экспорт план vs факт`

---

### Task 10: Деплой и проверка
- [ ] git push → Vercel autodeploy frontend
- [ ] SSH → git pull + docker compose up -d --build backend
- [ ] Проверить:
  - Вкладка «Смены» показывает данные
  - Кнопка «Изменить» открывает модалку, сохраняет
  - Дашборд после изменения показывает новый ФОТ
  - /admin/monthly загружается с данными
  - Excel скачивается

## Execution Options

1. **Subagent-driven** (рекомендуется): по одному агенту на задачу с ревью
2. **Inline**: последовательно в текущей сессии
