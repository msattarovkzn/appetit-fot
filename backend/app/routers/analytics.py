"""
Analytics router — сводная аналитика по сети/филиалу.
Блок 8: 14 показателей, тренды, план/факт, лучший/худший.
"""
from datetime import date, timedelta
from decimal import Decimal
from collections import defaultdict
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func as sa_func

from app.database import get_db
from app.dependencies import require_manager
from app.models.user import User
from app.models.report import BranchDailyReport
from app.models.payroll import FotSummary
from app.models.branch import Branch

router = APIRouter(prefix="/analytics", tags=["analytics"])

ZERO = Decimal("0")


def _pct_diff(a: float | None, b: float | None) -> float | None:
    """Процентное отклонение a от b: (a-b)/b*100."""
    if a is None or b is None or b == 0:
        return None
    return round((a - b) / b * 100, 1)


def _abs_diff(a: float | None, b: float | None) -> float | None:
    if a is None or b is None:
        return None
    return round(a - b, 2)


def _weekday_ru(d: date) -> str:
    names = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
    return names[d.weekday()]


async def _get_reports(db: AsyncSession, from_date: date, to_date: date,
                       branch_id: int | None = None) -> list[BranchDailyReport]:
    q = select(BranchDailyReport).where(
        and_(BranchDailyReport.date >= from_date, BranchDailyReport.date <= to_date)
    ).order_by(BranchDailyReport.date)
    if branch_id:
        q = q.where(BranchDailyReport.branch_id == branch_id)
    return (await db.execute(q)).scalars().all()


async def _get_fot(db: AsyncSession, from_date: date, to_date: date,
                   branch_id: int | None = None) -> list[FotSummary]:
    q = select(FotSummary).where(
        and_(FotSummary.date >= from_date, FotSummary.date <= to_date)
    )
    if branch_id:
        q = q.where(FotSummary.branch_id == branch_id)
    return (await db.execute(q)).scalars().all()


