from sqlalchemy import String, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class Branch(Base):
    __tablename__ = "branches"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    users: Mapped[list["User"]] = relationship(back_populates="branch")
    employees: Mapped[list["Employee"]] = relationship(back_populates="branch")
    shifts: Mapped[list["Shift"]] = relationship(back_populates="branch")
    daily_reports: Mapped[list["BranchDailyReport"]] = relationship(back_populates="branch")
    payroll_entries: Mapped[list["PayrollEntry"]] = relationship(back_populates="branch")
    fot_summaries: Mapped[list["FotSummary"]] = relationship(back_populates="branch")
    notifications: Mapped[list["Notification"]] = relationship(back_populates="branch")
