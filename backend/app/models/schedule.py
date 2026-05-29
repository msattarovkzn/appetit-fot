from datetime import date, datetime, time as time_type
from decimal import Decimal
from sqlalchemy import ForeignKey, DateTime, Date, Time, Numeric, Text, SmallInteger, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from .base import Base


class SchedulePlan(Base):
    __tablename__ = "schedule_plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    planned_hours: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    # ── New in 006 ──────────────────────────────────────────────────────────────
    start_time: Mapped[time_type | None] = mapped_column(Time, nullable=True)
    end_time: Mapped[time_type | None] = mapped_column(Time, nullable=True)
    break_minutes: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")
    # ───────────────────────────────────────────────────────────────────────────
    comment: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("employee_id", "date", name="uq_schedule_employee_date"),
    )

    employee: Mapped["Employee"] = relationship()
    branch: Mapped["Branch"] = relationship()
    creator: Mapped["User"] = relationship(foreign_keys=[created_by])