@router.get("/overview")
async def get_analytics_overview(
    from_date: date,
    to_date: date,
    branch_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_manager),
):
    """
    Полная аналитическая сводка:
    - Сравнение периодов (день/неделя/месяц)
    - Тренды по дням
    - Лучший/худший день недели
    - Лучший/худший филиал (если branch_id не указан)
    - Прогноз месяца
    """
    reports = await _get_reports(db, from_date, to_date, branch_id)
    fot_list = await _get_fot(db, from_date, to_date, branch_id)

    # Индексируем ФОТ по (branch_id, date)
    fot_by_key: dict[tuple, FotSummary] = {}
    for f in fot_list:
        fot_by_key[(f.branch_id, f.date)] = f

    # Агрегируем по дате (для графика тренда)
    by_date: dict[date, dict] = {}
    for r in reports:
        d = r.date
        if d not in by_date:
            by_date[d] = {"revenue": 0.0, "orders": 0, "takeaways": 0,
                          "total_fot": 0.0, "kitchen_fot": 0.0, "days": 0}
        by_date[d]["revenue"] += float(r.revenue or 0)
        by_date[d]["orders"] += r.orders_count or 0
        by_date[d]["takeaways"] += r.takeaway_count or 0
        by_date[d]["days"] += 1
        fot = fot_by_key.get((r.branch_id, r.date))
        if fot:
            by_date[d]["total_fot"] += float(fot.total_fot or 0)
            by_date[d]["kitchen_fot"] += float(fot.kitchen_fot or 0)

    sorted_dates = sorted(by_date.keys())

    # ── Итоги за период ───────────────────────────────────────────────────────
    total_revenue = sum(v["revenue"] for v in by_date.values())
    total_orders = sum(v["orders"] for v in by_date.values())
    total_takeaways = sum(v["takeaways"] for v in by_date.values())
    total_fot_sum = sum(v["total_fot"] for v in by_date.values())
    kitchen_fot_sum = sum(v["kitchen_fot"] for v in by_date.values())
    days_count = len(sorted_dates)
    avg_revenue = round(total_revenue / days_count, 2) if days_count else 0
    avg_orders = round(total_orders / days_count, 2) if days_count else 0
    avg_check = round(total_revenue / total_orders, 2) if total_orders else None
    total_fot_pct = round(total_fot_sum / total_revenue * 100, 2) if total_revenue else None
    kitchen_fot_pct = round(kitchen_fot_sum / total_revenue * 100, 2) if total_revenue else None

    # ── Предыдущий аналогичный период (для сравнения) ────────────────────────
    period_days = (to_date - from_date).days + 1
    prev_from = from_date - timedelta(days=period_days)
    prev_to = from_date - timedelta(days=1)
    prev_reports = await _get_reports(db, prev_from, prev_to, branch_id)
    prev_revenue = sum(float(r.revenue or 0) for r in prev_reports)
    prev_orders = sum(r.orders_count or 0 for r in prev_reports)
    prev_days = len({r.date for r in prev_reports})
    prev_avg_rev = round(prev_revenue / prev_days, 2) if prev_days else None
    prev_check = round(prev_revenue / prev_orders, 2) if prev_orders else None

    # ── Тренд по дням ─────────────────────────────────────────────────────────
    trend = []
    for d in sorted_dates:
        v = by_date[d]
        orders = v["orders"]
        rev = v["revenue"]
        avg_ch = round(rev / orders, 2) if orders else None
        fot_pct = round(v["total_fot"] / rev * 100, 2) if rev else None
        kitch_pct = round(v["kitchen_fot"] / rev * 100, 2) if rev else None
        trend.append({
            "date": str(d),
            "weekday": _weekday_ru(d),
            "revenue": round(rev, 2),
            "orders": orders,
            "takeaways": v["takeaways"],
            "avg_check": avg_ch,
            "total_fot": round(v["total_fot"], 2),
            "kitchen_fot": round(v["kitchen_fot"], 2),
            "total_fot_pct": fot_pct,
            "kitchen_fot_pct": kitch_pct,
        })

    # ── Лучший/худший день недели ─────────────────────────────────────────────
    by_weekday: dict[int, list[float]] = defaultdict(list)
    for d in sorted_dates:
        by_weekday[d.weekday()].append(by_date[d]["revenue"])

    wd_avg: dict[int, float] = {}
    for wd, revs in by_weekday.items():
        wd_avg[wd] = round(sum(revs) / len(revs), 2)

    WDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
    weekday_stats = [
        {"weekday": WDAYS[wd], "avg_revenue": avg_rev, "samples": len(by_weekday[wd])}
        for wd, avg_rev in sorted(wd_avg.items())
    ]

    best_wd = max(wd_avg, key=lambda x: wd_avg[x]) if wd_avg else None
    worst_wd = min(wd_avg, key=lambda x: wd_avg[x]) if wd_avg else None

    # ── Лучший/худший филиал ──────────────────────────────────────────────────
    branch_stats: list[dict] = []
    if not branch_id:
        by_branch: dict[int, dict] = {}
        for r in reports:
            bid = r.branch_id
            if bid not in by_branch:
                by_branch[bid] = {"revenue": 0.0, "orders": 0, "days": 0, "name": ""}
            by_branch[bid]["revenue"] += float(r.revenue or 0)
            by_branch[bid]["orders"] += r.orders_count or 0
            by_branch[bid]["days"] += 1

        # Получить названия
        branches_res = await db.execute(select(Branch))
        branch_names = {b.id: b.name for b in branches_res.scalars().all()}

        for bid, bv in by_branch.items():
            bv["name"] = branch_names.get(bid, f"#{bid}")
            bv["avg_revenue"] = round(bv["revenue"] / bv["days"], 2) if bv["days"] else 0

        branch_stats = sorted(
            [{"branch_id": bid, "branch_name": bv["name"], "revenue": round(bv["revenue"], 2),
              "orders": bv["orders"], "days": bv["days"], "avg_revenue": bv["avg_revenue"]}
             for bid, bv in by_branch.items()],
            key=lambda x: x["revenue"], reverse=True
        )

    best_branch = branch_stats[0] if branch_stats else None
    worst_branch = branch_stats[-1] if len(branch_stats) > 1 else None

    # ── Прогноз выполнения плана месяца ──────────────────────────────────────
    # Берём текущий месяц
    today = date.today()
    month_start = today.replace(day=1)
    import calendar as cal_module
    month_end = today.replace(day=cal_module.monthrange(today.year, today.month)[1])
    days_in_month = month_end.day
    days_elapsed = (today - month_start).days + 1

    month_reports = await _get_reports(db, month_start, today, branch_id)
    month_revenue = sum(float(r.revenue or 0) for r in month_reports)
    month_days_with_data = len({r.date for r in month_reports})

    projected_month = None
    if month_days_with_data > 0:
        daily_avg = month_revenue / month_days_with_data
        projected_month = round(daily_avg * days_in_month, 2)

    return {
        # Итоги за выбранный период
        "period": {"from_date": str(from_date), "to_date": str(to_date), "days": days_count},
        "totals": {
            "revenue": round(total_revenue, 2),
            "orders": total_orders,
            "takeaways": total_takeaways,
            "avg_revenue_per_day": avg_revenue,
            "avg_orders_per_day": round(avg_orders, 1),
            "avg_check": avg_check,
            "total_fot": round(total_fot_sum, 2),
            "kitchen_fot": round(kitchen_fot_sum, 2),
            "total_fot_pct": total_fot_pct,
            "kitchen_fot_pct": kitchen_fot_pct,
        },
        # Сравнение с предыдущим периодом
        "vs_prev_period": {
            "revenue_diff_pct": _pct_diff(total_revenue, prev_revenue),
            "revenue_diff_abs": _abs_diff(total_revenue, prev_revenue),
            "avg_check_diff_pct": _pct_diff(avg_check, prev_check),
            "orders_diff_pct": _pct_diff(float(total_orders), float(prev_orders)),
            "prev_revenue": round(prev_revenue, 2),
            "prev_orders": prev_orders,
            "prev_avg_check": prev_check,
        },
        # Тренд по дням
        "trend": trend,
        # Статистика по дням недели
        "weekday_stats": weekday_stats,
        "best_weekday": WDAYS[best_wd] if best_wd is not None else None,
        "worst_weekday": WDAYS[worst_wd] if worst_wd is not None else None,
        # Филиалы
        "branch_stats": branch_stats,
        "best_branch": best_branch,
        "worst_branch": worst_branch,
        # Прогноз месяца
        "month_forecast": {
            "month_revenue_so_far": round(month_revenue, 2),
            "days_elapsed": days_elapsed,
            "days_in_month": days_in_month,
            "projected_month_revenue": projected_month,
        },
    }


