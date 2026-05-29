"""
Admin router: employee and position management.
Access: accountant + owner only.
"""
import calendar
from datetime import date, timedelta, datetime, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func, delete
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.employee import Employee, EmployeeRate
from app.models.position import Position, PositionCategory
from app.models.user import User
from app.models.shift import Shift, ShiftStatus
from app.models.payroll import PayrollEntry, FotSummary, FotStatus
from app.models.report import BranchDailyReport
from app.models.schedule import SchedulePlan
from app.models.branch import Branch
from app.dependencies import require_accountant, require_manager
from app.schemas.admin import (
    EmployeeCreate, EmployeeUpdate, EmployeeListItem, EmployeeDetail,
    PositionCreate, PositionUpdate, PositionOut,
    RateCreate, RateOut,
)
from app.utils.security import hash_pin, make_pin_check

ZERO = Decimal("0")


def _fot_status_total(pct: Decimal) -> FotStatus:
    if pct < Decimal("27.5"): return FotStatus.green
    if pct <= Decimal("29"): return FotStatus.yellow
    return FotStatus.red


def _fot_status_kitchen(pct: Decimal) -> FotStatus:
    if pct < Decimal("14.5"): return FotStatus.green
    if pct <= Decimal("15.5"): return FotStatus.yellow
    return FotStatus.red


async def _recalculate_fot_summary(db: AsyncSession, branch_id: int, work_date: date) -> None:
    """Пересчитать FotSummary на основе всех PayrollEntry за день (включая скорректированные)."""
    # Получить выручку из отчёта
    report_res = await db.execute(
        select(BranchDailyReport).where(
            and_(BranchDailyReport.branch_id == branch_id, BranchDailyReport.date == work_date)
        )
    )
    report = report_res.scalar_one_or_none()
    revenue = report.revenue if report else ZERO

    # Загрузить все PayrollEntry за день
    entries_res = await db.execute(
        select(PayrollEntry)
        .options(selectinload(PayrollEntry.employee).selectinload(Employee.position))
        .where(and_(PayrollEntry.branch_id == branch_id, PayrollEntry.date == work_date))
    )
    entries = entries_res.scalars().all()

    # Суммировать по категориям
    cat_fot: dict[str, Decimal] = {c.value: ZERO for c in PositionCategory}
    total_fot = ZERO
    for e in entries:
        total_fot += e.total_pay
        if e.employee and e.employee.position:
            cat = e.employee.position.category.value
            cat_fot[cat] = cat_fot.get(cat, ZERO) + e.total_pay

    kitchen_fot = cat_fot.get("kitchen", ZERO)

    def safe_pct(num: Decimal, den: Decimal) -> Decimal:
        return round(num / den * 100, 2) if den else ZERO

    total_pct = safe_pct(total_fot, revenue)
    kitchen_pct = safe_pct(kitchen_fot, revenue)

    # Удалить старый FotSummary и создать новый
    await db.execute(
        delete(FotSummary).where(
            and_(FotSummary.branch_id == branch_id, FotSummary.date == work_date)
        )
    )
    fs = FotSummary(
        branch_id=branch_id,
        date=work_date,
        daily_report_id=report.id if report else None,
        revenue=revenue,
        total_fot=round(total_fot, 2),
        kitchen_fot=round(kitchen_fot, 2),
        admin_fot=round(cat_fot.get("admin", ZERO), 2),
        tech_fot=round(cat_fot.get("tech", ZERO), 2),
        courier_fot=round(cat_fot.get("courier", ZERO), 2),
        reserve_fot=round(cat_fot.get("reserve", ZERO), 2),
        total_fot_pct=total_pct,
        kitchen_fot_pct=kitchen_pct,
        status_total=_fot_status_total(total_pct),
        status_kitchen=_fot_status_kitchen(kitchen_pct),
    )
    db.add(fs)
    await db.flush()

router = APIRouter(prefix="/admin", tags=["admin"])


# ══════════════════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════════════════

def _current_rate(rates: list[EmployeeRate]) -> EmployeeRate | None:
    """Return the active (date_to IS NULL) rate, or the most recent by effective_from."""
    active = [r for r in rates if r.date_to is None]
    if active:
        return max(active, key=lambda r: r.effective_from)
    return max(rates, key=lambda r: r.effective_from) if rates else None


