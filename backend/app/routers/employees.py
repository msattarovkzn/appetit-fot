from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.employee import Employee, EmployeeRate
from app.models.user import User
from app.dependencies import require_manager, require_accountant
from app.schemas.employee import (
    EmployeeCreate, EmployeeUpdate, EmployeeOut,
    EmployeeRateCreate, EmployeeRateOut,
)
from app.utils.security import hash_pin
from app.services.audit import log_action

router = APIRouter(prefix="/employees", tags=["employees"])


@router.get("/", response_model=list[EmployeeOut])
async def list_employees(
    branch_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    q = select(Employee).options(selectinload(Employee.position))
    if branch_id:
        q = q.where(Employee.branch_id == branch_id)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/", response_model=EmployeeOut)
async def create_employee(
    body: EmployeeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    emp = Employee(
        full_name=body.full_name,
        pin_hash=hash_pin(body.pin),
        position_id=body.position_id,
        branch_id=body.branch_id,
    )
    db.add(emp)
    await db.flush()
    await log_action(db, current_user.id, "create", "employee", emp.id, new_value={"full_name": emp.full_name})
    await db.commit()
    await db.refresh(emp)
    return emp


@router.patch("/{employee_id}", response_model=EmployeeOut)
async def update_employee(
    employee_id: int,
    body: EmployeeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    result = await db.execute(select(Employee).where(Employee.id == employee_id))
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

    old = {"full_name": emp.full_name, "is_active": emp.is_active}
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(emp, field, val)

    await log_action(db, current_user.id, "update", "employee", emp.id, old_value=old)
    await db.commit()
    await db.refresh(emp)
    return emp


@router.post("/{employee_id}/rates", response_model=EmployeeRateOut)
async def set_rate(
    employee_id: int,
    body: EmployeeRateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_accountant),
):
    result = await db.execute(select(Employee).where(Employee.id == employee_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

    rate = EmployeeRate(
        employee_id=employee_id,
        rate=body.rate,
        fixed_daily_rate=body.fixed_daily_rate,
        effective_from=body.effective_from,
        created_by=current_user.id,
    )
    db.add(rate)
    await log_action(db, current_user.id, "set_rate", "employee_rate", employee_id,
                     new_value={"rate": str(body.rate), "effective_from": str(body.effective_from)})
    await db.commit()
    await db.refresh(rate)
    return rate


@router.get("/{employee_id}/rates", response_model=list[EmployeeRateOut])
async def get_rates(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_accountant),
):
    result = await db.execute(
        select(EmployeeRate)
        .where(EmployeeRate.employee_id == employee_id)
        .order_by(EmployeeRate.effective_from.desc())
    )
    return result.scalars().all()
