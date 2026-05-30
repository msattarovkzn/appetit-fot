import enum
from datetime import datetime, date
from decimal import Decimal
from sqlalchemy import Boolean, String, ForeignKey, DateTime, Date, Numeric, Integer, Enum, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from .base import Base


class ShiftStatus(str, enum.Enum):
    open = "open"
    closed = "closed"
    approved = "approved"


class AnomalyFlag(str, enum.Enum):
    warning = "warning"    # 14–16 ч
    critical = "critical"  # >16 ч


class Shift(Base):
    __tablename__ = "shifts"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), nullable=False)
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_hours: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    total_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_hours_decimal: Mapped[Decimal | None] = mapped_column(Numeric(8, 4), nullable=True)
    status: Mapped[ShiftStatus] = mapped_column(Enum(ShiftStatus), default=ShiftStatus.open, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Phase 2: extra shift fields
    is_extra_shift: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    extra_shift_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Phase 2: anomaly detection
    anomaly_flag: Mapped[str | None] = mapped_column(String(20), nullable=True)
    anomaly_resolved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    anomaly_resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    employee: Mapped["Employee"] = relationship(back_populates="shifts")
    branch: Mapped["Branch"] = relationship(back_populates="shifts")
    payroll_entry: Mapped["PayrollEntry | None"] = relationship(back_populates="shift", uselist=False)