def _build_list_item(emp: Employee) -> dict:
    rate = _current_rate(emp.rates)
    return {
        "id": emp.id,
        "full_name": emp.full_name,
        "branch_id": emp.branch_id,
        "is_cashier": emp.is_cashier,
        "is_active": emp.is_active,
        "comment": emp.comment,
        "position_id": emp.position_id,
        "position_name": emp.position.name if emp.position else None,
        "category": emp.position.category.value if emp.position else None,
        "payment_type": emp.position.payment_type.value if emp.position else None,
        "current_rate": float(rate.rate) if rate else None,
        "current_fixed_daily_rate": float(rate.fixed_daily_rate) if rate and rate.fixed_daily_rate else None,
    }


async def _check_pin_unique(
    db: AsyncSession, pin: str, branch_id: int, exclude_employee_id: int | None = None
) -> None:
    """Raise 409 if pin_check already exists in this branch (for another employee)."""
    check = make_pin_check(pin)
    q = select(Employee).where(
        and_(Employee.pin_check == check, Employee.branch_id == branch_id)
    )
    if exclude_employee_id:
        q = q.where(Employee.id != exclude_employee_id)
    result = await db.execute(q)
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(409, f"PIN уже используется сотрудником «{existing.full_name}»")


# ══════════════════════════════════════════════════════════════════════════════
# Positions
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/positions", response_model=list[PositionOut])
async def list_positions(
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_accountant),
):
    q = select(Position)
    if not include_inactive:
        q = q.where(Position.is_active == True)  # noqa: E712
    q = q.order_by(Position.category, Position.name)
    result = await db.execute(q)
    positions = result.scalars().all()

    # Count active employees per position
    counts_res = await db.execute(
        select(Employee.position_id, func.count(Employee.id))
        .where(Employee.is_active == True)  # noqa: E712
        .group_by(Employee.position_id)
    )
    counts = dict(counts_res.all())

    return [
        PositionOut(
            id=p.id,
            name=p.name,
            category=p.category.value,
            payment_type=p.payment_type.value,
            is_active=p.is_active,
            employee_count=counts.get(p.id, 0),
        )
        for p in positions
    ]


@router.post("/positions", response_model=PositionOut, status_code=201)
async def create_position(
    body: PositionCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_accountant),
):
    pos = Position(
        name=body.name.strip(),
        category=body.category,
        payment_type=body.payment_type,
        is_active=True,
    )
    db.add(pos)
    await db.commit()
    await db.refresh(pos)
    return PositionOut(
        id=pos.id, name=pos.name,
        category=pos.category.value, payment_type=pos.payment_type.value,
        is_active=pos.is_active, employee_count=0,
    )


@router.put("/positions/{position_id}", response_model=PositionOut)
async def update_position(
    position_id: int,
    body: PositionUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_accountant),
):
    result = await db.execute(select(Position).where(Position.id == position_id))
    pos = result.scalar_one_or_none()
    if not pos:
        raise HTTPException(404, "Должность не найдена")

    if body.name is not None:
        pos.name = body.name.strip()
    if body.category is not None:
        pos.category = body.category
    if body.payment_type is not None:
        pos.payment_type = body.payment_type
    if body.is_active is not None:
        if not body.is_active:
            # Check no active employees on this position
            count_res = await db.execute(
                select(func.count(Employee.id)).where(
                    and_(Employee.position_id == position_id, Employee.is_active == True)  # noqa: E712
                )
            )
            if count_res.scalar() > 0:
                raise HTTPException(409, "Нельзя отключить должность — есть активные сотрудники")
        pos.is_active = body.is_active

    await db.commit()
    await db.refresh(pos)

    count_res = await db.execute(
        select(func.count(Employee.id)).where(
            and_(Employee.position_id == position_id, Employee.is_active == True)  # noqa: E712
        )
    )
    return PositionOut(
        id=pos.id, name=pos.name,
        category=pos.category.value, payment_type=pos.payment_type.value,
        is_active=pos.is_active, employee_count=count_res.scalar() or 0,
    )


