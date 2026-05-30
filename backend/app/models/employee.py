from datetime import datetime, date
from decimal import Decimal
from sqlalchemy import String, Boolean, ForeignKey, DateTime, Date, Numeric, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from .base import Base


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    pin_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    # SHA-256 of raw PIN — for uniqueness check only, NOT for auth
    pin_check: Mapped[str | None] = mapped_column(String(64), nullable=True)
    position_id: Mapped[int] = mapped_column(ForeignKey("positions.id"), nullable=False)
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False)
    is_cashier: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # Phase 2: employee self-service login
    employee_login: Mapped[str | None] = mapped_column(String(100), nullable=True, unique=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)

    __table_args__ = (
        UniqueConstraint("pin_check", "branch_id", name="uq_employee_pin_branch"),
    )

    position: Mapped["Position"] = relationship(back_populates="employees")
    branch: Mapped["Branch"] = relationship(back_populates="employees")
    rates: Mapped[list["EmployeeRate"]] = relationship(
        back_populates="employee",
        order_by="EmployeeRate.effective_from.desc()",
    )
    shifts: Mapped[list["Shift"]] = relationship(back_populates="employee")
    payroll_entries: Mapped[list["PayrollEntry"]] = relationship(back_populates="employee")


class EmployeeRate(Base):
    __tablename__ = "employee_rates"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), nullable=False)
    rate: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    fixed_daily_rate: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    date_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    employee: Mapped["Employee"] = relationship(back_populates="rates")
