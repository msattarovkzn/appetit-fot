"""
Тестовый роутер — доступен при ENVIRONMENT=development или ENVIRONMENT=staging.
В production всегда возвращает 403.

Позволяет:
  - открыть смену на произвольную дату
  - закрыть смену с заданным числом часов
  - сбросить данные закрытия дня (отчёт, ФОТ, payroll)

Тестовый режим работает ТОЛЬКО для филиала Челябинск (branch_id=1).
"""
import os
from datetime import date as date_type, datetime, timezone, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.employee import Employee
from app.models.notification import Notification
from app.models.payroll import FotSummary, PayrollEntry
from app.models.report import BranchDailyReport
from app.models.shift import Shift, ShiftStatus
from app.utils.security import verify_pin

router = APIRouter(prefix="/test", tags=["test"])

TEST_BRANCH_ID = 1  # Челябинск


# ── Guard ──────────────────────────────────────────────────────────────────────

def _require_dev() -> None:
    """Бросить 403 если окружение не development или staging."""
    env = os.getenv("ENVIRONMENT", "production").lower()
    if env not in ("development", "staging"):
        raise HTTPException(
            status_code=403,
            detail="Тестовый режим доступен только в development/staging окружении",
        )


def _require_test_branch(branch_id: int) -> None:
    if branch_id != TEST_BRANCH_ID:
        raise HTTPException(
            status_code=403,
            detail=f"Тестовый режим работает только для филиала с branch_id={TEST_BRANCH_ID}",
        )


async def _find_employee_by_pin(
    db: AsyncSession, pin: str, branch_id: int
) -> Employee:
    result = await db.execute(
        select(Employee).where(
            Employee.branch_id == branch_id,
            Employee.is_active == True,  # noqa: E712
        )
    )
    for emp in result.scalars().all():
        if verify_pin(pin, emp.pin_hash):
            return emp
    raise HTTPException(status_code=401, detail="Неверный PIN")


# ── Schemas ────────────────────────────────────────────────────────────────────

class TestShiftStatusRequest(BaseModel):
    pin: str
    branch_id: int
    date: date_type


class TestOpenShiftRequest(BaseModel):
    pin: str
    branch_id: int
    date: date_type
    start_hour: int = 9  # UTC-час начала смены (по умолчанию 09:00)


class TestCloseShiftRequest(BaseModel):
    pin: str
    branch_id: int
    date: date_type
    hours: float  # количество часов; closed_at = opened_at + hours


class TestResetDayRequest(BaseModel):
    branch_id: int
    date: date_type


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/ping")
async def test_ping():
    """Проверить что тестовый режим активен."""
    _require_dev()
    return {"test_mode": True, "test_branch_id": TEST_BRANCH_ID}


@router.post("/shift-status")
async def test_shift_status(
    body: TestShiftStatusRequest,
    db: AsyncSession = Depends(get_db),
):
    """Статус смены сотрудника за произвольную дату."""
    _require_dev()
    _require_test_branch(body.branch_id)

    emp = await _find_employee_by_pin(db, body.pin, body.branch_id)

    result = await db.execute(
        select(Shift)
        .where(
            and_(
                Shift.employee_id == emp.id,
                Shift.date == body.date,
                Shift.status == ShiftStatus.open,
            )
        )
        .order_by(Shift.id.desc())
    )
    shift = result.scalars().first()

    return {
        "employee_id": emp.id,
        "employee_name": emp.full_name,
        "has_open_shift": shift is not None,
        "shift_id": shift.id if shift else None,
        "opened_at": shift.opened_at.isoformat() if shift else None,
    }