# ══════════════════════════════════════════════════════════════════════════════
# Employees — list & create
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/employees", response_model=list[EmployeeListItem])
async def list_employees(
    branch_id: int | None = None,
    status: str = Query("active", pattern="^(active|dismissed|all)$"),
    category: str | None = None,
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_accountant),
):
    q = (
        select(Employee)
        .options(selectinload(Employee.position), selectinload(Employee.rates))
        .order_by(Employee.full_name)
    )
    if branch_id:
        q = q.where(Employee.branch_id == branch_id)
    if status == "active":
        q = q.where(Employee.is_active == True)  # noqa: E712
    elif status == "dismissed":
        q = q.where(Employee.is_active == False)  # noqa: E712

    result = await db.execute(q)
    employees = result.scalars().all()

    items = []
    for emp in employees:
        if category and (emp.position is None or emp.position.category.value != category):
            continue
        if search and search.lower() not in emp.full_name.lower():
            continue
        items.append(_build_list_item(emp))

    return items


@router.post("/employees", response_model=EmployeeListItem, status_code=201)
async def create_employee(
    body: EmployeeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_accountant),
):
    # Validate position exists and is active
    pos_res = await db.execute(select(Position).where(Position.id == body.position_id))
    pos = pos_res.scalar_one_or_none()
    if not pos:
        raise HTTPException(404, "Должность не найдена")
    if not pos.is_active:
        raise HTTPException(400, "Должность неактивна")

    # Check PIN uniqueness within branch
    await _check_pin_unique(db, body.pin, body.branch_id)

    emp = Employee(
        full_name=body.full_name.strip(),
        pin_hash=hash_pin(body.pin),
        pin_check=make_pin_check(body.pin),
        position_id=body.position_id,
        branch_id=body.branch_id,
        is_cashier=body.is_cashier,
        is_active=True,
        comment=body.comment,
    )
    db.add(emp)
    await db.flush()  # get emp.id

    rate = EmployeeRate(
        employee_id=emp.id,
        rate=body.rate,
        fixed_daily_rate=body.fixed_daily_rate,
        effective_from=body.effective_from,
        date_to=None,
        created_by=current_user.id,
    )
    db.add(rate)
    await db.commit()

    # Reload with relationships
    res = await db.execute(
        select(Employee)
        .where(Employee.id == emp.id)
        .options(selectinload(Employee.position), selectinload(Employee.rates))
    )
    emp = res.scalar_one()
    return _build_list_item(emp)


# ══════════════════════════════════════════════════════════════════════════════
# Employees — detail, update, dismiss
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/employees/{employee_id}", response_model=EmployeeDetail)
async def get_employee(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_accountant),
):
    res = await db.execute(
        select(Employee)
        .where(Employee.id == employee_id)
        .options(selectinload(Employee.position), selectinload(Employee.rates))
    )
    emp = res.scalar_one_or_none()
    if not emp:
        raise HTTPException(404, "Сотрудник не найден")

    base = _build_list_item(emp)

    # Build rate history with creator names
    users_res = await db.execute(
        select(User.id, User.full_name).where(
            User.id.in_([r.created_by for r in emp.rates])
        )
    )
    user_names = dict(users_res.all())

    rates = [
        RateOut(
            id=r.id,
            rate=r.rate,
            fixed_daily_rate=r.fixed_daily_rate,
            effective_from=r.effective_from,
            date_to=r.date_to,
            created_by=r.created_by,
            created_by_name=user_names.get(r.created_by),
            created_at=r.created_at,
        )
        for r in sorted(emp.rates, key=lambda x: x.effective_from, reverse=True)
    ]

    return EmployeeDetail(**base, created_at=emp.created_at, rates=rates)


