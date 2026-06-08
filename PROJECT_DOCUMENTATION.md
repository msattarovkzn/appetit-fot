# PROJECT_DOCUMENTATION — «Аппетит — ФОТ»

> Аудит выполнен: 2026-06-08. Только READ-ONLY анализ кода, БД и миграций. Код не менялся.

Стек: **FastAPI + async SQLAlchemy + PostgreSQL** (`backend/`), **Next.js 14 + TypeScript + TailwindCSS** (`frontend/`).
Деплой: фронтенд → Vercel (автодеплой из `main`), бэкенд+БД → Timeweb Cloud VPS (Docker Compose, ручной деплой).

---

## 1. Цель проекта

Система учёта рабочих смен и расчёта ФОТ (фонда оплаты труда) для сети точек питания «Аппетит» — 5 филиалов (Челябинск + 4 точки в Казани: Ямашева, Глушко, Хади Такташ, Шакирова).

Сотрудники открывают/закрывают смены по PIN-коду на планшете точки. Кассир в конце дня вносит выручку и закрывает день — система автоматически считает ФОТ по категориям должностей (кухня/админ/тех/курьеры/резерв) и шлёт уведомление в Telegram. Бухгалтер проверяет дни, корректирует часы/начисления, ведёт справочник сотрудников и ставок. Управляющий смотрит дашборды/аналитику/график смен.

---

## 2. Реализованные функции (по роутерам/разделам)

### `auth.py` (`/auth`)
- `POST /auth/login` — вход по логину/паролю (User), bcrypt, выдаёт JWT
- `POST /auth/pin-verify` — проверка PIN сотрудника без создания смены
- `PATCH /auth/me/password` — смена пароля текущего пользователя (мин. 6 символов)

### `shifts.py` (`/shifts`)
- `POST /shifts/status` — статус смены сотрудника по PIN
- `POST /shifts/open` — открытие смены по PIN; защита от повторного открытия и от второй обычной смены за день
- `POST /shifts/close` — закрытие смены, расчёт `total_minutes` / `total_hours_decimal` / `approved_hours`
- `GET /shifts` — список смен филиала (роль manager+)
- `GET /shifts/live` — **публичный** (без авторизации) мониторинг открытых смен по всем филиалам
- `PATCH /shifts/{id}/approve` — утверждение часов смены менеджером

### `cashier.py` (`/cashier`)
- `POST /cashier/check-pin` — проверка PIN кассира + статус его смены
- `POST /cashier/extra-shift/open` / `close` — кассир открывает/закрывает доп. смену сотруднику
- `GET /cashier/sessions` — список кассирских сессий за день
- `POST /cashier/close-day-by-pin` — **основной флоу**: кассир по PIN закрывает свою кассирскую сессию + личную смену, создаёт/суммирует `BranchDailyReport`, пересчитывает ФОТ, шлёт Telegram
- `GET /cashier/reports`, `POST /cashier/close-day` — старый JWT-флоу закрытия дня бухгалтером/менеджером

### `admin.py` (`/admin`, роль accountant/owner)
- Должности: `GET/POST/PUT /admin/positions[/{id}]`
- Сотрудники: `GET/POST/{id}/PUT{id}` `/admin/employees`, `dismiss`/`activate`
- Смены: `GET /admin/shifts`, `PATCH /admin/shifts/{id}` — корректировка часов с пересчётом PayrollEntry/FotSummary
- `GET /admin/monthly-report` — месячный отчёт по сотрудникам
- `GET /admin/corrections-log` — журнал ручных корректировок
- `GET /admin/plan-vs-fact` — план/факт по часам за неделю
- `GET /admin/violations` — нарушения (незакрытые смены, ручные закрытия)
- `POST /admin/employees/{id}/rates` — новая ставка с автозакрытием предыдущей

### `review.py` (`/review`, роль accountant/owner)
- `GET /review` — список филиалов со статусом проверки дня (red/yellow/green)
- `GET /review/{branch_id}/{date}` — детальная карточка дня (payroll, план/факт, вердикт)
- `PATCH /review/shifts/{id}/correct` — полная корректировка смены (время, часы, ставка override, аннулирование)
- `POST /review/{branch_id}/{date}/verify` — закрыть проверку дня (→green)
- `POST /review/{branch_id}/{date}/reopen` — переоткрыть (green→yellow)
- `POST /review/shifts/{id}/resolve` — разрешение аномалии длинной смены
- `GET /review/audit-log` — журнал аудита

