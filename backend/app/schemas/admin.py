from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, field_validator


# ── Position schemas ──────────────────────────────────────────────────────────

class PositionCreate(BaseModel):
    name: str
    category: str
    payment_type: str


class PositionUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    payment_type: Optional[str] = None
    is_active: Optional[bool] = None


class PositionOut(BaseModel):
    id: int
    name: str
    category: str
    payment_type: str
    is_active: bool
    employee_count: int = 0

    model_config = {"from_attributes": True}


# ── Rate schemas ──────────────────────────────────────────────────────────────

class RateCreate(BaseModel):
    rate: Decimal
    fixed_daily_rate: Optional[Decimal] = None
    effective_from: date

    @field_validator("rate")
    @classmethod
    def rate_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("Ставка должна быть больше 0")
        return v


class RateOut(BaseModel):
    id: int
    rate: Decimal
    fixed_daily_rate: Optional[Decimal]
    effective_from: date
    date_to: Optional[date]
    created_by: int
    created_by_name: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Employee schemas ──────────────────────────────────────────────────────────

class EmployeeCreate(BaseModel):
    full_name: str
    pin: str
    branch_id: int
    position_id: int
    is_cashier: bool = False
    comment: Optional[str] = None
    # Initial rate
    rate: Decimal
    fixed_daily_rate: Optional[Decimal] = None
    effective_from: date

    @field_validator("pin")
    @classmethod
    def pin_digits(cls, v: str) -> str:
        v = v.strip()
        if not v.isdigit():
            raise ValueError("PIN должен содержать только цифры")
        if len(v) < 4:
            raise ValueError("PIN должен быть не менее 4 цифр")
        return v

    @field_validator("full_name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("ФИО не может быть пустым")
        return v


class EmployeeUpdate(BaseModel):
    full_name: Optional[str] = None
    pin: Optional[str] = None          # set to change PIN
    position_id: Optional[int] = None
    is_cashier: Optional[bool] = None
    comment: Optional[str] = None
    employee_login: Optional[str] = None  # логин для кабинета сотрудника

    @field_validator("pin")
    @classmethod
    def pin_digits(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if not v.isdigit():
            raise ValueError("PIN должен содержать только цифры")
        if len(v) < 4:
            raise ValueError("PIN должен быть не менее 4 цифр")
        return v


class EmployeeListItem(BaseModel):
    id: int
    full_name: str
    branch_id: int
    is_cashier: bool
    is_active: bool
    comment: Optional[str]
    position_id: int
    position_name: Optional[str]
    category: Optional[str]
    payment_type: Optional[str]
    current_rate: Optional[Decimal]
    current_fixed_daily_rate: Optional[Decimal]

    model_config = {"from_attributes": True}


class EmployeeDetail(EmployeeListItem):
    created_at: datetime
    rates: list[RateOut] = []
