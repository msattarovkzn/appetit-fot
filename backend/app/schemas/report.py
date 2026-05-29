from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel
from app.models.report import ReportStatus
from app.models.payroll import FotStatus


class CashierCloseRequest(BaseModel):
    branch_id: int
    date: date
    revenue: Decimal
    orders_count: int
    takeaway_count: int


class CashierPinCloseRequest(BaseModel):
    pin: str
    branch_id: int
    date: date
    revenue: Decimal
    orders_count: int
    takeaway_count: int
    comment: str | None = None


class CashierPinCloseResponse(BaseModel):
    employee_name: str
    branch_name: str
    date: date
    unclosed_count: int
    unclosed_names: list[str]
    bot_message: str


class CashierCheckPinRequest(BaseModel):
    pin: str
    branch_id: int


class CashierCheckPinResponse(BaseModel):
    employee_id: int
    employee_name: str
    has_open_shift: bool
    opened_at: datetime | None = None
    hours_so_far: float | None = None


class BranchDailyReportOut(BaseModel):
    id: int
    branch_id: int
    date: date
    revenue: Decimal
    orders_count: int
    takeaway_count: int
    closed_at: datetime
    status: ReportStatus

    model_config = {"from_attributes": True}


class FotSummaryOut(BaseModel):
    id: int
    branch_id: int
    date: date
    revenue: Decimal
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

    model_config = {"from_attributes": True}


class DashboardDay(BaseModel):
    date: date
    branch_id: int
    branch_name: str
    revenue: Decimal | None
    orders_count: int | None
    total_fot: Decimal | None
    kitchen_fot: Decimal | None
    total_fot_pct: Decimal | None
    kitchen_fot_pct: Decimal | None
    status_total: FotStatus | None
    status_kitchen: FotStatus | None
    open_shifts: int
