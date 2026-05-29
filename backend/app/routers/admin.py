"""
Admin router: employee and position management.
Access: accountant + owner only.
"""
from datetime import date, timedelta, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.employee import Employee, EmployeeRate
from app.models.position import Position
from app.models.user import User
from app.dependencies import require_accountant
from app.schemas.admin import (
    EmployeeCreate, EmployeeUpdate, EmployeeListItem, EmployeeDetail,
    PositionCreate, PositionUpdate, PositionOut,
    RateCreate, RateOut,
)
from app.utils.security import hash_pin, make_pin_check

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
