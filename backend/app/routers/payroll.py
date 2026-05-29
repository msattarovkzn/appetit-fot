from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.payroll import PayrollEntry
from app.models.user import User
from app.dependencies import require_accountant
from app.schemas.report import FotSummaryOut
from app.models.payroll import FotSummary
from app.services.audit import log_action
from pydantic import BaseModel

router = APIRouter(prefix="/payroll", tags=["payroll"])


class PayrollEntryOut(BaseModel):
    id: int
    employee_id: int
    branch_id: int
    date: date
    hours_worked: Decimal
    approved_hours: Decimal
    rate: Decimal
    base_pay: Decimal
    bonus: Decimal
    total_pay: Decimal
    payment_type: str
    is_corrected: bool

    model_config = {"from_attributes": True}


class PayrollCorrection(BaseModel):
    approved_hours: Decimal | None = None
    base_pay: Decimal | None = None
    bonus: Decimal | None = None
    notes: str | None = None


@router.get("/entries", response_model=list[PayrollEntryOut])
async def get_entries(
    branch_id: int,
    from_date: date,
    to_date: date,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_accountant),
):
    result = await db.execute(
        select(PayrollEntry).where(
            and_(
                PayrollEntry.branch_id == branch_id,
                PayrollEntry.date >= from_date,
                PayrollEntry.date <= to_date,
            )
        ).order_by(PayrollEntry.date)
    )
    return result.scalars().all()


@router.patch("/entries/{entry_id}", response_model=PayrollEntryOut)
async def correct_entry(
    entry_id: int,
    body: PayrollCorrection,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_accountant),
):
    from datetime import datetime, timezone
    result = await db.execute(select(PayrollEntry).where(PayrollEntry.id == entry_id))
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Запись не найдена")

    old = {
        "approved_hours": str(entry.approved_hours),
        "base_pay": str(entry.base_pay),
        "bonus": str(entry.bonus),
        "total_pay": str(entry.total_pay),
    }

    if body.approved_hours is not None:
        entry.approved_hours = body.approved_hours
    if body.base_pay is not None:
        entry.base_pay = body.base_pay
    if body.bonus is not None:
        entry.bonus = body.bonus
    if body.notes is not None:
        entry.notes = body.notes

    entry.total_pay = entry.base_pay + entry.bonus
    entry.is_corrected = True
    entry.corrected_by = current_user.id
    entry.corrected_at = datetime.now(timezone.utc)

    await log_action(db, current_user.id, "correct_payroll", "payroll_entry", entry_id,
                     old_value=old, new_value={"total_pay": str(entry.total_pay)})
    await db.commit()
    await db.refresh(entry)
    return entry


@router.get("/fot-summary", response_model=list[FotSummaryOut])
async def get_fot_summary(
    branch_id: int,
    from_date: date,
    to_date: date,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_accountant),
):
    result = await db.execute(
        select(FotSummary).where(
            and_(
                FotSummary.branch_id == branch_id,
                FotSummary.date >= from_date,
                FotSummary.date <= to_date,
            )
        ).order_by(FotSummary.date)
    )
    return result.scalars().all()
