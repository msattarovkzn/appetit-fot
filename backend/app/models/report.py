import enum
from datetime import datetime, date
from decimal import Decimal
from sqlalchemy import ForeignKey, DateTime, Date, Numeric, Integer, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from .base import Base


class ReportStatus(str, enum.Enum):
    draft = "draft"
    closed = "closed"
    approved = "approved"


class BranchDailyReport(Base):
    __tablename__ = "branch_daily_reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    revenue: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    orders_count: Mapped[int] = mapped_column(Integer, nullable=False)
    takeaway_count: Mapped[int] = mapped_column(Integer, nullable=False)
    closed_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    closed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    status: Mapped[ReportStatus] = mapped_column(Enum(ReportStatus), default=ReportStatus.closed, nullable=False)

    branch: Mapped["Branch"] = relationship(back_populates="daily_reports")
    closed_by_user: Mapped["User"] = relationship(back_populates="closed_reports")
    fot_summary: Mapped["FotSummary | None"] = relationship(back_populates="daily_report", uselist=False)
