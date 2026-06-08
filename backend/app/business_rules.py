"""Единый источник бизнес-правил ФОТ и бонуса кассира.

Извлечено из дублировавшихся копий в:
  - app/services/payroll.py (fot_status_total, fot_status_kitchen, _admin_bonus)
  - app/routers/admin.py (_fot_status_total, _fot_status_kitchen)
  - app/routers/dashboard.py (_status_total, _status_kitchen)
  - app/routers/cashier.py (_cashier_bonus)

Поведение перенесено 1:1 — границы (< / <=) и формула бонуса не изменены.
"""
from datetime import date
from decimal import Decimal

from app.models.payroll import FotStatus

# ── Пороги ФОТ (границы перенесены без изменений) ───────────────────────────
FOT_TOTAL_GREEN_MAX = Decimal("27.5")
FOT_TOTAL_YELLOW_MAX = Decimal("29")
FOT_KITCHEN_GREEN_MAX = Decimal("14.5")
FOT_KITCHEN_YELLOW_MAX = Decimal("15.5")


def fot_status_total(pct: Decimal) -> FotStatus:
    if pct < FOT_TOTAL_GREEN_MAX:
        return FotStatus.green
    if pct <= FOT_TOTAL_YELLOW_MAX:
        return FotStatus.yellow
    return FotStatus.red


def fot_status_kitchen(pct: Decimal) -> FotStatus:
    if pct < FOT_KITCHEN_GREEN_MAX:
        return FotStatus.green
    if pct <= FOT_KITCHEN_YELLOW_MAX:
        return FotStatus.yellow
    return FotStatus.red


# ── Бонус кассира-администратора ────────────────────────────────────────────
# Объединение _admin_bonus(orders_count, day_of_week: int) и
# _cashier_bonus(orders_count, work_date: date) — обе версии давали
# идентичный результат (см. baseline-проверку), берём сигнатуру с date.
CASHIER_BONUS_LOW_RATE_DAYS = (4, 5)  # Пт, Сб
CASHIER_BONUS_RATE_LOW = Decimal("5")
CASHIER_BONUS_RATE_HIGH = Decimal("7")


def cashier_bonus(orders_count: int, work_date: date) -> Decimal:
    """Бонус кассира-администратора: Пн-Чт+Вс = 7₽/заказ, Пт-Сб = 5₽/заказ."""
    weekday = work_date.weekday()  # Mon=0 … Sun=6
    rate = CASHIER_BONUS_RATE_LOW if weekday in CASHIER_BONUS_LOW_RATE_DAYS else CASHIER_BONUS_RATE_HIGH
    return Decimal(orders_count) * rate