@router.put("/employees/{employee_id}", response_model=EmployeeListItem)
async def update_employee(
    employee_id: int,
    body: EmployeeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_accountant),
):
    res = await db.execute(
        select(Employee)
        .where(Employee.id == employee_id)
        .options(selectinload(Employee.position), selectinload(Employee.rates))
    )
    emp = res.scalar_one_or_none()
    if not emp:
        raise HTTPException(404, "Сотрудник не найден")

    if body.full_name is not None:
        emp.full_name = body.full_name.strip()

    if body.pin is not None:
        await _check_pin_unique(db, body.pin, emp.branch_id, exclude_employee_id=employee_id)
        emp.pin_hash = hash_pin(body.pin)
        emp.pin_check = make_pin_check(body.pin)

    if body.position_id is not None:
        pos_res = await db.execute(select(Position).where(Position.id == body.position_id))
        pos = pos_res.scalar_one_or_none()
        if not pos:
            raise HTTPException(404, "Должность не найдена")
        emp.position_id = body.position_id

    if body.is_cashier is not None:
        emp.is_cashier = body.is_cashier

    if body.comment is not None:
        emp.comment = body.comment

    await db.commit()

    res = await db.execute(
        select(Employee)
        .where(Employee.id == employee_id)
        .options(selectinload(Employee.position), selectinload(Employee.rates))
    )
    emp = res.scalar_one()
    return _build_list_item(emp)


@router.post("/employees/{employee_id}/dismiss", response_model=EmployeeListItem)
async def dismiss_employee(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_accountant),
):
    res = await db.execute(
        select(Employee)
        .where(Employee.id == employee_id)
        .options(selectinload(Employee.position), selectinload(Employee.rates))
    )
    emp = res.scalar_one_or_none()
    if not emp:
        raise HTTPException(404, "Сотрудник не найден")
    emp.is_active = False
    await db.commit()
    await db.refresh(emp)
    return _build_list_item(emp)


@router.post("/employees/{employee_id}/activate", response_model=EmployeeListItem)
async def activate_employee(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_accountant),
):
    res = await db.execute(
        select(Employee)
        .where(Employee.id == employee_id)
        .options(selectinload(Employee.position), selectinload(Employee.rates))
    )
    emp = res.scalar_one_or_none()
    if not emp:
        raise HTTPException(404, "Сотрудник не найден")
    emp.is_active = True
    await db.commit()
    await db.refresh(emp)
    return _build_list_item(emp)


# ══════════════════════════════════════════════════════════════════════════════
# Shifts — list, correct, manual close
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/shifts")
async def list_shifts_admin(
    from_date: date,
    to_date: date,
    branch_id: int | None = None,
    employee_id: int | None = None,
    status: str | None = Query(None, pattern="^(open|closed)$"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_accountant),
):
    q = (
        select(Shift)
        .options(
            selectinload(Shift.employee).selectinload(Employee.position),
            selectinload(Shift.branch),
            selectinload(Shift.payroll_entry),
        )
        .where(and_(Shift.date >= from_date, Shift.date <= to_date))
        .order_by(Shift.date.desc(), Shift.opened_at.desc())
    )
    if branch_id:
        q = q.where(Shift.branch_id == branch_id)
    if employee_id:
        q = q.where(Shift.employee_id == employee_id)
    if status:
        q = q.where(Shift.status == status)
    shifts = (await db.execute(q)).scalars().all()

    return [
        {
            "id": s.id,
            "employee_id": s.employee_id,
            "employee_name": s.employee.full_name if s.employee else "—",
            "branch_id": s.branch_id,
            "branch_name": s.branch.name if s.branch else "—",
            "date": str(s.date),
            "opened_at": s.opened_at.isoformat() if s.opened_at else None,
            "closed_at": s.closed_at.isoformat() if s.closed_at else None,
            "approved_hours": float(s.approved_hours) if s.approved_hours is not None else None,
            "status": s.status.value,
            "is_corrected": s.payroll_entry.is_corrected if s.payroll_entry else False,
            "note": s.note,
        }
        for s in shifts
    ]