### `employee_cabinet.py` (`/employee`, отдельная JWT-авторизация по логину+PIN)
- `POST /employee/login`, `GET /employee/me`, `/me/payroll`, `/me/shifts`, `/me/schedule` — read-only кабинет сотрудника

### `schedule.py` (`/schedule`)
- `GET /schedule/week` — план/факт график на неделю
- `POST /schedule/save` — массовый upsert планового графика (manager/owner)
- `DELETE /schedule/entry/{id}`

### `analytics.py` (`/analytics`, роль manager+)
- `GET /analytics/overview` — сводная аналитика (тренды, сравнение периодов, лучший/худший день/филиал, прогноз)
- `GET /analytics/compare` — быстрое сравнение периодов

### `dashboard.py` (`/dashboard`, роль manager+)
- `GET /dashboard` — таблица по дням/филиалам
- `GET /dashboard/branches`, `/branch/{id}`, `/network` — сводки ФОТ

### `payroll.py` (`/payroll`, роль accountant+)
- `GET /payroll/entries`, `PATCH /payroll/entries/{id}` (ручная коррекция), `GET /payroll/fot-summary`

### `employees.py` (`/employees`, роль manager/accountant) — **легаси, дублирует admin.py**
- CRUD сотрудников и ставок через другой набор схем/аудита

### `branches.py` (`/branches`)
- `GET /branches` — список активных филиалов, **без авторизации**

### `test_mode.py` (`/test`, только dev/staging, только branch_id=1)
- открытие/закрытие тестовых смен на произвольную дату, сброс данных дня

### Frontend — разделы (`frontend/src/app/*/page.tsx`)
`admin`, `manager`, `fot`, `schedule`, `cashier`, `employee`, `live`, `analytics`, `shift` — соответствующие UI-страницы по ролям.

---

## 3. Частично реализованные / сомнительные функции

1. **Два параллельных аудит-механизма**: `app/services/audit.py::log_action` (используется в `employees.py`, `payroll.py`, `cashier.py:close_day`) пишет в модель `AuditLog`, передавая поле `ip_address`, которого больше нет в реальной таблице `audit_log` — vs. `app/utils/review_helpers.py::write_audit` (используется в `admin.py`, `review.py`), пишущий в актуальную схему. **`log_action`, вероятно, падает с ошибкой** при вызове.
2. **`employees.py` (`/employees`) дублирует `admin.py` (`/admin/employees`)** — два разных набора CRUD-эндпоинтов сотрудников/ставок с разными схемами, разной логикой проверки уникальности PIN (admin.py делает `_check_pin_unique`, employees.py — нет) и разным аудитом.
3. **`GET /shifts/live`** и **`GET /branches`** — публичные без авторизации, отдают наружу ФИО сотрудников/должности всех филиалов.
4. **`cashier.py:close_day_by_pin`** выбирает «системного пользователя» произвольно: `select(User).where(User.is_active == True).limit(1)` для поля `closed_by` — недетерминированный выбор, архитектурный костыль.
5. **`Shift.approved_by`** не используется по назначению — в `cashier.py:open_extra_shift` явно `None` («кассир — не пользователь системы, храним в note»).
6. **Магические константы продублированы** в нескольких местах: пороги ФОТ (27.5/29%, 14.5/15.5%) — в `payroll.py`, `admin.py`, `dashboard.py` (3 копии); ставки бонуса кассира (7₽/5₽) — в `payroll.py::_admin_bonus` и `cashier.py::_cashier_bonus` (разные функции, идентичная логика).
7. **`test_mode.py`** жёстко привязан к `branch_id=1`, активируется через `ENVIRONMENT=development|staging` — нужно убедиться, что в проде `ENVIRONMENT=production`.
8. Посторонние папки/файлы в репозитории (`APPETIT-GAME`, `appetit-akzii-bot`, архивы, `доступы/`) — не относятся к проекту ФОТ.

---

## 4. Файловая структура (ключевые файлы)

