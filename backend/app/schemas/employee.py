from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel
from app.models.position import PositionCategory, PaymentType


class PositionOut(BaseModel):
    id: int
    name: str
    category: PositionCategory
    payment_type: PaymentType

    model_config = {"from_attributes": True}


class EmployeeCreate(BaseModel):
    full_name: str
    pin: str
    position_id: int
    branch_id: int


class EmployeeUpdate(BaseModel):
    full_name: str | None = None
    position_id: int | None = None
    branch_id: int | None = None
    is_active: bool | None = None


class EmployeeOut(BaseModel):
    id: int
    full_name: str
    position_id: int
    branch_id: int
    is_active: bool
    is_cashier: bool = False
    position: PositionOut | None = None

    model_config = {"from_attributes": True}


class EmployeeRateCreate(BaseModel):
    rate: Decimal
    fixed_daily_rate: Decimal | None = None
    effective_from: date


class EmployeeRateOut(BaseModel):
    id: int
    employee_id: int
    rate: Decimal
    fixed_daily_rate: Decimal | None
    effective_from: date
    created_at: datetime

    model_config = {"from_attributes": True}