@router.patch("/shifts/{shift_id}")
async def correct_shift(
    shift_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_accountant),
):
    """Скорректировать часы или вручную закрыть смену. approved_hours=0 → убрать из расчёта."""
    approved_hours = Decimal(str(body.get("approved_hours", 0)))
    note = body.get("note", "")

    # Загрузить смену
    shift_res = await db.execute(
        select(Shift)
        .options(
            selectinload(Shift.employee).selectinload(Employee.position),
            selectinload(Shift.employee).selectinload(Employee.rates),
            selectinload(Shift.payroll_entry),
        )
        .where(Shift.id == shift_id)
    )
    shift = shift_res.scalar_one_or_none()
    if not shift:
        raise HTTPException(404, "Смена не найдена")

    # Обновить смену
    shift.approved_hours = approved_hours
    shift.status = ShiftStatus.closed
    if note:
        shift.note = note
    if not shift.closed_at:
        shift.closed_at = datetime.now(timezone.utc)

    await db.flush()

    # Пересчитать PayrollEntry
    emp = shift.employee
    pos = emp.position if emp else None
    rate_entry = None
    if emp and emp.rates:
        applicable = [r for r in emp.rates if r.effective_from <= shift.date]
        rate_entry = max(applicable, key=lambda r: r.effective_from) if applicable else None

    now = datetime.now(timezone.utc)
    pe = shift.payroll_entry

    if approved_hours > ZERO and rate_entry and pos:
        from app.models.position import PaymentType
        if pos.payment_type == PaymentType.fixed_daily:
            base_pay = rate_entry.fixed_daily_rate or rate_entry.rate
        else:
            base_pay = round((rate_entry.rate / Decimal("60")) * (approved_hours * 60), 2)
        bonus = pe.bonus if pe else ZERO
        total_pay = base_pay + bonus

        if pe:
            pe.approved_hours = approved_hours
            pe.hours_worked = approved_hours
            pe.base_pay = base_pay
            pe.total_pay = total_pay
            pe.is_corrected = True
            pe.corrected_by = current_user.id
            pe.corrected_at = now
            pe.notes = note or pe.notes
        else:
            new_pe = PayrollEntry(
                employee_id=shift.employee_id,
                branch_id=shift.branch_id,
                date=shift.date,
                shift_id=shift.id,
                hours_worked=approved_hours,
                approved_hours=approved_hours,
                rate=rate_entry.rate,
                base_pay=base_pay,
                bonus=ZERO,
                total_pay=total_pay,
                payment_type=pos.payment_type.value,
                is_corrected=True,
                corrected_by=current_user.id,
                corrected_at=now,
                notes=note,
            )
            db.add(new_pe)
    elif pe:
        # approved_hours == 0 → удалить запись из расчёта
        pe.approved_hours = ZERO
        pe.hours_worked = ZERO
        pe.base_pay = ZERO
        pe.total_pay = ZERO
        pe.is_corrected = True
        pe.corrected_by = current_user.id
        pe.corrected_at = now
        pe.notes = note or pe.notes

    await db.flush()
    await _recalculate_fot_summary(db, shift.branch_id, shift.date)
    await db.commit()

    return {"ok": True, "shift_id": shift_id, "approved_hours": float(approved_hours)}


# ══════════════════════════════════════════════════════════════════════════════
# Monthly report
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/monthly-report")
async def get_monthly_report(
    year: int,
    month: int,
    branch_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_accountant),
):
    from_date = date(year, month, 1)
    to_date = date(year, month, calendar.monthrange(year, month)[1])

    q = (
        select(PayrollEntry)
        .options(
            selectinload(PayrollEntry.employee).selectinload(Employee.position),
            selectinload(PayrollEntry.employee).selectinload(Employee.rates),
        )
        .where(and_(PayrollEntry.date >= from_date, PayrollEntry.date <= to_date))
    )
    if branch_id:
        q = q.where(PayrollEntry.branch_id == branch_id)
    entries = (await db.execute(q)).scalars().all()

    # Группировать по сотруднику
    by_emp: dict[int, list] = {}
    for e in entries:
        by_emp.setdefault(e.employee_id, []).append(e)

    rows = []
    for emp_id, emp_entries in sorted(by_emp.items(), key=lambda x: x[1][0].employee.full_name if x[1][0].employee else ""):
        emp = emp_entries[0].employee
        pos = emp.position if emp else None
        rows.append({
            "employee_id": emp_id,
            "employee_name": emp.full_name if emp else "—",
            "position": pos.name if pos else "—",
            "category": pos.category.value if pos else "—",
            "payment_type": emp_entries[0].payment_type,
            "rate": float(emp_entries[0].rate),
            "days_worked": len(emp_entries),
            "total_hours": float(sum(e.approved_hours for e in emp_entries)),
            "base_pay": float(sum(e.base_pay for e in emp_entries)),
            "bonus": float(sum(e.bonus for e in emp_entries)),
            "total_pay": float(sum(e.total_pay for e in emp_entries)),
            "has_corrections": any(e.is_corrected for e in emp_entries),
        })

    return {
        "year": year,
        "month": month,
        "branch_id": branch_id,
        "rows": rows,
        "total_hours": sum(r["total_hours"] for r in rows),
        "total_pay": sum(r["total_pay"] for r in rows),
    }