| Файл | За что отвечает |
|---|---|
| `backend/app/main.py` | Регистрация роутеров, CORS, FastAPI app |
| `backend/app/database.py` | Подключение к БД (`AsyncSessionLocal`, `get_db`) |
| `backend/app/config.py` | Настройки (env) |
| `backend/app/dependencies.py` | `get_current_user`, `require_*` ролевые зависимости |
| `backend/app/models/*.py` | ORM-модели (см. п.5) |
| `backend/app/routers/*.py` | Эндпоинты API (см. п.2) |
| `backend/app/services/payroll.py` | Расчёт ФОТ за день (`calculate_payroll_for_day`) |
| `backend/app/services/bot.py` | Отправка сообщений в Telegram |
| `backend/app/services/audit.py` | Легаси-аудит (`log_action`) — несовместим со схемой |
| `backend/app/utils/review_helpers.py` | Актуальный аудит (`write_audit`), статус дня (`compute_and_save_review`) |
| `backend/app/utils/security.py` | bcrypt-хеши, JWT, проверка PIN |
| `backend/alembic/versions/00X_*.py` | Миграции БД (001–007) |
| `backend/create_owner.py`, `create_staging_users.py`, `reset_password.py`, `seed_test_data.py` | Скрипты обслуживания/сидинга |
| `frontend/src/lib/api.ts` | Единая точка обращения к бэкенду (через `/proxy`) |
| `frontend/src/app/page.tsx` | Главная — ссылки на разделы |
| `frontend/src/app/{admin,manager,fot,schedule,cashier,employee,live,analytics,shift}/page.tsx` | UI-страницы по ролям |

---

## 5. Структура БД (таблицы и поля)

| Таблица | Поля (важные) | Миграция |
|---|---|---|
| `branches` | id, name, city, is_active | 001 |
| `users` | id, username, password_hash, full_name, role(employee/cashier/manager/accountant/owner), branch_id, is_active | 001 |
| `positions` | id, name, category(admin/kitchen/tech/courier/reserve), payment_type(hourly/fixed_daily), is_active | 001, 005 |
| `employees` | id, full_name, pin_hash, pin_check, position_id, branch_id, is_cashier, is_active, comment, employee_login, phone, created_at; UNIQUE(pin_check, branch_id) | 001, 002, 005, 007 |
| `employee_rates` | id, employee_id, rate, fixed_daily_rate, effective_from, date_to, created_by, created_at | 001, 005 |
| `shifts` | id, employee_id, branch_id, date, opened_at, closed_at, approved_hours, total_minutes, total_hours_decimal, status(open/closed/approved), note, is_extra_shift, extra_shift_reason, approved_by, approved_at, anomaly_flag, anomaly_resolved_by/at | 001, 003, 007 |
| `branch_daily_reports` | id, branch_id, date, revenue, orders_count, takeaway_count, closed_by, closed_at, status; UNIQUE(branch_id,date) | 001 |
| `payroll_entries` | id, employee_id, branch_id, date, shift_id, hours_worked, approved_hours, rate, base_pay, bonus, total_pay, payment_type, notes, is_corrected, corrected_by, corrected_at | 001 |
| `fot_summary` | id, branch_id, date, daily_report_id, revenue, total_fot, kitchen_fot, admin_fot, tech_fot, courier_fot, reserve_fot, total_fot_pct, kitchen_fot_pct, status_total, status_kitchen | 001 |
| `notifications` | id, branch_id, date, message, sent_at, status(sent/failed), error_msg | 001 |
| `audit_logs` (создана, видимо мёртвая) vs `audit_log` (используется моделью) | расхождение схем — см. п.6/п.10 | 001 vs 007 |
| `schedule_plans` | id, branch_id, employee_id, date, planned_hours, start_time, end_time, break_minutes, comment, created_by; UNIQUE(employee_id,date) | 004, 006 |
| `cashier_sessions` | id, branch_id, date, cashier_employee_id, shift_start/end, revenue, orders_count, takeaway_count, bonus_amount, closed_by, closed_at | 007 |
| `daily_branch_review` | id, branch_id, date, status(red/yellow/green), issues(JSONB), issues_count, reviewed_by, reviewed_at, notes; UNIQUE(branch_id,date) | 007 |
| `audit_log` (актуальная) | id, entity_type, entity_id, action, user_id, user_name, branch_id, work_date, old_value(JSONB), new_value(JSONB), comment | 007 |

---

## 6. Используемые vs потенциально мёртвые поля/таблицы

- **`Shift.approved_by`** — заполняется только опосредованно через аудит в `review.py`; в `cashier.py:open_extra_shift` явно `None`. Фактически почти не выполняет роль «кто утвердил».
- **`takeaway_count`** (в `BranchDailyReport`/`CashierSession`) — собирается и показывается в отчётах/аналитике, но **явно не участвует** в формуле расчёта ФОТ (отмечено комментарием в `payroll.py`).
- **Таблица `audit_logs`** (миграция 001: `user_id NOT NULL`, `entity_id NOT NULL`, `ip_address`) — **не соответствует** ORM-модели `AuditLog` (`__tablename__ = "audit_log"`, создана отдельно в 007 с другой структурой, без `ip_address`). Похоже, `audit_logs` — мёртвая таблица в БД.
- **`Notification`** — создаётся при закрытии дня; отдельного эндпоинта чтения уведомлений не найдено.
- **Категория `reserve`** в позициях — присутствует в seed-данных и формуле ФОТ, но неясно, используется ли реально (нет данных по сотрудникам этой категории).

