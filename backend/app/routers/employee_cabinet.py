"""
Кабинет сотрудника — Блок 9.
Авторизация по employee_login + PIN, просмотр своих смен/начислений/графика.
Только чтение — редактирование запрещено.
"""
import calendar as cal_module
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.employee import Employee, EmployeeRate
from app.models.shift import Shift, ShiftStatus
from app.models.payroll import PayrollEntry
from app.models.schedule import SchedulePlan
from app.models.branch import Branch
from app.utils.security import verify_pin, create_access_token, decode_token

router = APIRouter(prefix="/employee", tags=["employee-cabinet"])
bearer = HTTPBearer(auto_error=False)

ZERO = Decimal("0")


# ── Зависимость: получить сотрудника из токена кабинета ──────────────────────

async def _get_employee_from_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> Employee:
    if not credentials:
        raise HTTPException(401, "Необходима авторизация")
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "employee":
        raise HTTPException(401, "Неверный токен")
    emp_id = payload.get("employee_id")
    if not emp_id:
        raise HTTPException(401, "Неверный токен")

    res = await db.execute(
        select(Employee)
        .options(
            selectinload(Employee.position),
            selectinload(Employee.branch),
            selectinload(Employee.rates),
        )
        .where(and_(Employee.id == int(emp_id), Employee.is_active == True))  # noqa: E712
    )
    emp = res.scalar_one_or_none()
    if not emp:
        raise HTTPException(401, "Сотрудник не найден или неактивен")
    return emp


def _current_rate(emp: Employee, for_date: date | None = None) -> EmployeeRate | None:
    d = for_date or date.today()
    applicable = [r for r in emp.rates if r.effective_from <= d]
    return max(applicable, key=lambda r: r.effective_from) if applicable else (emp.rates[0] if emp.rates else None)


# ── Авторизация ───────────────────────────────────────────────────────────────

@router.post("/login")
async def employee_login(body: dict, db: AsyncSession = Depends(get_db)):
    """
    Вход по логину + PIN.
    login = employee_login (задаётся бухгалтером в карточке сотрудника).
    """
    login = (body.get("login") or "").strip()
    pin = body.get("pin", "")

    if not login or not pin:
        raise HTTPException(400, "Введите логин и PIN")

    # Найти сотрудника по employee_login
    res = await db.execute(
        select(Employee)
        .options(selectinload(Employee.position), selectinload(Employee.branch), selectinload(Employee.rates))
        .where(and_(Employee.employee_login == login, Employee.is_active == True))  # noqa: E712
    )
    emp = res.scalar_one_or_none()

    if not emp or not verify_pin(pin, emp.pin_hash):
        raise HTTPException(401, "Неверный логин или PIN")

    token = create_access_token({
        "sub": str(emp.id),
        "employee_id": emp.id,
        "type": "employee",
        "full_name": emp.full_name,
    })

    rate = _current_rate(emp)
    return {
        "access_token": token,
        "employee_id": emp.id,
        "full_name": emp.full_name,
        "position": emp.position.name if emp.position else "—",
        "branch": emp.branch.name if emp.branch else "—",
        "rate": float(rate.rate) if rate else None,
        "payment_type": emp.position.payment_type.value if emp.position else None,
    }


# ── Профиль ───────────────────────────────────────────────────────────────────

@router.get("/me")
async def get_profile(emp: Employee = Depends(_get_employee_from_token)):
    """Профиль сотрудника — базовая информация."""
    rate = _current_rate(emp)
    return {
        "id": emp.id,
        "full_name": emp.full_name,
        "position": emp.position.name if emp.position else "—",
        "category": emp.position.category.value if emp.position else "—",
        "payment_type": emp.position.payment_type.value if emp.position else "—",
        "branch": emp.branch.name if emp.branch else "—",
        "is_cashier": emp.is_cashier,
        "rate": float(rate.rate) if rate else None,
        "fixed_daily_rate": float(rate.fixed_daily_rate) if rate and rate.fixed_daily_rate else None,
        "rate_since": str(rate.effective_from) if rate else None,
    }


# ── Начисления за месяц ────────────────────────────────────────────────────────

@router.get("/me/payroll")
async def get_payroll(
    year: int | None = None,
    month: int | None = None,
    emp: Employee = Depends(_get_employee_from_token),
    db: AsyncSession = Depends(get_db),
):
    """Начисления за месяц с прогнозом."""
    today = date.today()
    y = year or today.year
    m = month or today.month
    from_date = date(y, m, 1)
    to_date = date(y, m, cal_module.monthrange(y, m)[1])

    entries_res = await db.execute(
        select(PayrollEntry).where(
            and_(
                PayrollEntry.employee_id == emp.id,
                PayrollEntry.date >= from_date,
                PayrollEntry.date <= to_date,
            )
        ).order_by(PayrollEntry.date)
    )
    entries = entries_res.scalars().all()

    total_hours = sum(float(e.approved_hours or 0) for e in entries)
    total_pay = sum(float(e.total_pay or 0) for e in entries)
    days_worked = len(entries)

    # Прогноз до конца месяца
    days_elapsed = (today - from_date).days + 1
    days_in_month = to_date.day
    projected = None
    if days_worked > 0 and m == today.month and y == today.year:
        daily_avg = total_pay / days_worked
        projected = round(daily_avg * days_in_month, 2)

    return {
        "year": y, "month": m,
        "from_date": str(from_date), "to_date": str(to_date),
        "days_worked": days_worked,
        "total_hours": round(total_hours, 2),
        "total_pay": round(total_pay, 2),
        "projected_pay": projected,
        "days_elapsed": days_elapsed,
        "days_in_month": days_in_month,
        "entries": [
            {
                "date": str(e.date),
                "hours": float(e.approved_hours or 0),
                "base_pay": float(e.base_pay or 0),
                "bonus": float(e.bonus or 0),
                "total_pay": float(e.total_pay or 0),
                "is_corrected": e.is_corrected,
            }
            for e in entries
        ],
    }


