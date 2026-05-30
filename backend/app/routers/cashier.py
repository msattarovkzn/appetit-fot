from datetime import datetime, timezone, date as date_type, time as time_type
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func as sa_func
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.branch import Branch
from app.models.employee import Employee
from app.models.shift import Shift, ShiftStatus
from app.models.report import BranchDailyReport
from app.models.notification import Notification, NotificationStatus
from app.models.cashier_session import CashierSession
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


def _cashier_bonus(orders_count: int, work_date: date_type) -> Decimal:
    """Бонус кассира: Пн–Чт+Вс = 7₽/заказ, Пт–Сб = 5₽/заказ."""
    weekday = work_date.weekday()  # 0=Пн, 4=Пт, 5=Сб, 6=Вс
    rate = Decimal("5") if weekday in (4, 5) else Decimal("7")
    return Decimal(orders_count) * rate


@router.post("/extra-shift/open")
async def open_extra_shift(body: dict, db: AsyncSession = Depends(get_db)):
    """
    Кассир открывает дополнительную смену для сотрудника.
    Тело: { pin, branch_id, employee_id, start_time: 'HH:MM', reason }
    """
    pin = body.get("pin", "")
    branch_id = int(body.get("branch_id", 0))
    employee_id = int(body.get("employee_id", 0))
    reason = body.get("reason", "Дополнительная смена")
    start_time_str = body.get("start_time")  # "HH:MM" или null

    # Аутентификация кассира
    cashier = await _find_cashier_by_pin(db, pin, branch_id)

    # Найти сотрудника
    emp_res = await db.execute(
        select(Employee).where(and_(Employee.id == employee_id, Employee.branch_id == branch_id))
    )
    emp = emp_res.scalar_one_or_none()
    if not emp:
        raise HTTPException(404, "Сотрудник не найден")

    today = datetime.now(timezone.utc).date()

    # Нет уже открытой смены?
    open_res = await db.execute(
        select(Shift).where(
            and_(Shift.employee_id == emp.id, Shift.date == today, Shift.status == ShiftStatus.open)
        )
    )
    if open_res.scalar_one_or_none():
        raise HTTPException(400, "У сотрудника уже есть открытая смена")

    # Определить время открытия
    now_utc = datetime.now(timezone.utc)
    if start_time_str:
        try:
            h, m = map(int, start_time_str.split(":"))
            opened_at = now_utc.replace(hour=h, minute=m, second=0, microsecond=0)
        except Exception:
            opened_at = now_utc
    else:
        opened_at = now_utc

    shift = Shift(
        employee_id=emp.id,
        branch_id=branch_id,
        date=today,
        opened_at=opened_at,
        status=ShiftStatus.open,
        is_extra_shift=True,
        extra_shift_reason=reason,
        approved_by=None,  # кассир — не пользователь системы, храним в note
        note=f"Доп. смена открыта кассиром: {cashier.full_name}",
    )
    db.add(shift)
    await db.commit()
    await db.refresh(shift)

    return {
        "ok": True,
        "shift_id": shift.id,
        "employee_name": emp.full_name,
        "opened_at": shift.opened_at.isoformat(),
        "reason": reason,
        "opened_by": cashier.full_name,
    }


@router.post("/extra-shift/close")
async def close_extra_shift(body: dict, db: AsyncSession = Depends(get_db)):
    """
    Кассир закрывает смену сотрудника (любую — основную или доп.).
    Тело: { pin, branch_id, shift_id }
    """
    pin = body.get("pin", "")
    branch_id = int(body.get("branch_id", 0))
    shift_id = int(body.get("shift_id", 0))

    cashier = await _find_cashier_by_pin(db, pin, branch_id)

    shift_res = await db.execute(
        select(Shift).options(selectinload(Shift.employee)).where(
            and_(Shift.id == shift_id, Shift.branch_id == branch_id)
        )
    )
    shift = shift_res.scalar_one_or_none()
    if not shift:
        raise HTTPException(404, "Смена не найдена")
    if shift.status != ShiftStatus.open:
        raise HTTPException(400, "Смена уже закрыта")

    now = datetime.now(timezone.utc)
    shift.closed_at = now
    shift.status = ShiftStatus.closed
    opened = shift.opened_at
    if opened.tzinfo is None:
        opened = opened.replace(tzinfo=timezone.utc)
    total_seconds = (now - opened).total_seconds()
    shift.total_minutes = int(total_seconds / 60)
    shift.total_hours_decimal = Decimal(str(round(total_seconds / 3600, 4)))
    shift.approved_hours = Decimal(str(round(total_seconds / 3600, 2)))
    if not shift.note:
        shift.note = f"Закрыта кассиром: {cashier.full_name}"

    await db.commit()

    return {
        "ok": True,
        "shift_id": shift.id,
        "employee_name": shift.employee.full_name if shift.employee else "—",
        "approved_hours": float(shift.approved_hours),
        "closed_by": cashier.full_name,
    }