---

## 7. Как работает открытие/закрытие смен (по шагам)

**Обычный сотрудник** (`backend/app/routers/shifts.py`):
1. `POST /shifts/status` — UI проверяет, есть ли уже открытая смена сегодня
2. `POST /shifts/open` — поиск сотрудника по PIN (`_find_employee_by_pin`); проверка, что нет открытой смены сегодня и не было закрытой смены сегодня (если была — ошибка `already_had_shift`, доп. смену может открыть только кассир); создание `Shift(status=open, opened_at=now)`
3. `POST /shifts/close` — находит открытую смену, ставит `closed_at=now`, `status=closed`, считает `total_minutes`, `total_hours_decimal`, `approved_hours = round(total_seconds/3600, 2)`

**Доп. смена через кассира** (`backend/app/routers/cashier.py`):
4. `POST /cashier/extra-shift/open` — кассир аутентифицируется PIN (только `is_cashier=True`), создаёт `Shift(is_extra_shift=True, ...)`, время открытия — либо переданное, либо текущее
5. `POST /cashier/extra-shift/close` — кассир закрывает любую (свою или чужую) смену, аналогичный расчёт времени

**Закрытие дня (основной флоу)**:
6. `POST /cashier/close-day-by-pin` — кассир по PIN; проверка, что не закрывал сегодня; закрывает свою личную смену; считает бонус кассира (`_cashier_bonus`: 7₽ Пн-Чт+Вс, 5₽ Пт-Сб); создаёт `CashierSession`, суммирует/создаёт `BranchDailyReport` (поддержка нескольких кассиров за день — суммирование выручки/заказов); вызывает `calculate_payroll_for_day`; собирает список незакрытых смен; шлёт Telegram-уведомление

**Корректировка бухгалтером — два пути**:
- `PATCH /admin/shifts/{id}` — простая коррекция (`approved_hours`, `note`), пересчёт PayrollEntry/FotSummary
- `PATCH /review/shifts/{id}/correct` — полная коррекция: время открытия/закрытия, прямое переопределение часов, override ставки, аннулирование (`annul=true`, требует комментарий)

---

## 8. Расчёт зарплаты/ФОТ (`backend/app/services/payroll.py::calculate_payroll_for_day`)

1. Удаляет старые `PayrollEntry` (не скорректированные вручную) и `FotSummary` за день/отчёт — защита от дублей при пересчёте
2. Берёт **только закрытые** смены (`closed_at IS NOT NULL`) за день/филиал
3. Для каждой смены:
   - `total_minutes` — из поля или вычисляется из таймстампов; если `<= 0` — смена пропускается
   - находит активную ставку сотрудника на дату
   - **billing_minutes** = `approved_hours * 60`, если задано (менеджером/бухгалтером) и `> 0`, иначе `total_minutes`
   - **Формула оплаты**:
     - `fixed_daily`: `base_pay = fixed_daily_rate or rate`, бонус = 0
     - `hourly`: `base_pay = (rate / 60) * billing_minutes`
   - **Бонус кассира-администратора**: только если должность категории `admin`, сотрудник == кассир дня, и бонус ещё не выдавался: `_admin_bonus(orders_count, day_of_week)` = `orders_count * (7₽ Пн-Чт+Вс / 5₽ Пт-Сб)`
   - `total_pay = base_pay + bonus`
4. Создаёт `PayrollEntry`
5. Суммирует по категориям (`category_fot`), создаёт `FotSummary`:
   - `total_fot_pct = total_fot / revenue * 100`, `kitchen_fot_pct = kitchen_fot / revenue * 100`
   - **Пороги статусов (жёстко зашиты)**:
     - `total`: `< 27.5%` green, `<= 29%` yellow, иначе red
     - `kitchen`: `< 14.5%` green, `<= 15.5%` yellow, иначе red

> Те же пороги задублированы ещё в `admin.py::_fot_status_total/_kitchen` и `dashboard.py::_status_total/_kitchen` — три независимые копии одной бизнес-логики.

---

## 9. Роли пользователей

`UserRole`: `employee`, `cashier`, `manager`, `accountant`, `owner`.

