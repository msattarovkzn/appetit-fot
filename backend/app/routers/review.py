"""
Проверка дней бухгалтером: статусы филиалов RED/YELLOW/GREEN.
Аномальные смены (Блок 5), аудит-лог (Блок 7).
"""
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, desc
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import require_accountant
from app.models.user import User
from app.models.shift import Shift, ShiftStatus
from app.models.branch import Branch
from app.models.review import DailyBranchReview
from app.models.audit import AuditLog
from app.utils.review_helpers import (
    compute_and_save_review, write_audit,
    ISSUE_DAY_NOT_CLOSED, ISSUE_UNCLOSED_SHIFTS,
    ISSUE_ANOMALY_WARNING, ISSUE_ANOMALY_CRITICAL,
    ISSUE_EXTRA_SHIFTS, ISSUE_MANUAL_CORR,
)

router = APIRouter(prefix="/review", tags=["review"])

ISSUE_LABELS = {
    ISSUE_DAY_NOT_CLOSED:   "День не закрыт кассиром",
    ISSUE_UNCLOSED_SHIFTS:  "Незакрытые смены",
    ISSUE_ANOMALY_WARNING:  "Аномально длинные смены (14–16 ч)",
    ISSUE_ANOMALY_CRITICAL: "Критически длинные смены (>16 ч)",
    ISSUE_EXTRA_SHIFTS:     "Дополнительные смены",
    ISSUE_MANUAL_CORR:      "Ручные корректировки",
}

STATUS_EMOJI = {"red": "🔴", "yellow": "🟡", "green": "🟢"}


@router.get("")
async def list_reviews(
    review_date: date | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_accountant),
):
    """Список всех филиалов со статусом проверки за выбранный день (по умолчанию вчера)."""
    if review_date is None:
        review_date = date.today() - timedelta(days=1)

    branches_res = await db.execute(
        select(Branch).where(Branch.is_active == True).order_by(Branch.name)  # noqa: E712
    )
    branches = branches_res.scalars().all()

    result = []
    for branch in branches:
        review = await compute_and_save_review(db, branch.id, review_date)

        reviewer_name = None
        if review.reviewed_by:
            u_res = await db.execute(select(User).where(User.id == review.reviewed_by))
            u = u_res.scalar_one_or_none()
            reviewer_name = u.full_name if u else None

        result.append({
            "branch_id": branch.id,
            "branch_name": branch.name,
            "date": str(review_date),
            "status": review.status,
            "emoji": STATUS_EMOJI.get(review.status, ""),
            "issues_count": review.issues_count,
            "issues": review.issues,
            "issues_labels": [ISSUE_LABELS.get(i, i) for i in review.issues],
            "reviewed_by": reviewer_name,
            "reviewed_at": review.reviewed_at.isoformat() if review.reviewed_at else None,
        })

    await db.commit()
    return {"date": str(review_date), "branches": result}


@router.get("/{branch_id}/{review_date}")
async def get_review_detail(
    branch_id: int,
    review_date: date,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_accountant),
):
    """Детали дня: список смен + список проблем."""
    review = await compute_and_save_review(db, branch_id, review_date)
    await db.commit()

    shifts_res = await db.execute(
        select(Shift).options(
            selectinload(Shift.employee),
            selectinload(Shift.payroll_entry),
        ).where(
            and_(Shift.branch_id == branch_id, Shift.date == review_date)
        ).order_by(Shift.opened_at)
    )
    shifts = shifts_res.scalars().all()

    def shift_hours(s: Shift) -> float | None:
        if s.approved_hours is not None:
            return float(s.approved_hours)
        if s.closed_at and s.opened_at:
            return round((s.closed_at - s.opened_at).total_seconds() / 3600, 2)
        return None

    return {
        "branch_id": branch_id,
        "date": str(review_date),
        "status": review.status,
        "emoji": STATUS_EMOJI.get(review.status, ""),
        "issues_count": review.issues_count,
        "issues": review.issues,
        "issues_labels": [ISSUE_LABELS.get(i, i) for i in review.issues],
        "reviewed_by": review.reviewed_by,
        "reviewed_at": review.reviewed_at.isoformat() if review.reviewed_at else None,
        "notes": review.notes,
        "shifts": [
            {
                "id": s.id,
                "employee_name": s.employee.full_name if s.employee else "—",
                "status": s.status.value,
                "opened_at": s.opened_at.isoformat() if s.opened_at else None,
                "closed_at": s.closed_at.isoformat() if s.closed_at else None,
                "hours": shift_hours(s),
                "anomaly_flag": s.anomaly_flag,
                "anomaly_resolved": s.anomaly_resolved_at is not None,
                "is_extra_shift": s.is_extra_shift,
                "extra_shift_reason": s.extra_shift_reason,
                "is_corrected": s.payroll_entry.is_corrected if s.payroll_entry else False,
                "note": s.note,
            }
            for s in shifts
        ],
    }


