"""
Создать первых пользователей для staging-среды.

Запуск:
  docker compose exec backend python create_staging_users.py

Создаёт:
  owner        / owner123       — Владелец (полный доступ)
  accountant1  / accountant123  — Бухгалтер (управление сотрудниками, ФОТ)
  manager1     / manager123     — Управляющий (график, смены)

Если пользователь уже существует — пропускается.
После создания пользователей запустите seed_test_data.py для тестовых сотрудников.
"""
import asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.config import settings
from app.models.user import User, UserRole
from app.utils.security import hash_password

engine = create_async_engine(settings.database_url)
Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

USERS = [
    {
        "username": "owner",
        "password": "owner123",
        "full_name": "Владелец",
        "role": UserRole.owner,
        "branch_id": None,
    },
    {
        "username": "accountant1",
        "password": "accountant123",
        "full_name": "Бухгалтер",
        "role": UserRole.accountant,
        "branch_id": None,
    },
    {
        "username": "manager1",
        "password": "manager123",
        "full_name": "Управляющий",
        "role": UserRole.manager,
        "branch_id": 1,  # Челябинск
    },
]


async def main() -> None:
    async with Session() as db:
        for u in USERS:
            res = await db.execute(select(User).where(User.username == u["username"]))
            existing = res.scalar_one_or_none()
            if existing:
                print(f"  ⏭  {u['username']} — уже существует, пропущен")
                continue
            user = User(
                username=u["username"],
                password_hash=hash_password(u["password"]),
                full_name=u["full_name"],
                role=u["role"],
                branch_id=u["branch_id"],
                is_active=True,
            )
            db.add(user)
            print(f"  ✅ Создан: {u['username']} / {u['password']}  [{u['role'].value}]")

        await db.commit()

    await engine.dispose()
    print("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("ПОЛЬЗОВАТЕЛИ СОЗДАНЫ")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("  owner        / owner123       — Владелец")
    print("  accountant1  / accountant123  — Бухгалтер")
    print("  manager1     / manager123     — Управляющий")
    print("\nСледующий шаг: python seed_test_data.py")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")


asyncio.run(main())