Иерархия зависимостей (`backend/app/dependencies.py`):
```
require_cashier    = cashier, manager, accountant, owner
require_manager    = manager, accountant, owner
require_accountant = accountant, owner
require_owner      = owner
```

- **owner/admin** — полный доступ
- **accountant (бухгалтер)** — управление сотрудниками/должностями/ставками (`/admin/*`), проверка дней (`/review/*`), корректировка payroll, аудит-лог; график — только чтение
- **manager (управляющий)** — дашборды, аналитика, список смен, утверждение часов, график (запись); НЕ управляет сотрудниками/ставками
- **cashier (кассир)** — реальный флоу закрытия дня идёт через PIN сотрудника `is_cashier=True`, без отдельного User-аккаунта
- **employee** — нет прямого доступа к API через роль User; работа — только через PIN (модель `Employee`) или отдельный кабинет (`employee_login` + свой JWT с `type=employee`, параллельная система токенов)

---

## 10. Найденные проблемы (баги, недоделки, спорные места)

1. **Несовпадение схемы аудит-лога** — `app/services/audit.py::log_action` создаёт `AuditLog(..., ip_address=...)`, но в реальной таблице `audit_log` (миграция 007) поля `ip_address` нет. Вызовы `log_action` (в `employees.py`, `cashier.py:close_day`, `payroll.py`) **вероятно падают с ошибкой** при выполнении.
2. **Дублирование роутеров** `/employees` и `/admin/employees` — два независимых набора CRUD сотрудников/ставок с разной валидацией PIN и разным аудитом.
3. **Недетерминированный выбор «системного пользователя»** в `cashier.py:close_day_by_pin` (`select(User)... .limit(1)`) для поля `closed_by`.
4. **Тройное дублирование порогов ФОТ** (27.5/29%, 14.5/15.5%) и **двойное дублирование** бонусной формулы кассира (7₽/5₽) в разных модулях.
5. **Публичные без авторизации эндпоинты** `GET /shifts/live` и `GET /branches` отдают наружу ФИО сотрудников и список филиалов.
6. **`Shift.approved_by`** не используется по прямому назначению.
7. **Посторонние файлы/папки в репозитории** (`APPETIT-GAME`, `appetit-akzii-bot`, архивы, `доступы/`) — не относятся к проекту ФОТ.
8. **`takeaway_count`** собирается по всей цепочке, но не влияет на расчёт ФОТ — неочевидно для пользователей интерфейса.
9. **Дублирование кода нормализации timezone** (`opened.replace(tzinfo=timezone.utc) if tzinfo is None else ...`) минимум в 6 местах по роутерам shifts/cashier/review.
10. Явных TODO/FIXME-комментариев в коде backend не найдено — но скрытых архитектурных долгов достаточно (см. выше).

---

## 11. Что сделать дальше (рекомендации)

1. **Срочно проверить/исправить `app/services/audit.py::log_action`** — привести к реальной схеме `audit_log` (убрать `ip_address` либо смигрировать БД), либо заменить все вызовы на `write_audit` из `review_helpers.py` и удалить легаси-сервис.
2. **Решить судьбу дублирующихся роутеров `/employees` vs `/admin/employees`** — выяснить (`grep` по фронтенду), какой реально используется, удалить второй, перенести недостающую логику.
3. **Вынести пороги ФОТ и бонусные ставки в общий модуль/конфиг** (`app/config.py` или `business_rules.py`), убрать тройное/двойное дублирование.
4. **Проверить таблицу `audit_logs`** в реальной проде-БД — если мёртвая, написать корректную миграцию для удаления.
5. **Добавить авторизацию (или явно задокументировать публичность по дизайну)** для `/shifts/live` и `/branches`.
6. **Унифицировать нормализацию timezone** в общий хелпер.
7. **Очистить корень репозитория** от посторонних файлов/папок, не относящихся к проекту.
8. **Пояснить в UI**, что `takeaway_count` — информационное поле и не влияет на ФОТ.
9. **Покрыть тестами `calculate_payroll_for_day`** — критическая бизнес-логика расчёта зарплаты сейчас проверяется только вручную через `test_mode.py`.

---

*Файлы, изученные при аудите: модели (`backend/app/models/*.py`), миграции (`backend/alembic/versions/00{1-7}_*.py`), роутеры (`backend/app/routers/*.py`), сервисы/утилиты (`services/payroll.py`, `services/audit.py`, `utils/review_helpers.py`, `utils/security.py`, `dependencies.py`, `main.py`), фронтенд-страницы (`frontend/src/app/*/page.tsx`).*
