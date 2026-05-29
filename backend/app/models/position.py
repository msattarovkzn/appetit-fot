import enum
from sqlalchemy import String, Enum, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class PositionCategory(str, enum.Enum):
    admin = "admin"
    kitchen = "kitchen"
    tech = "tech"
    courier = "courier"
    reserve = "reserve"


class PaymentType(str, enum.Enum):
    hourly = "hourly"
    fixed_daily = "fixed_daily"


class Position(Base):
    __tablename__ = "positions"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    category: Mapped[PositionCategory] = mapped_column(Enum(PositionCategory), nullable=False)
    payment_type: Mapped[PaymentType] = mapped_column(Enum(PaymentType), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    employees: Mapped[list["Employee"]] = relationship(back_populates="position")
