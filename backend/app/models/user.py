import enum
from datetime import datetime
from sqlalchemy import String, Boolean, ForeignKey, DateTime, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from .base import Base


class UserRole(str, enum.Enum):
    employee = "employee"
    cashier = "cashier"
    manager = "manager"
    accountant = "accountant"
    owner = "owner"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False)
    branch_id: Mapped[int | None] = mapped_column(ForeignKey("branches.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    branch: Mapped["Branch | None"] = relationship(back_populates="users")
    closed_reports: Mapped[list["BranchDailyReport"]] = relationship(back_populates="closed_by_user")
    corrected_entries: Mapped[list["PayrollEntry"]] = relationship(back_populates="corrected_by_user")
