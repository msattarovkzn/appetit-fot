from datetime import date, timedelta
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.branch import Branch
from app.models.employee import Employee
from app.models.payroll import FotSummary, PayrollEntry
from app.models.shift import Shift, ShiftStatus
from app.models.report import BranchDailyReport
from app.models.user import User
from app.dependencies import require_manager
from app.schemas.report import DashboardDay
from app.schemas.dashboard import (
    BranchFotSummary, BranchFotDetail, NetworkFotSummary, EmployeePayrollRow,
)
from app.business_rules import (
    fot_status_total as _status_total,
    fot_status_kitchen as _status_kitchen,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

ZERO = Decimal("0")


def _safe_pct(numerator: Decimal, denominator: Decimal) -> Decimal | None:
    if not denominator:
        return None
    return round(numerator / denominator * 100, 2)


# ─── Existing endpoint (manager page) ────────────────────────────────────────

@router.get("", response_model=list[DashboardDay])
async def get_dashboard(
    from_date: date | None = None,
    to_date: date | None = None,
    branch_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    if not to_date:
        to_date = date.today()
    if not from_date:
        from_date = to_date - timedelta(days=6)

    branches_q = select(Branch).where(Branch.is_active == True)
    if branch_id:
        branches_q = branches_q.where(Branch.id == branch_id)
    elif current_user.branch_id:
        branches_q = branches_q.where(Branch.id == current_user.branch_id)

    branches_result = await db.execute(branches_q)
    branches = branches_result.scalars().all()
    branch_map = {b.id: b for b in branches}
    branch_ids = list(branch_map.keys())

    fot_result = await db.execute(
        select(FotSummary).where(
            and_(
                FotSummary.branch_id.in_(branch_ids),
                FotSummary.date >= from_date,
                FotSummary.date <= to_date,
            )
        )
    )
    fot_map: dict[tuple, FotSummary] = {}
    for fs in fot_result.scalars().all():
        fot_map[(fs.branch_id, fs.date)] = fs

    open_shifts_result = await db.execute(
        select(Shift).where(
            and_(
                Shift.branch_id.in_(branch_ids),
                Shift.date >= from_date,
                Shift.date <= to_date,
                Shift.status == ShiftStatus.open,
            )
        )
    )
    open_count: dict[tuple, int] = {}
    for s in open_shifts_result.scalars().all():
        key = (s.branch_id, s.date)
        open_count[key] = open_count.get(key, 0) + 1

    reports_result = await db.execute(
        select(BranchDailyReport).where(
            and_(
                BranchDailyReport.branch_id.in_(branch_ids),
                BranchDailyReport.date >= from_date,
                BranchDailyReport.date <= to_date,
            )
        )
    )
    orders_map: dict[tuple, int] = {}
    for r in reports_result.scalars().all():
        orders_map[(r.branch_id, r.date)] = r.orders_count

    rows = []
    current = from_date
    while current <= to_date:
        for bid in branch_ids:
            fs = fot_map.get((bid, current))
            rows.append(DashboardDay(
                date=current,
                branch_id=bid,
                branch_name=branch_map[bid].name,
                revenue=fs.revenue if fs else None,
                orders_count=orders_map.get((bid, current)),
                total_fot=fs.total_fot if fs else None,
                kitchen_fot=fs.kitchen_fot if fs else None,
                total_fot_pct=fs.total_fot_pct if fs else None,
                kitchen_fot_pct=fs.kitchen_fot_pct if fs else None,
                status_total=fs.status_total if fs else None,
                status_kitchen=fs.status_kitchen if fs else None,
                open_shifts=open_count.get((bid, current), 0),
            ))
        current += timedelta(days=1)

    return rows


# ─── New endpoints ────────────────────────────────────────────────────────────

@router.get("/branches", response_model=list[BranchFotSummary])
async def get_branches_fot(
    from_date: date,
    to_date: date,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Сводка по всем филиалам за период — для сетевого дашборда."""
    branches_result = await db.execute(
        select(Branch).where(Branch.is_active == True).order_by(Branch.id)
    )
    branches = branches_result.scalars().all()

    fot_result = await db.execute(
        select(FotSummary).where(
            and_(FotSummary.date >= from_date, FotSummary.date <= to_date)
        )
    )
    fot_by_branch: dict[int, list[FotSummary]] = {}
    for fs in fot_result.scalars().all():
        fot_by_branch.setdefault(fs.branch_id, []).append(fs)

    report_result = await db.execute(
        select(BranchDailyReport).where(
            and_(BranchDailyReport.date >= from_date, BranchDailyReport.date <= to_date)
        )
    )
    orders_by_branch: dict[int, int] = {}
    for r in report_result.scalars().all():
        orders_by_branch[r.branch_id] = orders_by_branch.get(r.branch_id, 0) + r.orders_count

    result = []
    for b in branches:
        fots = fot_by_branch.get(b.id, [])
        revenue = sum((f.revenue for f in fots), ZERO)
        total_fot = sum((f.total_fot for f in fots), ZERO)
        kitchen_fot = sum((f.kitchen_fot for f in fots), ZERO)

        total_fot_pct = _safe_pct(total_fot, revenue)
        kitchen_fot_pct = _safe_pct(kitchen_fot, revenue)

        result.append(BranchFotSummary(
            branch_id=b.id,
            branch_name=b.name,
            revenue=revenue,
            orders_count=orders_by_branch.get(b.id, 0),
            total_fot=total_fot,
            kitchen_fot=kitchen_fot,
            total_fot_pct=total_fot_pct,
            kitchen_fot_pct=kitchen_fot_pct,
            status_total=_status_total(total_fot_pct) if total_fot_pct is not None else None,
            status_kitchen=_status_kitchen(kitchen_fot_pct) if kitchen_fot_pct is not None else None,
            days_closed=len(fots),
        ))

    return result


@router.get("/branch/{branch_id}", response_model=BranchFotDetail)
async def get_branch_fot_detail(
    branch_id: int,
    from_date: date,
    to_date: date,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Детальный ФОТ-отчёт по одному филиалу с разбивкой по сотрудникам."""
    branch_result = await db.execute(select(Branch).where(Branch.id == branch_id))
    branch = branch_result.scalar_one_or_none()
    if not branch:
        raise HTTPException(status_code=404, detail="Филиал не найден")

    # Aggregate fot_summary for the period
    fot_result = await db.execute(
        select(FotSummary).where(
            and_(
                FotSummary.branch_id == branch_id,
                FotSummary.date >= from_date,
                FotSummary.date <= to_date,
            )
        )
    )
    fots = fot_result.scalars().all()

    revenue = sum((f.revenue for f in fots), ZERO)
    total_fot = sum((f.total_fot for f in fots), ZERO)
    kitchen_fot = sum((f.kitchen_fot for f in fots), ZERO)
    admin_fot = sum((f.admin_fot for f in fots), ZERO)
    tech_fot = sum((f.tech_fot for f in fots), ZERO)
    courier_fot = sum((f.courier_fot for f in fots), ZERO)
    reserve_fot = sum((f.reserve_fot for f in fots), ZERO)

    total_fot_pct = _safe_pct(total_fot, revenue) or ZERO
    kitchen_fot_pct = _safe_pct(kitchen_fot, revenue) or ZERO

    # Orders from daily reports
    report_result = await db.execute(
        select(BranchDailyReport).where(
            and_(
                BranchDailyReport.branch_id == branch_id,
                BranchDailyReport.date >= from_date,
                BranchDailyReport.date <= to_date,
            )
        )
    )
    orders_count = sum(r.orders_count for r in report_result.scalars().all())

    # Employee payroll entries with names and categories
    entries_result = await db.execute(
        select(PayrollEntry)
        .where(
            and_(
                PayrollEntry.branch_id == branch_id,
                PayrollEntry.date >= from_date,
                PayrollEntry.date <= to_date,
                PayrollEntry.is_corrected == False,
            )
        )
        .options(
            selectinload(PayrollEntry.employee).selectinload(Employee.position)
        )
        .order_by(PayrollEntry.date)
    )
    all_entries = entries_result.scalars().all()

    # Aggregate by employee across all days
    emp_agg: dict[int, dict] = {}
    for e in all_entries:
        eid = e.employee_id
        if eid not in emp_agg:
            pos = e.employee.position
            emp_agg[eid] = {
                "employee_id": eid,
                "employee_name": e.employee.full_name,
                "category": pos.category.value if pos else "unknown",
                "payment_type": e.payment_type,
                "approved_hours": ZERO,
                "rate": e.rate,  # latest seen rate
                "base_pay": ZERO,
                "bonus": ZERO,
                "total_pay": ZERO,
            }
        emp_agg[eid]["approved_hours"] += e.approved_hours
        emp_agg[eid]["base_pay"] += e.base_pay
        emp_agg[eid]["bonus"] += e.bonus
        emp_agg[eid]["total_pay"] += e.total_pay
        emp_agg[eid]["rate"] = e.rate  # overwrite → last seen is most recent

    # Sort by category then name
    category_order = {"admin": 0, "kitchen": 1, "tech": 2, "courier": 3, "reserve": 4}
    sorted_emps = sorted(
        emp_agg.values(),
        key=lambda x: (category_order.get(x["category"], 9), x["employee_name"])
    )
    employee_rows = [EmployeePayrollRow(**row) for row in sorted_emps]

    plan_total = round(revenue * Decimal("0.29"), 2)
    plan_kitchen = round(revenue * Decimal("0.155"), 2)

    return BranchFotDetail(
        branch_id=branch_id,
        branch_name=branch.name,
        from_date=from_date,
        to_date=to_date,
        revenue=revenue,
        orders_count=orders_count,
        total_fot=total_fot,
        kitchen_fot=kitchen_fot,
        admin_fot=admin_fot,
        tech_fot=tech_fot,
        courier_fot=courier_fot,
        reserve_fot=reserve_fot,
        total_fot_pct=total_fot_pct,
        kitchen_fot_pct=kitchen_fot_pct,
        status_total=_status_total(total_fot_pct),
        status_kitchen=_status_kitchen(kitchen_fot_pct),
        plan_total=plan_total,
        plan_kitchen=plan_kitchen,
        deviation_total=round(total_fot - plan_total, 2),
        deviation_kitchen=round(kitchen_fot - plan_kitchen, 2),
        entries=employee_rows,
    )


@router.get("/network", response_model=NetworkFotSummary)
async def get_network_fot(
    from_date: date,
    to_date: date,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Сетевой итог: сумма по всем филиалам за период."""
    fot_result = await db.execute(
        select(FotSummary).where(
            and_(FotSummary.date >= from_date, FotSummary.date <= to_date)
        )
    )
    fots = fot_result.scalars().all()

    total_revenue = sum((f.revenue for f in fots), ZERO)
    total_fot = sum((f.total_fot for f in fots), ZERO)
    total_fot_pct = _safe_pct(total_fot, total_revenue)

    # Reuse branches endpoint logic for per-branch breakdown
    branches_result = await db.execute(
        select(Branch).where(Branch.is_active == True).order_by(Branch.id)
    )
    branches = {b.id: b for b in branches_result.scalars().all()}

    fot_by_branch: dict[int, list[FotSummary]] = {}
    for fs in fots:
        fot_by_branch.setdefault(fs.branch_id, []).append(fs)

    report_result = await db.execute(
        select(BranchDailyReport).where(
            and_(BranchDailyReport.date >= from_date, BranchDailyReport.date <= to_date)
        )
    )
    orders_by_branch: dict[int, int] = {}
    for r in report_result.scalars().all():
        orders_by_branch[r.branch_id] = orders_by_branch.get(r.branch_id, 0) + r.orders_count

    branch_summaries = []
    for bid, b in sorted(branches.items()):
        b_fots = fot_by_branch.get(bid, [])
        b_rev = sum((f.revenue for f in b_fots), ZERO)
        b_fot = sum((f.total_fot for f in b_fots), ZERO)
        b_kit = sum((f.kitchen_fot for f in b_fots), ZERO)
        b_fot_pct = _safe_pct(b_fot, b_rev)
        b_kit_pct = _safe_pct(b_kit, b_rev)
        branch_summaries.append(BranchFotSummary(
            branch_id=bid,
            branch_name=b.name,
            revenue=b_rev,
            orders_count=orders_by_branch.get(bid, 0),
            total_fot=b_fot,
            kitchen_fot=b_kit,
            total_fot_pct=b_fot_pct,
            kitchen_fot_pct=b_kit_pct,
            status_total=_status_total(b_fot_pct) if b_fot_pct is not None else None,
            status_kitchen=_status_kitchen(b_kit_pct) if b_kit_pct is not None else None,
            days_closed=len(b_fots),
        ))

    return NetworkFotSummary(
        from_date=from_date,
        to_date=to_date,
        total_revenue=total_revenue,
        total_fot=total_fot,
        total_fot_pct=total_fot_pct,
        branches=branch_summaries,
    )
