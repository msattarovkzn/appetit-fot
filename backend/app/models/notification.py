import enum
from datetime import datetime, date
from sqlalchemy import ForeignKey, DateTime, Date, Text, String, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from .base import Base


class NotificationStatus(str, enum.Enum):
    sent = "sent"
    failed = "failed"


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    status: Mapped[NotificationStatus] = mapped_column(Enum(NotificationStatus), nullable=False)
    error_msg: Mapped[str | None] = mapped_column(String(500), nullable=True)

    branch: Mapped["Branch"] = relationship(back_populates="notifications")
