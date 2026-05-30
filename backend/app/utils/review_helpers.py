"""
Общие вспомогательные функции для проверки дней и аудит-лога.
Используются в routers/review.py и routers/admin.py.
"""
from datetime import date, datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from app.models.shift import Shift, ShiftStatus
from app.models.payroll import PayrollEntry
from app.models.report import BranchDailyReport
from app.models.branch import Branch
from app.models.review import DailyBranchReview
from app.models.audit import AuditLog
from app.models.user import User

# Коды проблем
ISSUE_DAY_NOT_CLOSED   = "day_not_closed"
ISSUE_UNCLOSED_SHIFTS  = "unclosed_shifts"
ISSUE_ANOMALY_WARNING  = "anomaly_warning"
ISSUE_ANOMALY_CRITICAL = "anomaly_critical"
ISSUE_EXTRA_SHIFTS     = "extra_shifts"
ISSUE_MANUAL_CORR      = "manual_corrections"


def compute_anomaly_flag(shift: Shift) -> str | None:
    """Вернуть 'warning'/'critical'/None по длине смены."""
    if not shift.closed_at or not shift.opened_at:
        return None
    hours = (shift.closed_at - shift.opened_at).total_seconds() / 3600
    if hours > 16:
        return "critical"
    if hours > 14:
        return "warning"
    return None


async def compute_and_save_review(
    db: AsyncSession,
    branch_id: int,
    review_date: date,
    *,
    force_recalculate: bool = False,
) -> DailyBranchReview:
    """
    Пересчитать список проблем за день и сохранить/обновить DailyBranchReview.
    Если статус уже GREEN — не понижаем автоматически (только бухгалтер вручную).
    Если force_recalculate=True — пересчитываем даже для GREEN.
    """
    issues: list[str] = []

    # 1. День закрыт кассиром?
    report_res = await db.execute(
        select(BranchDailyReport).where(
            and_(BranchDailyReport.branch_id == branch_id,
                 BranchDailyReport.date == review_date)
        )
    )
    if not report_res.scalar_one_or_none():
        issues.append(ISSUE_DAY_NOT_CLOSED)

    # 2. Смены за день
    shifts_res = await db.execute(
        select(Shift).options(
            selectinload(Shift.payroll_entry),
        ).where(
            and_(Shift.branch_id == branch_id, Shift.date == review_date)
        )
    )
    shifts = shifts_res.scalars().all()

    # 2a. Незакрытые смены
    if any(s.status == ShiftStatus.open for s in shifts):
        issues.append(ISSUE_UNCLOSED_SHIFTS)

    # 2b. Аномально длинные смены (нерешённые)
    has_warning = has_critical = False
    for s in shifts:
        if s.status != ShiftStatus.open and not s.anomaly_resolved_at:
            flag = compute_anomaly_flag(s)
            if flag == "critical":
                has_critical = True
                s.anomaly_flag = "critical"
            elif flag == "warning":
                has_warning = True
                if not s.anomaly_flag:
                    s.anomaly_flag = "warning"
    if has_critical:
        issues.append(ISSUE_ANOMALY_CRITICAL)
    if has_warning:
        issues.append(ISSUE_ANOMALY_WARNING)

    # 2c. Доп. смены
    if any(s.is_extra_shift for s in shifts):
        issues.append(ISSUE_EXTRA_SHIFTS)

    # 3. Ручные корректировки
    corr_res = await db.execute(
        select(PayrollEntry).where(
            and_(PayrollEntry.branch_id == branch_id,
                 PayrollEntry.date == review_date,
                 PayrollEntry.is_corrected == True)  # noqa: E712
        ).limit(1)
    )
    if corr_res.scalar_one_or_none():
        issues.append(ISSUE_MANUAL_CORR)

    new_computed_status = "red" if issues else "yellow"

    # Найти или создать запись
    existing_res = await db.execute(
        select(DailyBranchReview).where(
            and_(DailyBranchReview.branch_id == branch_id,
                 DailyBranchReview.date == review_date)
        )
    )
    review = existing_res.scalar_one_or_none()

    now = datetime.now(timezone.utc)
    if review:
        # Если GREEN и не форсируем — не понижаем
        if review.status != "green" or force_recalculate:
            review.status = new_computed_status
        review.issues = issues
        review.issues_count = len(issues)
        review.updated_at = now
    else:
        review = DailyBranchReview(
            branch_id=branch_id,
            date=review_date,
            status=new_computed_status,
            issues=issues,
            issues_count=len(issues),
            updated_at=now,
        )
        db.add(review)

    await db.flush()
    return review


async def write_audit(
    db: AsyncSession,
    *,
    entity_type: str,
    entity_id: int | None = None,
    action: str,
    user: User,
    branch_id: int | None = None,
    work_date: date | None = None,
    old_value: dict | None = None,
    new_value: dict | None = None,
    comment: str | None = None,
) -> None:
    """Добавить запись в журнал аудита."""
    log = AuditLog(
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        user_id=user.id,
        user_name=user.full_name,
        branch_id=branch_id,
        work_date=work_date,
        old_value=old_value,
        new_value=new_value,
        comment=comment,
    )
    db.add(log)
    await db.flush()