@router.get("/compare")
async def compare_periods(
    period: str = "week",  # week | month | yesterday
    branch_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_manager),
):
    """
    Быстрое сравнение:
    - yesterday: сегодня vs вчера
    - week: эта неделя vs прошлая
    - month: этот месяц vs прошлый
    """
    today = date.today()
    yesterday = today - timedelta(days=1)

    if period == "yesterday":
        cur_from = cur_to = yesterday
        prev_from = prev_to = yesterday - timedelta(days=1)
    elif period == "week":
        # Текущая неделя (Пн–сегодня)
        monday = today - timedelta(days=today.weekday())
        cur_from, cur_to = monday, today
        prev_from = monday - timedelta(days=7)
        prev_to = today - timedelta(days=7)
    else:  # month
        import calendar as cal_module
        cur_from = today.replace(day=1)
        cur_to = today
        if cur_from.month == 1:
            prev_month = 12; prev_year = cur_from.year - 1
        else:
            prev_month = cur_from.month - 1; prev_year = cur_from.year
        prev_from = date(prev_year, prev_month, 1)
        prev_to = prev_from.replace(day=min(today.day, cal_module.monthrange(prev_year, prev_month)[1]))

    cur_reports = await _get_reports(db, cur_from, cur_to, branch_id)
    prev_reports = await _get_reports(db, prev_from, prev_to, branch_id)

    def agg(reports: list) -> dict:
        revenue = sum(float(r.revenue or 0) for r in reports)
        orders = sum(r.orders_count or 0 for r in reports)
        days = len({r.date for r in reports})
        return {
            "revenue": round(revenue, 2),
            "orders": orders,
            "days": days,
            "avg_check": round(revenue / orders, 2) if orders else None,
            "avg_revenue": round(revenue / days, 2) if days else None,
        }

    cur = agg(cur_reports)
    prev = agg(prev_reports)

    return {
        "period": period,
        "current": {"from": str(cur_from), "to": str(cur_to), **cur},
        "previous": {"from": str(prev_from), "to": str(prev_to), **prev},
        "diff": {
            "revenue_abs": _abs_diff(cur["revenue"], prev["revenue"]),
            "revenue_pct": _pct_diff(cur["revenue"], prev["revenue"]),
            "orders_pct": _pct_diff(float(cur["orders"]), float(prev["orders"])),
            "avg_check_pct": _pct_diff(cur["avg_check"], prev["avg_check"]),
        },
    }