# ══════════════════════════════════════════════════════════════════════════════
# Corrections log
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/corrections-log")
async def corrections_log(
    from_date: date,
    to_date: date,
    branch_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_accountant),
):
    q = (
        select(PayrollEntry)
        .options(
            selectinload(PayrollEntry.employee),
            selectinload(PayrollEntry.corrected_by_user),
        )
        .where(
            and_(
                PayrollEntry.is_corrected == True,  # noqa: E712
                PayrollEntry.date >= from_date,
                PayrollEntry.date <= to_date,
            )
        )
        .order_by(PayrollEntry.corrected_at.desc())
    )
    if branch_id:
        q = q.where(PayrollEntry.branch_id == branch_id)
    entries = (await db.execute(q)).scalars().all()

    return [
        {
            "id": e.id,
            "date": str(e.date),
            "employee_name": e.employee.full_name if e.employee else "—",
            "approved_hours": float(e.approved_hours),
            "total_pay": float(e.total_pay),
            "notes": e.notes,
            "corrected_by": e.corrected_by_user.username if e.corrected_by_user else "—",
            "corrected_at": e.corrected_at.isoformat() if e.corrected_at else None,
        }
        for e in entries
    ]


# ══════════════════════════════════════════════════════════════════════════════
# Plan vs Fact
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/plan-vs-fact")
async def plan_vs_fact(
    week_start: date,
    branch_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_manager),
):
    week_end = week_start + timedelta(days=6)

    plans_res = await db.execute(
        select(SchedulePlan)
        .options(selectinload(SchedulePlan.employee))
        .where(
            and_(
                SchedulePlan.branch_id == branch_id,
                SchedulePlan.date >= week_start,
                SchedulePlan.date <= week_end,
            )
        )
    )
    plans = plans_res.scalars().all()

    shifts_res = await db.execute(
        select(Shift)
        .options(selectinload(Shift.employee))
        .where(
            and_(
                Shift.branch_id == branch_id,
                Shift.date >= week_start,
                Shift.date <= week_end,
                Shift.status == ShiftStatus.closed,
            )
        )
    )
    shifts = shifts_res.scalars().all()

    # Агрегировать по сотруднику
    by_emp: dict[int, dict] = {}
    for p in plans:
        eid = p.employee_id
        if eid not in by_emp:
            by_emp[eid] = {"employee_name": p.employee.full_name if p.employee else "—", "planned": ZERO, "actual": ZERO}
        by_emp[eid]["planned"] += p.planned_hours

    for s in shifts:
        eid = s.employee_id
        hours = s.approved_hours or ZERO
        if eid not in by_emp:
            by_emp[eid] = {"employee_name": s.employee.full_name if s.employee else "—", "planned": ZERO, "actual": ZERO}
        by_emp[eid]["actual"] += hours

    rows = sorted(
        [
            {
                "employee_id": eid,
                "employee_name": d["employee_name"],
                "planned_hours": float(d["planned"]),
                "actual_hours": float(d["actual"]),
                "diff": float(d["actual"] - d["planned"]),
            }
            for eid, d in by_emp.items()
        ],
        key=lambda r: r["employee_name"],
    )
    return {"week_start": str(week_start), "week_end": str(week_end), "branch_id": branch_id, "rows": rows}


