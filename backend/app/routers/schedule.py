from datetime import date, timedelta, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.branch import Branch
from app.models.employee import Employee, EmployeeRate
from app.models.shift import Shift
from app.models.schedule import SchedulePlan
from app.models.user import User, UserRole
from app.dependencies import require_manager, require_roles
from app.schemas.schedule import ScheduleSaveRequest, ScheduleSaveResponse

router = APIRouter(prefix="/schedule", tags=["schedule"])

# manager + owner can write; accountant is read-only
require_schedule_editor = require_roles(UserRole.manager, UserRole.owner)


def _active_rate(rates: list[EmployeeRate], for_date: date) -> EmployeeRate | None:
    applicable = [r for r in rates if r.effective_from <= for_date]
    return max(applicable, key=lambda r: r.effective_from) if applicable else None


def _shift_hours(s: Shift) -> float:
    """Вычисляет часы смены по total_minutes (основной источник по спецификации)."""
    if s.total_minutes is not None and s.total_minutes > 0:
        return s.total_minutes / 60.0
    if s.approved_hours is not None:
        return float(s.approved_hours)
    if s.total_hours_decimal is not None:
        return float(s.total_hours_decimal)
    return 0.0


def _fmt_time(t) -> str | None:
    """Форматирует объект time или datetime в строку HH:MM."""
    if t is None:
        return None
    if hasattr(t, 'strftime'):
        return t.strftime("%H:%M")
    return None


