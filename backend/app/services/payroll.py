from datetime import date, timezone
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, delete
from sqlalchemy.orm import selectinload

from app.models.employee import Employee, EmployeeRate
from app.models.shift import Shift, ShiftStatus
from app.models.payroll import PayrollEntry, FotSummary, FotStatus
from app.models.position import PositionCategory, PaymentType
from app.models.report import BranchDailyReport

ZERO = Decimal("0")


def fot_status_total(pct: Decimal) -> FotStatus:
    if pct < Decimal("27.5"):
        return FotStatus.green
    if pct <= Decimal("29"):
        return FotStatus.yellow
    return FotStatus.red


def fot_status_kitchen(pct: Decimal) -> FotStatus:
    if pct < Decimal("14.5"):
        return FotStatus.green
    if pct <= Decimal("15.5"):
        return FotStatus.yellow
    return FotStatus.red


def _admin_bonus(orders_count: int, day_of_week: int) -> Decimal:
    """Бонус для кассира-администратора. Пн-Чт+Вс=7₽/заказ, Пт-Сб=5₽/заказ."""
    # Mon=0 Tue=1 Wed=2 Thu=3 Fri=4 Sat=5 Sun=6
    rate_per_order = 7 if day_of_week in (0, 1, 2, 3, 6) else 5
    return Decimal(orders_count * rate_per_order)


def _active_rate(rates: list[EmployeeRate], for_date: date) -> EmployeeRate | None:
    applicable = [r for r in rates if r.effective_from <= for_date]
    return max(applicable, key=lambda r: r.effective_from) if applicable else None


def _get_total_minutes(shift: Shift) -> int:
    """
    Вернуть total_minutes для смены.
    Берём из поля (если есть), иначе вычисляем из timestamps.
    Возвращает 0 если нет данных или отрицательное значение.
    """
    if shift.total_minutes is not None:
        return max(0, shift.total_minutes)

    if shift.closed_at and shift.opened_at:
        opened = shift.opened_at
        closed = shift.closed_at
        if opened.tzinfo is None:
            opened = opened.replace(tzinfo=timezone.utc)
        if closed.tzinfo is None:
            closed = closed.replace(tzinfo=timezone.utc)
        minutes = int((closed - opened).total_seconds() / 60)
        return max(0, minutes)

    return 0


