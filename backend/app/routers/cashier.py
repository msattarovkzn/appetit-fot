from datetime import datetime, timezone, date as date_type
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.branch import Branch
from app.models.employee import Employee
from app.models.shift import Shift, ShiftStatus
from app.models.report import BranchDailyReport
from app.models.notification import Notification, NotificationStatus
from app.models.user import User
from app.dependencies import require_cashier, require_manager
from app.schemas.report import (
    CashierCloseRequest, BranchDailyReportOut,
    CashierPinCloseRequest, CashierPinCloseResponse,
    CashierCheckPinRequest, CashierCheckPinResponse,
)
from app.services.payroll import calculate_payroll_for_day
from app.services.bot import send_telegram, build_close_message
from app.services.audit import log_action
from app.utils.security import verify_pin

router = APIRouter(prefix="/cashier", tags=["cashier"])


async def _find_cashier_by_pin(db: AsyncSession, pin: str, branch_id: int) -> Employee:
    """Найти сотрудника-кассира по PIN в филиале."""
    result = await db.execute(
        select(Employee).where(
            Employee.branch_id == branch_id,
            Employee.is_active == True,
            Employee.is_cashier == True,
        )
    )
    cashiers = result.scalars().all()

    for emp in cashiers:
        if verify_pin(pin, emp.pin_hash):
            return emp

    raise HTTPException(status_code=401, detail="Неверный PIN или нет доступа кассира")


@router.post("/check-pin", response_model=CashierCheckPinResponse)
async def check_cashier_pin(body: CashierCheckPinRequest, db: AsyncSession = Depends(get_db)):
    """Проверить PIN кассира и вернуть статус его смены. Только is_cashier=True."""
    emp = await _find_cashier_by_pin(db, body.pin, body.branch_id)
    today = datetime.now(timezone.utc).date()

    result = await db.execute(
        select(Shift).where(
            and_(
                Shift.employee_id == emp.id,
                Shift.date == today,
                Shift.status == ShiftStatus.open,
            )
        ).order_by(Shift.id.desc())
    )
    shift = result.scalars().first()

    hours_so_far = None
    if shift:
        opened = shift.opened_at
        if opened.tzinfo is None:
            opened = opened.replace(tzinfo=timezone.utc)
        hours_so_far = round((datetime.now(timezone.utc) - opened).total_seconds() / 3600, 1)

    return CashierCheckPinResponse(
        employee_id=emp.id,
        employee_name=emp.full_name,
        has_open_shift=shift is not None,
        opened_at=shift.opened_at if shift else None,
        hours_so_far=hours_so_far,
    )