@router.post("/open-shift")
async def test_open_shift(
    body: TestOpenShiftRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Открыть тестовую смену на произвольную дату.

    Если у сотрудника уже есть открытая смена на эту дату — вернуть её без дубля.
    """
    _require_dev()
    _require_test_branch(body.branch_id)

    emp = await _find_employee_by_pin(db, body.pin, body.branch_id)

    # Не создавать дубль открытой смены
    existing = await db.execute(
        select(Shift)
        .where(
            and_(
                Shift.employee_id == emp.id,
                Shift.date == body.date,
                Shift.status == ShiftStatus.open,
            )
        )
        .order_by(Shift.id.desc())
    )
    shift = existing.scalars().first()
    if shift:
        return {
            "id": shift.id,
            "employee_name": emp.full_name,
            "date": str(body.date),
            "opened_at": shift.opened_at.isoformat(),
            "status": shift.status,
            "already_existed": True,
        }

    # opened_at = выбранная дата + start_hour:00 UTC
    opened_at = datetime(
        body.date.year, body.date.month, body.date.day,
        body.start_hour, 0, 0,
        tzinfo=timezone.utc,
    )
    shift = Shift(
        employee_id=emp.id,
        branch_id=body.branch_id,
        date=body.date,
        opened_at=opened_at,
        status=ShiftStatus.open,
    )
    db.add(shift)
    await db.commit()
    await db.refresh(shift)

    return {
        "id": shift.id,
        "employee_name": emp.full_name,
        "date": str(body.date),
        "opened_at": shift.opened_at.isoformat(),
        "status": shift.status,
        "already_existed": False,
    }


@router.post("/close-shift")
async def test_close_shift(
    body: TestCloseShiftRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Закрыть тестовую смену с заданным числом часов.

    closed_at = opened_at + hours * 60 мин
    total_minutes = int(hours * 60)
    """
    _require_dev()
    _require_test_branch(body.branch_id)

    if body.hours <= 0 or body.hours > 24:
        raise HTTPException(status_code=422, detail="Часы должны быть от 0.1 до 24")

    emp = await _find_employee_by_pin(db, body.pin, body.branch_id)

    result = await db.execute(
        select(Shift)
        .where(
            and_(
                Shift.employee_id == emp.id,
                Shift.date == body.date,
                Shift.status == ShiftStatus.open,
            )
        )
        .order_by(Shift.id.desc())
    )
    shift = result.scalars().first()
    if not shift:
        raise HTTPException(
            status_code=404,
            detail=f"Открытая смена за {body.date} не найдена. Сначала откройте смену.",
        )

    total_minutes = int(body.hours * 60)
    opened = shift.opened_at
    if opened.tzinfo is None:
        opened = opened.replace(tzinfo=timezone.utc)

    shift.closed_at = opened + timedelta(minutes=total_minutes)
    shift.status = ShiftStatus.closed
    shift.total_minutes = total_minutes
    shift.total_hours_decimal = Decimal(str(round(body.hours, 4)))
    shift.approved_hours = Decimal(str(round(body.hours, 2)))

    await db.commit()
    await db.refresh(shift)

    return {
        "id": shift.id,
        "employee_name": emp.full_name,
        "date": str(body.date),
        "opened_at": shift.opened_at.isoformat(),
        "closed_at": shift.closed_at.isoformat(),
        "total_minutes": total_minutes,
        "approved_hours": float(shift.approved_hours),
        "status": shift.status,
    }


@router.post("/reset-day")
async def test_reset_day(
    body: TestResetDayRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Удалить все данные закрытия дня за указанную дату.

    Удаляет: fot_summary, payroll_entries, notifications, branch_daily_reports.
    Смены сотрудников НЕ удаляются — чтобы можно было менять сценарий без переоткрытия.
    """
    _require_dev()
    _require_test_branch(body.branch_id)

    deleted: dict[str, int] = {}

    # Находим report_id для каскадного удаления fot_summary
    reports_res = await db.execute(
        select(BranchDailyReport).where(
            and_(
                BranchDailyReport.branch_id == body.branch_id,
                BranchDailyReport.date == body.date,
            )
        )
    )
    report_ids = [r.id for r in reports_res.scalars().all()]

    if report_ids:
        r = await db.execute(
            delete(FotSummary).where(FotSummary.daily_report_id.in_(report_ids))
        )
        deleted["fot_summary"] = r.rowcount
    else:
        deleted["fot_summary"] = 0

    r = await db.execute(
        delete(PayrollEntry).where(
            and_(
                PayrollEntry.branch_id == body.branch_id,
                PayrollEntry.date == body.date,
                PayrollEntry.is_corrected == False,  # noqa: E712
            )
        )
    )
    deleted["payroll_entries"] = r.rowcount

    r = await db.execute(
        delete(Notification).where(
            and_(
                Notification.branch_id == body.branch_id,
                Notification.date == body.date,
            )
        )
    )
    deleted["notifications"] = r.rowcount

    r = await db.execute(
        delete(BranchDailyReport).where(
            and_(
                BranchDailyReport.branch_id == body.branch_id,
                BranchDailyReport.date == body.date,
            )
        )
    )
    deleted["branch_daily_reports"] = r.rowcount

    await db.commit()

    return {
        "reset": True,
        "branch_id": body.branch_id,
        "date": str(body.date),
        "deleted": deleted,
    }
