"""Аварийный сброс пароля пользователя (owner/accountant/manager).

Запуск на сервере:
  docker compose exec backend python reset_password.py <username> <new_password>

Если username не найден — скрипт сообщит об этом и ничего не изменит.
"""
import asyncio
import sys
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.config import settings
from app.models.user import User
from app.utils.security import hash_password

engine = create_async_engine(settings.database_url)
Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def main(username: str, new_password: str) -> None:
    if len(new_password) < 6:
        print("❌ Пароль слишком короткий (минимум 6 символов)")
        return

    async with Session() as db:
        result = await db.execute(select(User).where(User.username == username))
        user = result.scalar_one_or_none()
        if not user:
            print(f"❌ Пользователь '{username}' не найден")
            return

        user.password_hash = hash_password(new_password)
        await db.commit()
        print(f"✅ Пароль для '{username}' ({user.role.value}) изменён")

    await engine.dispose()


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Использование: python reset_password.py <username> <new_password>")
        sys.exit(1)
    asyncio.run(main(sys.argv[1], sys.argv[2]))
