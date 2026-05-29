from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel
from app.models.shift import ShiftStatus


class ShiftOpenRequest(BaseModel):
    pin: str
    branch_id: int


class ShiftCloseRequest(BaseModel):
    pin: str
    branch_id: int


class ShiftStatusRequest(BaseModel):
    pin: str
    branch_id: int


class ShiftStatusResponse(BaseModel):
    employee_id: int
    employee_name: str
    has_open_shift: bool
    shift_id: int | None = None
    opened_at: datetime | None = None
    hours_so_far: float | None = None


class ShiftOut(BaseModel):
    id: int
    employee_id: int
    branch_id: int
    date: date
    opened_at: datetime
    closed_at: datetime | None
    approved_hours: Decimal | None
    status: ShiftStatus
    employee_name: str | None = None

    model_config = {"from_attributes": True}


class ShiftApproveRequest(BaseModel):
    approved_hours: Decimal
    note: str | None = None
