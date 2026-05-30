"""
Проверка дней бухгалтером: статусы филиалов RED/YELLOW/GREEN.
v2: полная детальная карточка с данными payroll, план/факт, корректировка смен.
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
from app.models.payroll import PayrollEntry, FotSummary
from app.models.report import BranchDailyReport
from app.models.schedule import SchedulePlan
from app.models.employee import Employee, EmployeeRate
from app.models.branch import Branch
from app.models.position import PaymentType
from app.models.review import DailyBranchReview
from app.models.audit import AuditLog
from app.utils.review_helpers import (
    compute_and_save_review, write_audit,
    ISSUE_DAY_NOT_CLOSED, ISSUE_UNCLOSED_SHIFTS,
    ISSUE_ANOMALY_WARNING, ISSUE_ANOMALY_CRITICAL,
    ISSUE_EXTRA_SHIFTS, ISSUE_MANUAL_CORR,
)
from app.routers.admin import _recalculate_fot_summary

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
    """Полная детальная карточка дня: сводка, план/факт, смены с payroll, замечания."""
    review = await compute_and_save_review(db, branch_id, review_date)
    await db.commit()

    # ── Отчёт дня ─────────────────────────────────────────────────────────
    report_res = await db.execute(
        select(BranchDailyReport).where(
            and_(BranchDailyReport.branch_id == branch_id, BranchDailyReport.date == review_date)
        )
    )
    report = report_res.scalar_one_or_none()

    # ── ФОТ summary ────────────────────────────────────────────────────────
    fot_res = await db.execute(
        select(FotSummary).where(
            and_(FotSummary.branch_id == branch_id, FotSummary.date == review_date)
        )
    )
    fot = fot_res.scalar_one_or_none()

    # ── Смены с payroll и employee ─────────────────────────────────────────
    shifts_res = await db.execute(
        select(Shift).options(
            selectinload(Shift.employee).selectinload(Employee.position),
            selectinload(Shift.employee).selectinload(Employee.rates),
            selectinload(Shift.payroll_entry),
        ).where(
            and_(Shift.branch_id == branch_id, Shift.date == review_date)
        ).order_by(Shift.opened_at)
    )
    shifts = shifts_res.scalars().all()

    # ── Планы (SchedulePlan) ───────────────────────────────────────────────
    emp_ids = [s.employee_id for s in shifts]
    plans_res = await db.execute(
        select(SchedulePlan).where(
            and_(
                SchedulePlan.branch_id == branch_id,
                SchedulePlan.date == review_date,
                SchedulePlan.employee_id.in_(emp_ids) if emp_ids else False,
            )
        )
    )
    plans_by_emp: dict[int, SchedulePlan] = {p.employee_id: p for p in plans_res.scalars().all()}

    # ── Вспомогательные функции ────────────────────────────────────────────
    def shift_hours(s: Shift) -> float | None:
        if s.approved_hours is not None:
            return float(s.approved_hours)
        if s.closed_at and s.opened_at:
            return round((s.closed_at - s.opened_at).total_seconds() / 3600, 2)
        return None

    def rate_for_date(emp: Employee, work_date: date) -> tuple[float | None, str | None]:
        """Ставка актуальная на дату смены."""
        if not emp or not emp.rates:
            return None, None
        applicable = [r for r in emp.rates if r.effective_from <= work_date]
        if not applicable:
            return None, None
        rate = max(applicable, key=lambda r: r.effective_from)
        return float(rate.rate), (float(rate.fixed_daily_rate) if rate.fixed_daily_rate else None)

    # ── Сборка списка смен ─────────────────────────────────────────────────
    shift_list = []
    total_plan_hours = Decimal("0")
    total_fact_hours = Decimal("0")
    total_plan_fot = Decimal("0")

    ZERO = Decimal("0")

    for s in shifts:
        emp = s.employee
        pe = s.payroll_entry
        plan = plans_by_emp.get(s.employee_id)
        hours = shift_hours(s)

        pos = emp.position if emp else None
        rate_val, fixed_daily = rate_for_date(emp, review_date) if emp else (None, None)

        # Из payroll entry берём актуальные данные начисления
        pe_rate = float(pe.rate) if pe else rate_val
        pe_hours = float(pe.approved_hours) if pe else hours
        pe_base_pay = float(pe.base_pay) if pe else None
        pe_bonus = float(pe.bonus) if pe else 0.0
        pe_total = float(pe.total_pay) if pe else None

        # Аннулирована = скорректирована бухгалтером до 0 часов
        is_annulled = bool(pe and pe.is_corrected and pe.approved_hours == ZERO and hours is not None and hours > 0)

        # План
        if plan:
            total_plan_hours += plan.planned_hours
            if pe_rate and plan.planned_hours:
                total_plan_fot += Decimal(str(pe_rate)) * plan.planned_hours

        if hours:
            total_fact_hours += Decimal(str(hours))

        # Определить статус смены
        shift_status = s.status.value
        if is_annulled:
            shift_status = "annulled"

        shift_list.append({
            "id": s.id,
            "employee_id": s.employee_id,
            "employee_name": emp.full_name if emp else "—",
            "position_name": pos.name if pos else "—",
            "category": pos.category.value if pos else "—",
            "payment_type": pos.payment_type.value if pos else "—",
            "comment": emp.comment if emp else None,
            # Смена
            "status": shift_status,
            "is_extra_shift": s.is_extra_shift,
            "extra_shift_reason": s.extra_shift_reason,
            "opened_at": s.opened_at.isoformat() if s.opened_at else None,
            "closed_at": s.closed_at.isoformat() if s.closed_at else None,
            "hours": hours,
            "anomaly_flag": s.anomaly_flag,
            "anomaly_resolved": s.anomaly_resolved_at is not None,
            "is_corrected": bool(pe and pe.is_corrected),
            "is_annulled": is_annulled,
            "note": s.note,
            # Ставка (из payroll entry — актуальная на дату)
            "rate": pe_rate,
            "fixed_daily_rate": fixed_daily,
            # Начисление
            "approved_hours": pe_hours,
            "base_pay": pe_base_pay,
            "bonus": pe_bonus,
            "total_pay": pe_total,
            # План (из SchedulePlan)
            "plan_hours": float(plan.planned_hours) if plan else None,
            "plan_start": str(plan.start_time) if plan and plan.start_time else None,
            "plan_end": str(plan.end_time) if plan and plan.end_time else None,
        })

    # ── Сводка дня ────────────────────────────────────────────────────────
    revenue = float(report.revenue) if report else None
    orders = report.orders_count if report else None
    takeaways = report.takeaway_count if report else None
    avg_check = round(revenue / orders, 2) if revenue and orders else None

    total_fot = float(fot.total_fot) if fot else None
    kitchen_fot = float(fot.kitchen_fot) if fot else None
    total_fot_pct = float(fot.total_fot_pct) if fot else None
    kitchen_fot_pct = float(fot.kitchen_fot_pct) if fot else None
    status_total = fot.status_total.value if fot and fot.status_total else None
    status_kitchen = fot.status_kitchen.value if fot and fot.status_kitchen else None

    # ── Текстовый вывод ─────────────────────────────────────────────────────
    def day_verdict() -> str:
        if not fot:
            return "ФОТ не рассчитан — день не закрыт."
        issues_critical = [i for i in review.issues
                           if i in (ISSUE_UNCLOSED_SHIFTS, ISSUE_ANOMALY_CRITICAL)]
        if issues_critical:
            return "Есть критические замечания. Необходима проверка."
        if status_total == "red":
            diff = total_fot_pct - 29.0 if total_fot_pct else 0
            return f"ФОТ превышен на {diff:.1f} п.п. Проверьте часы сотрудников."
        if status_kitchen == "red":
            diff = kitchen_fot_pct - 15.5 if kitchen_fot_pct else 0
            return f"ФОТ кухни превышен на {diff:.1f} п.п. Проверьте смены кухни."
        if not review.issues:
            return "День в норме. ФОТ в пределах плана."
        return "Есть замечания, требующие проверки бухгалтера."

    # ── Reviewer name ──────────────────────────────────────────────────────
    reviewer_name = None
    if review.reviewed_by:
        u_res = await db.execute(select(User).where(User.id == review.reviewed_by))
        u = u_res.scalar_one_or_none()
        reviewer_name = u.full_name if u else None

    return {
        "branch_id": branch_id,
        "date": str(review_date),
        "status": review.status,
        "emoji": STATUS_EMOJI.get(review.status, ""),
        "issues_count": review.issues_count,
        "issues": review.issues,
        "issues_labels": [ISSUE_LABELS.get(i, i) for i in review.issues],
        "reviewed_by": reviewer_name,
        "reviewed_at": review.reviewed_at.isoformat() if review.reviewed_at else None,
        "notes": review.notes,
        # Сводка дня
        "daily_report": {
            "revenue": revenue,
            "orders_count": orders,
            "takeaway_count": takeaways,
            "avg_check": avg_check,
        },
        # ФОТ
        "fot": {
            "total_fot": total_fot,
            "kitchen_fot": kitchen_fot,
            "total_fot_pct": total_fot_pct,
            "kitchen_fot_pct": kitchen_fot_pct,
            "status_total": status_total,
            "status_kitchen": status_kitchen,
        },
        # План/факт (по часам)
        "plan_fact": {
            "plan_hours": float(total_plan_hours),
            "fact_hours": float(total_fact_hours),
            "plan_fot": float(total_plan_fot),
            "fact_fot": total_fot,
        },
        # Итоговый вердикт
        "verdict": day_verdict(),
        # Смены
        "shifts": shift_list,
    }


@router.patch("/shifts/{shift_id}/correct")
async def correct_shift_full(
    shift_id: int,
    body: dict = {},
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_accountant),
):
    """
    Полная корректировка смены бухгалтером:
    - edit opened_at / closed_at → пересчёт часов
    - override approved_hours напрямую
    - rate_override → разовая ставка для этой смены
    - annul=true → аннулировать смену (часы=0)
    - note — комментарий (необязателен для стандартных корректировок,
              обязателен для аннулирования)
    """
    shift_res = await db.execute(
        select(Shift).options(
            selectinload(Shift.employee).selectinload(Employee.position),
            selectinload(Shift.employee).selectinload(Employee.rates),
            selectinload(Shift.payroll_entry),
        ).where(Shift.id == shift_id)
    )
    shift = shift_res.scalar_one_or_none()
    if not shift:
        raise HTTPException(404, "Смена не найдена")

    annul = body.get("annul", False)
    note = body.get("note") or shift.note
    ZERO = Decimal("0")

    # Запомнить старые значения для аудита
    old = {
        "opened_at": shift.opened_at.isoformat() if shift.opened_at else None,
        "closed_at": shift.closed_at.isoformat() if shift.closed_at else None,
        "approved_hours": float(shift.approved_hours) if shift.approved_hours is not None else None,
        "status": shift.status.value,
    }

    # Аннулирование требует комментария
    if annul and not note:
        raise HTTPException(422, "Для аннулирования смены необходим комментарий")

    now = datetime.now(timezone.utc)

    # ── Изменение времени ──────────────────────────────────────────────────
    if "opened_at" in body and body["opened_at"]:
        shift.opened_at = datetime.fromisoformat(body["opened_at"].replace("Z", "+00:00"))

    if "closed_at" in body and body["closed_at"]:
        shift.closed_at = datetime.fromisoformat(body["closed_at"].replace("Z", "+00:00"))
        if shift.status == ShiftStatus.open:
            shift.status = ShiftStatus.closed

    # Пересчёт часов по новым временам (если не передан approved_hours явно)
    if ("opened_at" in body or "closed_at" in body) and "approved_hours" not in body and not annul:
        if shift.closed_at and shift.opened_at:
            opened = shift.opened_at
            closed = shift.closed_at
            if opened.tzinfo is None:
                opened = opened.replace(tzinfo=timezone.utc)
            if closed.tzinfo is None:
                closed = closed.replace(tzinfo=timezone.utc)
            secs = (closed - opened).total_seconds()
            shift.total_minutes = int(secs / 60)
            shift.total_hours_decimal = Decimal(str(round(secs / 3600, 4)))
            shift.approved_hours = Decimal(str(round(secs / 3600, 2)))

    # ── Прямое переопределение часов ──────────────────────────────────────
    if "approved_hours" in body and not annul:
        shift.approved_hours = Decimal(str(body["approved_hours"]))

    # ── Аннулирование ─────────────────────────────────────────────────────
    if annul:
        shift.approved_hours = ZERO
        if shift.status == ShiftStatus.open:
            shift.status = ShiftStatus.closed
            shift.closed_at = now

    # ── Закрыть незакрытую смену ───────────────────────────────────────────
    if shift.status == ShiftStatus.open and shift.approved_hours is not None:
        shift.status = ShiftStatus.closed
        if not shift.closed_at:
            shift.closed_at = now

    if note:
        shift.note = note

    await db.flush()

    # ── Пересчёт PayrollEntry ──────────────────────────────────────────────
    pe = shift.payroll_entry
    emp = shift.employee
    pos = emp.position if emp else None
    approved_hours = shift.approved_hours or ZERO

    # Ставка: из body rate_override → иначе из payroll entry → иначе из истории ставок
    if "rate_override" in body and body["rate_override"] is not None:
        use_rate = Decimal(str(body["rate_override"]))
    elif pe:
        use_rate = pe.rate
    elif emp and emp.rates:
        applicable = [r for r in emp.rates if r.effective_from <= shift.date]
        rate_entry = max(applicable, key=lambda r: r.effective_from) if applicable else None
        use_rate = rate_entry.rate if rate_entry else ZERO
    else:
        use_rate = ZERO

    if approved_hours > ZERO and pos:
        if pos.payment_type == PaymentType.fixed_daily:
            base_pay = use_rate  # фикс/день
        else:
            base_pay = round(use_rate * approved_hours, 2)
        bonus = pe.bonus if pe else ZERO
        total_pay = base_pay + bonus
    else:
        base_pay = ZERO
        bonus = pe.bonus if pe else ZERO
        total_pay = ZERO

    if pe:
        pe.approved_hours = approved_hours
        pe.hours_worked = approved_hours
        pe.rate = use_rate
        pe.base_pay = base_pay
        pe.total_pay = total_pay
        pe.is_corrected = True
        pe.corrected_by = current_user.id
        pe.corrected_at = now
        if note:
            pe.notes = note
    elif approved_hours > ZERO and pos:
        new_pe = PayrollEntry(
            employee_id=shift.employee_id,
            branch_id=shift.branch_id,
            date=shift.date,
            shift_id=shift.id,
            hours_worked=approved_hours,
            approved_hours=approved_hours,
            rate=use_rate,
            base_pay=base_pay,
            bonus=ZERO,
            total_pay=total_pay,
            payment_type=pos.payment_type.value,
            is_corrected=True,
            corrected_by=current_user.id,
            corrected_at=now,
            notes=note,
        )
        db.add(new_pe)

    await db.flush()
    await _recalculate_fot_summary(db, shift.branch_id, shift.date)

    new = {
        "opened_at": shift.opened_at.isoformat() if shift.opened_at else None,
        "closed_at": shift.closed_at.isoformat() if shift.closed_at else None,
        "approved_hours": float(shift.approved_hours) if shift.approved_hours is not None else None,
        "rate": float(use_rate),
        "total_pay": float(total_pay),
        "annulled": annul,
    }

    await write_audit(
        db,
        entity_type="shift",
        entity_id=shift_id,
        action="annul" if annul else "correct",
        user=current_user,
        branch_id=shift.branch_id,
        work_date=shift.date,
        old_value=old,
        new_value=new,
        comment=note,
    )

    await compute_and_save_review(db, shift.branch_id, shift.date)
    await db.commit()

    return {"ok": True, "shift_id": shift_id, **new}


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
