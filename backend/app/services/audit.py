from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit import AuditLog


async def log_action(
    db: AsyncSession,
    user_id: int,
    action: str,
    entity_type: str,
    entity_id: int,
    old_value: dict | None = None,
    new_value: dict | None = None,
    ip_address: str | None = None,
) -> None:
    entry = AuditLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        old_value=old_value,
        new_value=new_value,
        ip_address=ip_address,
    )
    db.add(entry)