@router.post("/{branch_id}/{review_date}/verify")
async def verify_day(
    branch_id: int,
    review_date: date,
    body: dict = {},
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_accountant),
):
    """Бухгалтер закрывает проверку дня → GREEN."""
    review = await compute_and_save_review(db, branch_id, review_date)
    old_status = review.status

    review.status = "green"
    review.reviewed_by = current_user.id
    review.reviewed_at = datetime.now(timezone.utc)
    if body.get("notes"):
        review.notes = body["notes"]
    review.updated_at = datetime.now(timezone.utc)

    await write_audit(
        db,
        entity_type="daily_review",
        entity_id=review.id,
        action="verify",
        user=current_user,
        branch_id=branch_id,
        work_date=review_date,
        old_value={"status": old_status},
        new_value={"status": "green"},
        comment=body.get("notes"),
    )

    await db.commit()
    return {
        "ok": True,
        "branch_id": branch_id,
        "date": str(review_date),
        "status": "green",
        "reviewed_by": current_user.full_name,
        "reviewed_at": review.reviewed_at.isoformat(),
    }


@router.post("/{branch_id}/{review_date}/reopen")
async def reopen_day(
    branch_id: int,
    review_date: date,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_accountant),
):
    """Вернуть GREEN → YELLOW (нашли ошибку после закрытия)."""
    review = await compute_and_save_review(db, branch_id, review_date, force_recalculate=True)
    old_status = review.status
    review.reviewed_by = None
    review.reviewed_at = None
    review.updated_at = datetime.now(timezone.utc)

    await write_audit(
        db,
        entity_type="daily_review",
        entity_id=review.id,
        action="reopen",
        user=current_user,
        branch_id=branch_id,
        work_date=review_date,
        old_value={"status": old_status},
        new_value={"status": review.status},
    )
    await db.commit()
    return {"ok": True, "branch_id": branch_id, "date": str(review_date), "status": review.status}


@router.post("/shifts/{shift_id}/resolve")
async def resolve_anomaly(
    shift_id: int,
    body: dict = {},
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_accountant),
):
    """Бухгалтер разрешает аномальную смену."""
    shift_res = await db.execute(
        select(Shift).options(selectinload(Shift.employee)).where(Shift.id == shift_id)
    )
    shift = shift_res.scalar_one_or_none()
    if not shift:
        raise HTTPException(404, "Смена не найдена")

    old_flag = shift.anomaly_flag
    now = datetime.now(timezone.utc)

    if "approved_hours" in body and body["approved_hours"] is not None:
        shift.approved_hours = Decimal(str(body["approved_hours"]))

    shift.anomaly_resolved_by = current_user.id
    shift.anomaly_resolved_at = now

    await write_audit(
        db,
        entity_type="shift",
        entity_id=shift_id,
        action="resolve_anomaly",
        user=current_user,
        branch_id=shift.branch_id,
        work_date=shift.date,
        old_value={"anomaly_flag": old_flag, "approved_hours": float(shift.approved_hours) if shift.approved_hours else None},
        new_value={"anomaly_resolved": True, "approved_hours": float(shift.approved_hours) if shift.approved_hours else None},
        comment=body.get("comment"),
    )

    await compute_and_save_review(db, shift.branch_id, shift.date)
    await db.commit()

    return {
        "ok": True,
        "shift_id": shift_id,
        "anomaly_flag": old_flag,
        "resolved_by": current_user.full_name,
        "resolved_at": now.isoformat(),
    }


@router.get("/audit-log")
async def get_audit_log(
    from_date: date,
    to_date: date,
    branch_id: int | None = None,
    entity_type: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_accountant),
):
    """Журнал всех изменений за период."""
    q = select(AuditLog).where(
        and_(AuditLog.work_date >= from_date, AuditLog.work_date <= to_date)
    ).order_by(desc(AuditLog.created_at))

    if branch_id:
        q = q.where(AuditLog.branch_id == branch_id)
    if entity_type:
        q = q.where(AuditLog.entity_type == entity_type)

    logs = (await db.execute(q)).scalars().all()

    return [
        {
            "id": log.id,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "action": log.action,
            "user_name": log.user_name,
            "branch_id": log.branch_id,
            "work_date": str(log.work_date) if log.work_date else None,
            "old_value": log.old_value,
            "new_value": log.new_value,
            "comment": log.comment,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]
