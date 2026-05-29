import enum
from datetime import datetime, date
from decimal import Decimal
from sqlalchemy import String, Boolean, ForeignKey, DateTime, Date, Numeric, Enum, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from .base import Base


class FotStatus(str, enum.Enum):
    green = "green"
    yellow = "yellow"
    red = "red"


class PayrollEntry(Base):
    __tablename__ = "payroll_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), nullable=False)
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    shift_id: Mapped[int | None] = mapped_column(ForeignKey("shifts.id"), nullable=True)
    hours_worked: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0, nullable=False)
    approved_hours: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0, nullable=False)
    rate: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    base_pay: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    bonus: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    total_pay: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    payment_type: Mapped[str] = mapped_column(String(20), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_corrected: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    corrected_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    corrected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    employee: Mapped["Employee"] = relationship(back_populates="payroll_entries")
    branch: Mapped["Branch"] = relationship(back_populates="payroll_entries")
    shift: Mapped["Shift | None"] = relationship(back_populates="payroll_entry")
    corrected_by_user: Mapped["User | None"] = relationship(back_populates="corrected_entries")


class FotSummary(Base):
    __tablename__ = "fot_summary"

    id: Mapped[int] = mapped_column(primary_key=True)
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    daily_report_id: Mapped[int | None] = mapped_column(ForeignKey("branch_daily_reports.id"), nullable=True)

    revenue: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    total_fot: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    kitchen_fot: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    admin_fot: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    tech_fot: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    courier_fot: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    reserve_fot: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    total_fot_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    kitchen_fot_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)

    status_total: Mapped[FotStatus] = mapped_column(Enum(FotStatus), nullable=False)
    status_kitchen: Mapped[FotStatus] = mapped_column(Enum(FotStatus), nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    branch: Mapped["Branch"] = relationship(back_populates="fot_summaries")
    daily_report: Mapped["BranchDailyReport | None"] = relationship(back_populates="fot_summary")
