"""Запустить один раз для создания владельца: python create_owner.py"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.config import settings
from app.models.user import User, UserRole
from app.utils.security import hash_password

engine = create_async_engine(settings.database_url)
Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def main():
    username = input("Username: ")
    password = input("Password: ")
    full_name = input("Full name: ")

    async with Session() as db:
        user = User(
            username=username,
            password_hash=hash_password(password),
            full_name=full_name,
            role=UserRole.owner,
            branch_id=None,
            is_active=True,
        )
        db.add(user)
        await db.commit()
        print(f"Owner created: {username}")

    await engine.dispose()


asyncio.run(main())
