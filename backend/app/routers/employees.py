from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.employee import Employee
from app.models.user import User
from app.dependencies import require_manager
from app.schemas.employee import EmployeeOut

router = APIRouter(prefix="/employees", tags=["employees"])

_LEGACY_GONE_DETAIL = "Legacy endpoint disabled. Use /admin/employees instead."


@router.get("", response_model=list[EmployeeOut])
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


# ══════════════════════════════════════════════════════════════════════════════
# Legacy write/rate endpoints — disabled (410 Gone).
# Superseded by /admin/employees/* (see backend/app/routers/admin.py), which:
#   - validates PIN uniqueness per branch (_check_pin_unique)
#   - keeps pin_hash/pin_check in sync
#   - closes the previous active rate when adding a new one
#   - uses the current audit mechanism (write_audit)
# Kept as explicit 410 responses (rather than removed) so that any external
# caller gets a clear, loud signal instead of a silent 404/behavior change.
# ══════════════════════════════════════════════════════════════════════════════

@router.post("", status_code=410)
async def create_employee_legacy_disabled():
    raise HTTPException(status_code=410, detail=_LEGACY_GONE_DETAIL)


@router.patch("/{employee_id}", status_code=410)
async def update_employee_legacy_disabled(employee_id: int):
    raise HTTPException(status_code=410, detail=_LEGACY_GONE_DETAIL)


@router.post("/{employee_id}/rates", status_code=410)
async def set_rate_legacy_disabled(employee_id: int):
    raise HTTPException(status_code=410, detail=_LEGACY_GONE_DETAIL)


@router.get("/{employee_id}/rates", status_code=410)
async def get_rates_legacy_disabled(employee_id: int):
    raise HTTPException(status_code=410, detail=_LEGACY_GONE_DETAIL)
