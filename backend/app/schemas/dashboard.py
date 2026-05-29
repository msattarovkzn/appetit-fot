from datetime import date
from decimal import Decimal
from pydantic import BaseModel
from app.models.payroll import FotStatus


class EmployeePayrollRow(BaseModel):
    employee_id: int
    employee_name: str
    category: str
    payment_type: str
    approved_hours: Decimal
    rate: Decimal
    base_pay: Decimal
    bonus: Decimal
    total_pay: Decimal


class BranchFotSummary(BaseModel):
    branch_id: int
    branch_name: str
    revenue: Decimal
    orders_count: int
    total_fot: Decimal
    kitchen_fot: Decimal
    total_fot_pct: Decimal | None
    kitchen_fot_pct: Decimal | None
    status_total: FotStatus | None
    status_kitchen: FotStatus | None
    days_closed: int


class BranchFotDetail(BaseModel):
    branch_id: int
    branch_name: str
    from_date: date
    to_date: date
    revenue: Decimal
    orders_count: int
    total_fot: Decimal
    kitchen_fot: Decimal
    admin_fot: Decimal
    tech_fot: Decimal
    courier_fot: Decimal
    reserve_fot: Decimal
    total_fot_pct: Decimal
    kitchen_fot_pct: Decimal
    status_total: FotStatus
    status_kitchen: FotStatus
    plan_total: Decimal
    plan_kitchen: Decimal
    deviation_total: Decimal
    deviation_kitchen: Decimal
    entries: list[EmployeePayrollRow]


class NetworkFotSummary(BaseModel):
    from_date: date
    to_date: date
    total_revenue: Decimal
    total_fot: Decimal
    total_fot_pct: Decimal | None
    branches: list[BranchFotSummary]
