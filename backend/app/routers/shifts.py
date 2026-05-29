from datetime import datetime, date, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.employee import Employee
from app.models.shift import Shift, ShiftStatus
from app.models.user import User
from app.dependencies import require_manager
from app.schemas.shift import ShiftOpenRequest, ShiftCloseRequest, ShiftOut, ShiftApproveRequest, ShiftStatusRequest, ShiftStatusResponse
from app.utils.security import verify_pin

router = APIRouter(prefix="/shifts", tags=["shifts"])


async def _find_employee_by_pin(db: AsyncSession, pin: str, branch_id: int) -> Employee:
    result = await db.execute(
        select(Employee).where(Employee.branch_id == branch_id, Employee.is_active == True)
    )
    for emp in result.scalars().all():
        if verify_pin(pin, emp.pin_hash):
            return emp
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный PIN")


@router.post("/status", response_model=ShiftStatusResponse)
async def get_shift_status(body: ShiftStatusRequest, db: AsyncSession = Depends(get_db)):
    """Проверить статус смены сотрудника по PIN. Не создаёт запись."""
    emp = await _find_employee_by_pin(db, body.pin, body.branch_id)
    today = datetime.now(timezone.utc).date()

    result = await db.execute(
        select(Shift).where(
            and_(
                Shift.employee_id == emp.id,
                Shift.date == today,
                Shift.status == ShiftStatus.open,
            )
        )
    )
    shift = result.scalar_one_or_none()

    hours_so_far = None
    if shift:
        delta = datetime.now(timezone.utc) - shift.opened_at.replace(tzinfo=timezone.utc) if shift.opened_at.tzinfo is None else datetime.now(timezone.utc) - shift.opened_at
        hours_so_far = round(delta.total_seconds() / 3600, 1)

    return ShiftStatusResponse(
        employee_id=emp.id,
        employee_name=emp.full_name,
        has_open_shift=shift is not None,
        shift_id=shift.id if shift else None,
        opened_at=shift.opened_at if shift else None,
        hours_so_far=hours_so_far,
    )


@router.post("/open", response_model=ShiftOut)
async def open_shift(body: ShiftOpenRequest, db: AsyncSession = Depends(get_db)):
    emp = await _find_employee_by_pin(db, body.pin, body.branch_id)

    today = datetime.now(timezone.utc).date()
    existing = await db.execute(
        select(Shift).where(
            and_(
                Shift.employee_id == emp.id,
                Shift.date == today,
                Shift.status == ShiftStatus.open,
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Смена уже открыта")

    shift = Shift(
        employee_id=emp.id,
        branch_id=body.branch_id,
        date=today,
        opened_at=datetime.now(timezone.utc),
        status=ShiftStatus.open,
    )
    db.add(shift)
    await db.commit()
    await db.refresh(shift)

    out = ShiftOut.model_validate(shift)
    out.employee_name = emp.full_name
    return out


@router.post("/close", response_model=ShiftOut)
async def close_shift(body: ShiftCloseRequest, db: AsyncSession = Depends(get_db)):
    emp = await _find_employee_by_pin(db, body.pin, body.branch_id)

    today = datetime.now(timezone.utc).date()
    result = await db.execute(
        select(Shift).where(
            and_(
                Shift.employee_id == emp.id,
                Shift.date == today,
                Shift.status == ShiftStatus.open,
            )
        )
    )
    shift = result.scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=400, detail="Открытая смена не найдена")

    now = datetime.now(timezone.utc)
    shift.closed_at = now
    shift.status = ShiftStatus.closed

    opened = shift.opened_at
    if opened.tzinfo is None:
        opened = opened.replace(tzinfo=timezone.utc)
    total_seconds = (now - opened).total_seconds()
    total_minutes = int(total_seconds / 60)
    shift.total_minutes = total_minutes
    shift.total_hours_decimal = Decimal(str(round(total_seconds / 3600, 4)))
    shift.approved_hours = Decimal(str(round(total_seconds / 3600, 2)))

    await db.commit()
    await db.refresh(shift)

    out = ShiftOut.model_validate(shift)
    out.employee_name = emp.full_name
    return out


@router.get("/", response_model=list[ShiftOut])
async def list_shifts(
    branch_id: int,
    shift_date: date | None = None,
    status: ShiftStatus | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    q = (
        select(Shift)
        .where(Shift.branch_id == branch_id)
        .options(selectinload(Shift.employee))
    )
    if shift_date:
        q = q.where(Shift.date == shift_date)
    if status:
        q = q.where(Shift.status == status)
    result = await db.execute(q)
    shifts = result.scalars().all()

    out = []
    for s in shifts:
        item = ShiftOut.model_validate(s)
        item.employee_name = s.employee.full_name
        out.append(item)
    return out


@router.patch("/{shift_id}/approve", response_model=ShiftOut)
async def approve_shift(
    shift_id: int,
    body: ShiftApproveRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    result = await db.execute(
        select(Shift).where(Shift.id == shift_id).options(selectinload(Shift.employee))
    )
    shift = result.scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=404, detail="Смена не найдена")

    shift.approved_hours = body.approved_hours
    shift.note = body.note
    shift.status = ShiftStatus.approved
    await db.commit()
    await db.refresh(shift)

    out = ShiftOut.model_validate(shift)
    out.employee_name = shift.employee.full_name
    return out
