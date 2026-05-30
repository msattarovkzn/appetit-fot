"""DailyBranchReview — статус проверки дня бухгалтером (red/yellow/green)."""
from datetime import datetime, date
from sqlalchemy import String, ForeignKey, DateTime, Date, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class ReviewStatus(str):
    red = "red"
    yellow = "yellow"
    green = "green"


class DailyBranchReview(Base):
    __tablename__ = "daily_branch_review"

    id: Mapped[int] = mapped_column(primary_key=True)
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id", ondelete="CASCADE"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)

    # red = есть проблемы | yellow = ожидает | green = проверен
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="red")

    # Список кодов проблем: ["unclosed_shifts", "anomaly_critical", ...]
    issues: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    issues_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    reviewed_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default="now()"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default="now()"
    )

    branch: Mapped["Branch"] = relationship()
    reviewer: Mapped["User | None"] = relationship(foreign_keys=[reviewed_by])