async def calculate_payroll_for_day(
    db: AsyncSession,
    branch_id: int,
    report: BranchDailyReport,
    cashier_employee_id: int | None = None,
) -> FotSummary:
    """
    Рассчитать ФОТ за один день для одного филиала.

    Включает ТОЛЬКО сотрудников у которых:
    - смена закрыта (closed_at IS NOT NULL)
    - total_minutes > 0 (реально отработали хотя бы 1 минуту)

    Формулы:
      Почасовой / Администратор: (rate / 60) * total_minutes
      Фикс: fixed_daily_rate
      Бонус: ТОЛЬКО кассир-администратор = orders_count * 7 (или 5 в пт/сб)
    """
    work_date = report.date
    orders_count = report.orders_count          # только orders_count, takeaway_count не используется
    day_of_week = work_date.weekday()           # Mon=0 … Sun=6

    # ── 0. Очистить старые записи перед (пере)расчётом ──────────────────────────
    # Защита от дублей при повторном вызове по тому же report_id
    await db.execute(
        delete(PayrollEntry).where(
            and_(
                PayrollEntry.branch_id == branch_id,
                PayrollEntry.date == work_date,
                PayrollEntry.is_corrected == False,     # корректировки не трогаем  # noqa: E712
            )
        )
    )
    await db.execute(
        delete(FotSummary).where(
            FotSummary.daily_report_id == report.id
        )
    )
    await db.flush()

    # Загружаем только ЗАКРЫТЫЕ смены за этот день и филиал
    result = await db.execute(
        select(Shift)
        .where(
            and_(
                Shift.branch_id == branch_id,
                Shift.date == work_date,
                Shift.closed_at.isnot(None),      # смена закрыта
            )
        )
        .options(
            selectinload(Shift.employee).selectinload(Employee.position),
            selectinload(Shift.employee).selectinload(Employee.rates),
        )
    )
    shifts = result.scalars().all()

    category_fot: dict[PositionCategory, Decimal] = {c: ZERO for c in PositionCategory}
    entries_to_add = []
    cashier_bonus_given = False     # бонус начисляется кассиру ровно ОДИН раз за день

    for shift in shifts:
        # ── 1. Проверить что есть реальное время ─────────────────────────────
        total_minutes = _get_total_minutes(shift)
        if total_minutes <= 0:
            continue  # Пропустить смену без фактического времени

        emp = shift.employee
        pos = emp.position
        if pos is None:
            continue

        rate_entry = _active_rate(emp.rates, work_date)
        if rate_entry is None:
            continue

        # ── 2. Рассчитать часы ───────────────────────────────────────────────
        # Если менеджер задал approved_hours — используем их
        if shift.approved_hours is not None and shift.approved_hours > ZERO:
            billing_minutes = int(shift.approved_hours * 60)
        else:
            billing_minutes = total_minutes

        billing_minutes_dec = Decimal(str(billing_minutes))
        hours_worked = Decimal(str(total_minutes)) / Decimal("60")
        approved_hours = Decimal(str(billing_minutes)) / Decimal("60")

        # ── 3. Рассчитать оплату ─────────────────────────────────────────────
        if pos.payment_type == PaymentType.fixed_daily:
            # Фиксированная дневная ставка
            base_pay = rate_entry.fixed_daily_rate or rate_entry.rate
            bonus = ZERO

        else:
            # Почасовая: (rate / 60) * minutes
            base_pay = (rate_entry.rate / Decimal("60")) * billing_minutes_dec

            # Бонус: ТОЛЬКО кассир-администратор, ОДИН РАЗ за день
            # orders_count берётся из отчёта, takeaway_count в формуле не участвует
            if (
                pos.category == PositionCategory.admin
                and cashier_employee_id is not None
                and emp.id == cashier_employee_id
                and not cashier_bonus_given
            ):
                bonus = _admin_bonus(orders_count, day_of_week)
                cashier_bonus_given = True
            else:
                bonus = ZERO

        total_pay = base_pay + bonus
        category_fot[pos.category] += total_pay

        # ── 4. Добавить запись (дублей нет — удалили в начале) ──────────────────
        entries_to_add.append(PayrollEntry(
            employee_id=emp.id,
            branch_id=branch_id,
            date=work_date,
            shift_id=shift.id,
            hours_worked=round(hours_worked, 4),
            approved_hours=round(approved_hours, 4),
            rate=rate_entry.rate,
            base_pay=round(base_pay, 2),
            bonus=round(bonus, 2),
            total_pay=round(total_pay, 2),
            payment_type=pos.payment_type.value,
        ))

    for e in entries_to_add:
        db.add(e)

    # ── 5. Сформировать FOT summary ──────────────────────────────────────────
    revenue = report.revenue
    total_fot = sum(category_fot.values(), ZERO)
    kitchen_fot = category_fot[PositionCategory.kitchen]

    if revenue and revenue > ZERO:
        total_fot_pct = round(total_fot / revenue * 100, 2)
        kitchen_fot_pct = round(kitchen_fot / revenue * 100, 2)
    else:
        total_fot_pct = ZERO
        kitchen_fot_pct = ZERO

    summary = FotSummary(
        branch_id=branch_id,
        date=work_date,
        daily_report_id=report.id,
        revenue=revenue,
        total_fot=round(total_fot, 2),
        kitchen_fot=round(kitchen_fot, 2),
        admin_fot=round(category_fot[PositionCategory.admin], 2),
        tech_fot=round(category_fot[PositionCategory.tech], 2),
        courier_fot=round(category_fot[PositionCategory.courier], 2),
        reserve_fot=round(category_fot[PositionCategory.reserve], 2),
        total_fot_pct=total_fot_pct,
        kitchen_fot_pct=kitchen_fot_pct,
        status_total=fot_status_total(total_fot_pct),
        status_kitchen=fot_status_kitchen(kitchen_fot_pct),
    )
    db.add(summary)
    await db.flush()
    return summary