@router.post("/close-day-by-pin", response_model=CashierPinCloseResponse)
async def close_day_by_pin(
    body: CashierPinCloseRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Закрыть смену кассира + закрыть день филиала по PIN.
    Только для сотрудников с is_cashier=True.
    """
    # 1. Найти кассира по PIN
    emp = await _find_cashier_by_pin(db, body.pin, body.branch_id)

    # 2. Проверить что день ещё не закрыт
    existing = await db.execute(
        select(BranchDailyReport).where(
            and_(
                BranchDailyReport.branch_id == body.branch_id,
                BranchDailyReport.date == body.date,
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="День уже закрыт")

    # 3. Закрыть личную смену кассира (если открыта)
    shift_result = await db.execute(
        select(Shift).where(
            and_(
                Shift.employee_id == emp.id,
                Shift.date == body.date,
                Shift.status == ShiftStatus.open,
            )
        ).order_by(Shift.id.desc())
    )
    cashier_shift = shift_result.scalars().first()
    if cashier_shift:
        now_close = datetime.now(timezone.utc)
        cashier_shift.closed_at = now_close
        cashier_shift.status = ShiftStatus.closed
        opened = cashier_shift.opened_at
        if opened.tzinfo is None:
            opened = opened.replace(tzinfo=timezone.utc)
        total_seconds = (now_close - opened).total_seconds()
        total_minutes = int(total_seconds / 60)
        cashier_shift.total_minutes = total_minutes
        cashier_shift.total_hours_decimal = Decimal(str(round(total_seconds / 3600, 4)))
        cashier_shift.approved_hours = Decimal(str(round(total_seconds / 3600, 2)))
        if body.comment:
            cashier_shift.note = body.comment
        await db.flush()

    # 4. Сохранить отчёт дня
    # Создаём системного пользователя-заглушку или ищем первого owner
    owner_result = await db.execute(
        select(User).where(User.is_active == True).limit(1)
    )
    system_user = owner_result.scalar_one_or_none()
    if not system_user:
        raise HTTPException(status_code=500, detail="Не найден пользователь системы")

    report = BranchDailyReport(
        branch_id=body.branch_id,
        date=body.date,
        revenue=body.revenue,
        orders_count=body.orders_count,
        takeaway_count=body.takeaway_count,
        closed_by=system_user.id,
        closed_at=datetime.now(timezone.utc),
    )
    db.add(report)
    await db.flush()

    # 5. Рассчитать ФОТ (только кассир получает admin-бонус)
    fot_summary = await calculate_payroll_for_day(db, body.branch_id, report, cashier_employee_id=emp.id)

    # 6. Найти незакрытые смены (исключая только что закрытую)
    open_shifts_result = await db.execute(
        select(Shift)
        .where(
            and_(
                Shift.branch_id == body.branch_id,
                Shift.date == body.date,
                Shift.status == ShiftStatus.open,
            )
        )
        .options(selectinload(Shift.employee))
    )
    open_shifts = open_shifts_result.scalars().all()
    unclosed_names = [s.employee.full_name for s in open_shifts]

    # 7. Получить название филиала
    branch_result = await db.execute(select(Branch).where(Branch.id == body.branch_id))
    branch = branch_result.scalar_one()

    # 8. Отправить уведомление в Telegram
    message = build_close_message(
        branch_name=branch.name,
        report_date=body.date,
        revenue=float(body.revenue),
        orders=body.orders_count,
        takeaways=body.takeaway_count,
        unclosed_names=unclosed_names,
        total_fot_pct=float(fot_summary.total_fot_pct),
    )
    sent = await send_telegram(message)
    db.add(Notification(
        branch_id=body.branch_id,
        date=body.date,
        message=message,
        status=NotificationStatus.sent if sent else NotificationStatus.failed,
        error_msg=None if sent else "Telegram API error",
    ))

    await db.commit()

    return CashierPinCloseResponse(
        employee_name=emp.full_name,
        branch_name=branch.name,
        date=body.date,
        unclosed_count=len(unclosed_names),
        unclosed_names=unclosed_names,
        bot_message=message,
    )


# --- Endpoints с JWT (для /manager, /admin) ---

@router.get("/reports", response_model=list[BranchDailyReportOut])
async def list_reports(
    branch_id: int,
    from_date: date_type,
    to_date: date_type,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    result = await db.execute(
        select(BranchDailyReport).where(
            and_(
                BranchDailyReport.branch_id == branch_id,
                BranchDailyReport.date >= from_date,
                BranchDailyReport.date <= to_date,
            )
        ).order_by(BranchDailyReport.date.desc())
    )
    return result.scalars().all()

@router.post("/close-day", response_model=BranchDailyReportOut)
async def close_day(
    body: CashierCloseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier),
):
    existing = await db.execute(
        select(BranchDailyReport).where(
            and_(
                BranchDailyReport.branch_id == body.branch_id,
                BranchDailyReport.date == body.date,
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="День уже закрыт")

    if body.revenue <= 0 or body.orders_count < 0 or body.takeaway_count < 0:
        raise HTTPException(status_code=422, detail="Выручка, заказы и выносы обязательны")

    report = BranchDailyReport(
        branch_id=body.branch_id,
        date=body.date,
        revenue=body.revenue,
        orders_count=body.orders_count,
        takeaway_count=body.takeaway_count,
        closed_by=current_user.id,
        closed_at=datetime.now(timezone.utc),
    )
    db.add(report)
    await db.flush()

    fot_summary = await calculate_payroll_for_day(db, body.branch_id, report)

    open_shifts_result = await db.execute(
        select(Shift)
        .where(
            and_(
                Shift.branch_id == body.branch_id,
                Shift.date == body.date,
                Shift.status == ShiftStatus.open,
            )
        )
        .options(selectinload(Shift.employee))
    )
    unclosed_names = [s.employee.full_name for s in open_shifts_result.scalars().all()]

    branch_result = await db.execute(select(Branch).where(Branch.id == body.branch_id))
    branch = branch_result.scalar_one()

    message = build_close_message(
        branch_name=branch.name,
        report_date=body.date,
        revenue=float(body.revenue),
        orders=body.orders_count,
        takeaways=body.takeaway_count,
        unclosed_names=unclosed_names,
        total_fot_pct=float(fot_summary.total_fot_pct),
    )
    sent = await send_telegram(message)
    db.add(Notification(
        branch_id=body.branch_id,
        date=body.date,
        message=message,
        status=NotificationStatus.sent if sent else NotificationStatus.failed,
        error_msg=None if sent else "Telegram API error",
    ))

    await log_action(
        db, current_user.id, "close_day", "branch_daily_report", report.id,
        new_value={"revenue": str(body.revenue), "orders": body.orders_count},
    )

    await db.commit()
    await db.refresh(report)
    return report