@router.get("/week")
async def get_week_schedule(
    branch_id: int,
    week_start: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """
    Вернуть плановый и фактический график сотрудников за неделю.
    week_start — любая дата; автоматически сдвигается на понедельник.
    """
    try:
        ws = date.fromisoformat(week_start)
    except ValueError:
        raise HTTPException(400, "Неверный формат даты week_start (ожидается YYYY-MM-DD)")

    # Сдвигаем на понедельник
    ws = ws - timedelta(days=ws.weekday())
    we = ws + timedelta(days=6)
    days = [str(ws + timedelta(days=i)) for i in range(7)]

    # Загружаем филиал
    branch_res = await db.execute(select(Branch).where(Branch.id == branch_id))
    branch = branch_res.scalar_one_or_none()
    if not branch:
        raise HTTPException(404, "Филиал не найден")

    # Загружаем активных сотрудников с позициями и ставками
    emp_res = await db.execute(
        select(Employee)
        .where(and_(Employee.branch_id == branch_id, Employee.is_active == True))  # noqa: E712
        .options(
            selectinload(Employee.position),
            selectinload(Employee.rates),
        )
        .order_by(Employee.full_name)
    )
    employees = emp_res.scalars().all()

    # Загружаем плановые записи за неделю
    plan_res = await db.execute(
        select(SchedulePlan).where(and_(
            SchedulePlan.branch_id == branch_id,
            SchedulePlan.date >= ws,
            SchedulePlan.date <= we,
        ))
    )
    plans = plan_res.scalars().all()
    plan_index: dict[tuple, SchedulePlan] = {}
    for p in plans:
        plan_index[(p.employee_id, str(p.date))] = p

    # Загружаем закрытые смены за неделю.
    # Только total_minutes > 0: исключаем технические/нулевые смены.
    shift_res = await db.execute(
        select(Shift).where(and_(
            Shift.branch_id == branch_id,
            Shift.date >= ws,
            Shift.date <= we,
            Shift.closed_at.isnot(None),
            Shift.total_minutes > 0,
        ))
    )
    shifts = shift_res.scalars().all()
    shift_index: dict[tuple, list[Shift]] = {}
    for s in shifts:
        key = (s.employee_id, str(s.date))
        shift_index.setdefault(key, []).append(s)

    today = date.today()
    employee_data = []

    for emp in employees:
        if emp.position is None:
            continue

        rate_entry = _active_rate(emp.rates, today)

        plans_dict: dict[str, dict | None] = {}
        actuals_dict: dict[str, dict | None] = {}
        debug_shifts: list[dict] = []

        for day_str in days:
            # ── Плановые данные ────────────────────────────────────────────────
            plan = plan_index.get((emp.id, day_str))
            if plan:
                plans_dict[day_str] = {
                    "plan_id": plan.id,
                    "planned_hours": float(plan.planned_hours),
                    "start_time": _fmt_time(plan.start_time),
                    "end_time": _fmt_time(plan.end_time),
                    "break_minutes": plan.break_minutes,
                    "comment": plan.comment or "",
                }
            else:
                plans_dict[day_str] = None

            # ── Фактические данные (из закрытых смен) ─────────────────────────
            # actual_hours = sum(total_minutes) / 60 (бонусы не включены)
            day_shifts = shift_index.get((emp.id, day_str), [])

            for s in day_shifts:
                debug_shifts.append({
                    "id": s.id,
                    "date": day_str,
                    "opened_at": s.opened_at.isoformat() if s.opened_at else None,
                    "closed_at": s.closed_at.isoformat() if s.closed_at else None,
                    "total_minutes": s.total_minutes,
                    "approved_hours": float(s.approved_hours) if s.approved_hours is not None else None,
                    "computed_hours": round(_shift_hours(s), 4),
                })

            if day_shifts:
                total_hours = sum(_shift_hours(s) for s in day_shifts)

                # Время первого открытия и последнего закрытия за день
                shifts_with_times = [s for s in day_shifts if s.opened_at and s.closed_at]
                first_opened: str | None = None
                last_closed: str | None = None
                if shifts_with_times:
                    first_opened = _fmt_time(min(s.opened_at for s in shifts_with_times))
                    last_closed = _fmt_time(max(s.closed_at for s in shifts_with_times))

                actuals_dict[day_str] = {
                    "approved_hours": round(total_hours, 2),
                    "shift_count": len(day_shifts),
                    "first_opened": first_opened,
                    "last_closed": last_closed,
                }
            else:
                actuals_dict[day_str] = None

        employee_data.append({
            "employee_id": emp.id,
            "employee_name": emp.full_name,
            "category": emp.position.category.value,
            "payment_type": emp.position.payment_type.value,
            "rate": float(rate_entry.rate) if rate_entry else 0.0,
            "fixed_daily_rate": float(rate_entry.fixed_daily_rate) if rate_entry and rate_entry.fixed_daily_rate else None,
            "plans": plans_dict,
            "actuals": actuals_dict,
            "debug_shifts": debug_shifts,
        })

    return {
        "week_start": str(ws),
        "week_end": str(we),
        "branch_id": branch_id,
        "branch_name": branch.name,
        "days": days,
        "employees": employee_data,
    }


@router.post("/save", response_model=ScheduleSaveResponse)
async def save_schedule(
    body: ScheduleSaveRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_schedule_editor),
):
    """
    Массовый upsert планового графика.
    Если resolved_hours() <= 0 — удаляет запись если она есть.
    planned_hours = end_time - start_time - break_minutes (если задано время).
    """
    saved = 0
    deleted = 0

    for entry in body.entries:
        try:
            entry_date = date.fromisoformat(entry.date)
        except ValueError:
            continue

        hours = entry.resolved_hours()

        result = await db.execute(
            select(SchedulePlan).where(and_(
                SchedulePlan.employee_id == entry.employee_id,
                SchedulePlan.date == entry_date,
            ))
        )
        existing = result.scalar_one_or_none()

        if hours <= 0:
            if existing:
                await db.delete(existing)
                deleted += 1
        else:
            # Парсим time-объекты для сохранения
            from datetime import time as time_cls
            start_t: time_cls | None = None
            end_t: time_cls | None = None
            if entry.start_time:
                sh, sm = [int(x) for x in entry.start_time.split(":")]
                start_t = time_cls(sh, sm)
            if entry.end_time:
                eh, em = [int(x) for x in entry.end_time.split(":")]
                end_t = time_cls(eh, em)

            if existing:
                existing.planned_hours = hours
                existing.start_time = start_t
                existing.end_time = end_t
                existing.break_minutes = entry.break_minutes
                existing.comment = entry.comment
                existing.updated_at = datetime.now(timezone.utc)
                saved += 1
            else:
                plan = SchedulePlan(
                    branch_id=body.branch_id,
                    employee_id=entry.employee_id,
                    date=entry_date,
                    planned_hours=hours,
                    start_time=start_t,
                    end_time=end_t,
                    break_minutes=entry.break_minutes,
                    comment=entry.comment,
                    created_by=current_user.id,
                )
                db.add(plan)
                saved += 1

    await db.commit()
    return ScheduleSaveResponse(saved=saved, deleted=deleted)


@router.delete("/entry/{plan_id}", status_code=204)
async def delete_schedule_entry(
    plan_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_schedule_editor),
):
    """Удалить конкретную запись плана."""
    result = await db.execute(select(SchedulePlan).where(SchedulePlan.id == plan_id))
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(404, "Запись не найдена")
    await db.delete(plan)
    await db.commit()