@router.get("/sessions")
async def list_cashier_sessions(
    branch_id: int,
    session_date: date_type,
    db: AsyncSession = Depends(get_db),
):
    """Список кассирских сессий за день (показывается кассиру перед закрытием)."""
    res = await db.execute(
        select(CashierSession).options(
            selectinload(CashierSession.cashier_employee)
        ).where(
            and_(CashierSession.branch_id == branch_id, CashierSession.date == session_date)
        ).order_by(CashierSession.created_at)
    )
    sessions = res.scalars().all()
    return [
        {
            "id": s.id,
            "cashier_name": s.cashier_employee.full_name if s.cashier_employee else "—",
            "shift_start": str(s.shift_start) if s.shift_start else None,
            "shift_end": str(s.shift_end) if s.shift_end else None,
            "revenue": float(s.revenue),
            "orders_count": s.orders_count,
            "takeaway_count": s.takeaway_count,
            "bonus_amount": float(s.bonus_amount),
            "closed_at": s.closed_at.isoformat() if s.closed_at else None,
        }
        for s in sessions
    ]


@router.post("/close-day-by-pin", response_model=CashierPinCloseResponse)
async def close_day_by_pin(
    body: CashierPinCloseRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Кассир закрывает свою кассирскую сессию и вносит данные за свой период.
    Поддерживает несколько кассиров в день — BranchDailyReport суммируется.
    """
    # 1. Найти кассира по PIN
    emp = await _find_cashier_by_pin(db, body.pin, body.branch_id)

    # 2. Проверить что этот кассир уже не закрывал сегодня
    if existing_session.scalar_one_or_none():
        raise HTTPException(400, "Вы уже закрыли свою кассирскую смену сегодня")

    # 3. Закрыть личную смену кассира (если открыта)
    now_close = datetime.now(timezone.utc)
    shift_result = await db.execute(
        select(Shift).where(
            and_(Shift.employee_id == emp.id, Shift.date == body.date, Shift.status == ShiftStatus.open)
        ).order_by(Shift.id.desc())
    )
    cashier_shift = shift_result.scalars().first()
    cashier_shift_start = None
    if cashier_shift:
        cashier_shift.closed_at = now_close
        cashier_shift.status = ShiftStatus.closed
        opened = cashier_shift.opened_at
        if opened.tzinfo is None:
            opened = opened.replace(tzinfo=timezone.utc)
        total_seconds = (now_close - opened).total_seconds()
        cashier_shift.total_minutes = int(total_seconds / 60)
        cashier_shift.total_hours_decimal = Decimal(str(round(total_seconds / 3600, 4)))
        cashier_shift.approved_hours = Decimal(str(round(total_seconds / 3600, 2)))
        if body.comment:
            cashier_shift.note = body.comment
        cashier_shift_start = opened.time()
        await db.flush()

    # 4. Рассчитать бонус кассира
    bonus = _cashier_bonus(body.orders_count, body.date)

    # 5. Создать CashierSession
    session = CashierSession(
        branch_id=body.branch_id,
        date=body.date,
        cashier_employee_id=emp.id,
        shift_start=cashier_shift_start,
        shift_end=now_close.time(),
        revenue=body.revenue,
        orders_count=body.orders_count,
        takeaway_count=body.takeaway_count,
        bonus_amount=bonus,
        closed_at=now_close,
    )
    db.add(session)
    await db.flush()

    # 6. Обновить или создать BranchDailyReport (суммирование)
    owner_result = await db.execute(select(User).where(User.is_active == True).limit(1))  # noqa: E712
    system_user = owner_result.scalar_one_or_none()
    if not system_user:
        raise HTTPException(500, "Не найден пользователь системы")

    report_res = await db.execute(
        select(BranchDailyReport).where(
            and_(BranchDailyReport.branch_id == body.branch_id, BranchDailyReport.date == body.date)
        )
    )
    report = report_res.scalar_one_or_none()

    if report:
        # Второй кассир — суммируем
        report.revenue += body.revenue
        report.orders_count += body.orders_count
        report.takeaway_count += body.takeaway_count
        report.closed_at = now_close  # обновляем время
    else:
        # Первый кассир — создаём отчёт
        report = BranchDailyReport(
            branch_id=body.branch_id,
            date=body.date,
            revenue=body.revenue,
            orders_count=body.orders_count,
            takeaway_count=body.takeaway_count,
            closed_by=system_user.id,
            closed_at=now_close,
        )
        db.add(report)
    await db.flush()

    # 7. Пересчитать ФОТ
    fot_summary = await calculate_payroll_for_day(db, body.branch_id, report, cashier_employee_id=emp.id)

    # 8. Незакрытые смены (для предупреждения)
    open_shifts_result = await db.execute(
        select(Shift)
        .where(and_(Shift.branch_id == body.branch_id, Shift.date == body.date, Shift.status == ShiftStatus.open))
        .options(selectinload(Shift.employee))
    )
    unclosed_names = [s.employee.full_name for s in open_shifts_result.scalars().all()]

    # 9. Название филиала
    branch_result = await db.execute(select(Branch).where(Branch.id == body.branch_id))
    branch = branch_result.scalar_one()

    # 10. Всего кассирских сессий сегодня
    sessions_count_res = await db.execute(
        select(sa_func.count(CashierSession.id)).where(
            and_(CashierSession.branch_id == body.branch_id, CashierSession.date == body.date)
        )
    )
    sessions_total = sessions_count_res.scalar() or 1

    # 11. Telegram
    message = build_close_message(
        branch_name=branch.name,
        report_date=body.date,
        revenue=float(report.revenue),
        orders=report.orders_count,
        takeaways=report.takeaway_count,
        unclosed_names=unclosed_names,
        total_fot_pct=float(fot_summary.total_fot_pct),
    )
    # Для второго+ кассира добавим пометку
    if sessions_total > 1:
        message = f"[Касса {sessions_total}/{sessions_total}] " + message

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
