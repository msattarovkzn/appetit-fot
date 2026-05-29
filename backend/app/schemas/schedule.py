from typing import Optional
from pydantic import BaseModel, field_validator


def _compute_planned_hours(
    start_time: str | None,
    end_time: str | None,
    break_minutes: int,
) -> float | None:
    """
    Вычисляет planned_hours из start_time и end_time.
    Поддерживает ночные смены (end < start → +24 ч).
    Возвращает None если хотя бы одно время не задано.
    """
    if not start_time or not end_time:
        return None
    try:
        sh, sm = [int(x) for x in start_time.split(":")]
        eh, em = [int(x) for x in end_time.split(":")]
    except (ValueError, AttributeError):
        return None
    start_min = sh * 60 + sm
    end_min = eh * 60 + em
    if end_min <= start_min:       # ночная смена — переход через полночь
        end_min += 24 * 60
    total = max(0, end_min - start_min - break_minutes)
    return round(total / 60, 2)


class ScheduleEntryIn(BaseModel):
    employee_id: int
    date: str                      # YYYY-MM-DD
    planned_hours: float = 0       # игнорируется если заданы start_time + end_time
    start_time: Optional[str] = None   # "HH:MM"
    end_time: Optional[str] = None     # "HH:MM"
    break_minutes: int = 0

    comment: str = ""

    @field_validator("start_time", "end_time", mode="before")
    @classmethod
    def empty_to_none(cls, v: Optional[str]) -> Optional[str]:
        if v == "" or v is None:
            return None
        return v

    def resolved_hours(self) -> float:
        """Возвращает итоговые часы: из времён или из поля planned_hours."""
        computed = _compute_planned_hours(self.start_time, self.end_time, self.break_minutes)
        if computed is not None:
            return computed
        return self.planned_hours


class ScheduleSaveRequest(BaseModel):
    branch_id: int
    entries: list[ScheduleEntryIn]


class ScheduleSaveResponse(BaseModel):
    saved: int
    deleted: int