# ══════════════════════════════════════════════════════════════════════════════
# Violations — сотрудники с незакрытыми/пропущенными сменами
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/violations")
async def get_violations(
    from_date: date,
    to_date: date,
    branch_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_accountant),
):
    today = date.today()

    # Незакрытые смены (open) за прошлые дни
    q_open = (
        select(Shift)
        .options(selectinload(Shift.employee), selectinload(Shift.branch))
        .where(
            and_(
                Shift.date >= from_date,
                Shift.date < today,  # не сегодняшние
                Shift.status == ShiftStatus.open,
            )
        )
    )
    if branch_id:
        q_open = q_open.where(Shift.branch_id == branch_id)
    open_shifts = (await db.execute(q_open)).scalars().all()

    # Ручные закрытия бухгалтером (is_corrected=True за период)
    q_corr = (
        select(PayrollEntry)
        .options(selectinload(PayrollEntry.employee))
        .where(
            and_(
                PayrollEntry.is_corrected == True,  # noqa: E712
                PayrollEntry.date >= from_date,
                PayrollEntry.date <= to_date,
            )
        )
    )
    if branch_id:
        q_corr = q_corr.where(PayrollEntry.branch_id == branch_id)
    corrections = (await db.execute(q_corr)).scalars().all()

    # Агрегировать по сотруднику
    by_emp: dict[int, dict] = {}

    for s in open_shifts:
        eid = s.employee_id
        if eid not in by_emp:
            by_emp[eid] = {
                "employee_id": eid,
                "employee_name": s.employee.full_name if s.employee else "—",
                "branch_name": s.branch.name if s.branch else "—",
                "unclosed": 0,
                "manual_closed": 0,
                "last_incident": str(s.date),
            }
        by_emp[eid]["unclosed"] += 1
        if str(s.date) > by_emp[eid]["last_incident"]:
            by_emp[eid]["last_incident"] = str(s.date)

    for e in corrections:
        eid = e.employee_id
        if eid not in by_emp:
            by_emp[eid] = {
                "employee_id": eid,
                "employee_name": e.employee.full_name if e.employee else "—",
                "branch_name": "—",
                "unclosed": 0,
                "manual_closed": 0,
                "last_incident": str(e.date),
            }
        by_emp[eid]["manual_closed"] += 1
        if str(e.date) > by_emp[eid]["last_incident"]:
            by_emp[eid]["last_incident"] = str(e.date)

    rows = sorted(
        [
            {**d, "total": d["unclosed"] + d["manual_closed"]}
            for d in by_emp.values()
            if d["unclosed"] + d["manual_closed"] > 0
        ],
        key=lambda r: -r["total"],
    )
    return rows


# ══════════════════════════════════════════════════════════════════════════════
# Rate management
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/employees/{employee_id}/rates", response_model=RateOut, status_code=201)
async def add_rate(
    employee_id: int,
    body: RateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_accountant),
):
    res = await db.execute(
        select(Employee)
        .where(Employee.id == employee_id)
        .options(selectinload(Employee.rates))
    )
    emp = res.scalar_one_or_none()
    if not emp:
        raise HTTPException(404, "Сотрудник не найден")

    # Close the current active rate (date_to = new effective_from - 1 day)
    active_rates = [r for r in emp.rates if r.date_to is None]
    for r in active_rates:
        if r.effective_from >= body.effective_from:
            raise HTTPException(
                400,
                f"Новая ставка должна начинаться позже текущей "
                f"(текущая с {r.effective_from})"
            )
        r.date_to = body.effective_from - timedelta(days=1)

    new_rate = EmployeeRate(
        employee_id=employee_id,
        rate=body.rate,
        fixed_daily_rate=body.fixed_daily_rate,
        effective_from=body.effective_from,
        date_to=None,
        created_by=current_user.id,
    )
    db.add(new_rate)
    await db.commit()
    await db.refresh(new_rate)

    return RateOut(
        id=new_rate.id,
        rate=new_rate.rate,
        fixed_daily_rate=new_rate.fixed_daily_rate,
        effective_from=new_rate.effective_from,
        date_to=new_rate.date_to,
        created_by=new_rate.created_by,
        created_by_name=current_user.full_name,
        created_at=new_rate.created_at,
    )