# ── История смен ──────────────────────────────────────────────────────────────

@router.get("/me/shifts")
async def get_shifts(
    year: int | None = None,
    month: int | None = None,
    emp: Employee = Depends(_get_employee_from_token),
    db: AsyncSession = Depends(get_db),
):
    """История смен за месяц."""
    today = date.today()
    y = year or today.year
    m = month or today.month
    from_date = date(y, m, 1)
    to_date = date(y, m, cal_module.monthrange(y, m)[1])

    shifts_res = await db.execute(
        select(Shift).options(selectinload(Shift.payroll_entry)).where(
            and_(
                Shift.employee_id == emp.id,
                Shift.date >= from_date,
                Shift.date <= to_date,
            )
        ).order_by(Shift.date.desc(), Shift.opened_at.desc())
    )
    shifts = shifts_res.scalars().all()

    def hours(s: Shift) -> float | None:
        if s.approved_hours is not None:
            return float(s.approved_hours)
        if s.closed_at and s.opened_at:
            opened = s.opened_at
            closed = s.closed_at
            if opened.tzinfo is None:
                opened = opened.replace(tzinfo=timezone.utc)
            if closed.tzinfo is None:
                closed = closed.replace(tzinfo=timezone.utc)
            return round((closed - opened).total_seconds() / 3600, 2)
        return None

    return {
        "year": y, "month": m,
        "shifts": [
            {
                "id": s.id,
                "date": str(s.date),
                "status": s.status.value,
                "is_extra_shift": s.is_extra_shift,
                "opened_at": s.opened_at.isoformat() if s.opened_at else None,
                "closed_at": s.closed_at.isoformat() if s.closed_at else None,
                "hours": hours(s),
                "total_pay": float(s.payroll_entry.total_pay) if s.payroll_entry else None,
                "is_corrected": s.payroll_entry.is_corrected if s.payroll_entry else False,
                "anomaly_flag": s.anomaly_flag,
                "note": s.note,
            }
            for s in shifts
        ],
    }


# ── График (расписание) ────────────────────────────────────────────────────────

@router.get("/me/schedule")
async def get_schedule(
    week_start: date | None = None,
    emp: Employee = Depends(_get_employee_from_token),
    db: AsyncSession = Depends(get_db),
):
    """График сотрудника на неделю (план + факт)."""
    today = date.today()
    if week_start is None:
        week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)

    plans_res = await db.execute(
        select(SchedulePlan).where(
            and_(
                SchedulePlan.employee_id == emp.id,
                SchedulePlan.date >= week_start,
                SchedulePlan.date <= week_end,
            )
        )
    )
    plans = {p.date: p for p in plans_res.scalars().all()}

    shifts_res = await db.execute(
        select(Shift).where(
            and_(
                Shift.employee_id == emp.id,
                Shift.date >= week_start,
                Shift.date <= week_end,
            )
        ).order_by(Shift.date)
    )
    shifts_by_date: dict[date, list[Shift]] = {}
    for s in shifts_res.scalars().all():
        shifts_by_date.setdefault(s.date, []).append(s)

    WDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
    days = []
    for i in range(7):
        d = week_start + timedelta(days=i)
        plan = plans.get(d)
        day_shifts = shifts_by_date.get(d, [])
        actual_hours = sum(
            float(s.approved_hours or 0) if s.approved_hours is not None
            else (round((s.closed_at - s.opened_at).total_seconds() / 3600, 2) if s.closed_at and s.opened_at else 0)
            for s in day_shifts
        )
        days.append({
            "date": str(d),
            "weekday": WDAYS[d.weekday()],
            "is_today": d == today,
            "is_past": d < today,
            "plan_hours": float(plan.planned_hours) if plan else None,
            "plan_start": str(plan.start_time) if plan and plan.start_time else None,
            "plan_end": str(plan.end_time) if plan and plan.end_time else None,
            "actual_hours": round(actual_hours, 2) if day_shifts else None,
            "has_open_shift": any(s.status == ShiftStatus.open for s in day_shifts),
            "shifts_count": len(day_shifts),
        })

    return {
        "week_start": str(week_start),
        "week_end": str(week_end),
        "employee_name": emp.full_name,
        "days": days,
    }
