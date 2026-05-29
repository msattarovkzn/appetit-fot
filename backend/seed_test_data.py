"""
Тестовые данные для MVP-сценария.
Запустить: docker compose exec backend python seed_test_data.py

Создаёт в филиале Челябинск:
  Кассир       Иванова Мария   PIN 1111  admin/hourly   200 р/ч  is_cashier=True
  Повар 1      Петров Алексей  PIN 2222  kitchen/hourly 180 р/ч
  Повар 2      Сидорова Анна   PIN 3333  kitchen/hourly 160 р/ч
  Техперсонал  Козлов Дмитрий  PIN 4444  tech/hourly    150 р/ч
  Администратор Новиков Сергей PIN 5555  admin/hourly   190 р/ч

Системные пользователи:
  owner      / owner123      (уже создан ранее, пропускается)
  manager1   / manager123    role=manager  branch=Челябинск
  accountant1/ accountant123 role=accountant
"""
import asyncio
from datetime import date
import bcrypt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.config import settings
from app.models.employee import Employee, EmployeeRate
from app.models.position import Position
from app.models.user import User, UserRole

engine = create_async_engine(settings.database_url)
Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

BRANCH_ID = 1  # Челябинск

EMPLOYEES = [
    {"full_name": "Иванова Мария",   "pin": "1111", "pos": "Администратор-логист",  "rate": 200, "is_cashier": True},
    {"full_name": "Петров Алексей",  "pin": "2222", "pos": "Повар 1 категории",      "rate": 180, "is_cashier": False},
    {"full_name": "Сидорова Анна",   "pin": "3333", "pos": "Повар 2 категории",      "rate": 160, "is_cashier": False},
    {"full_name": "Козлов Дмитрий",  "pin": "4444", "pos": "Кухонный работник",      "rate": 150, "is_cashier": False},
    {"full_name": "Новиков Сергей",  "pin": "5555", "pos": "Старший администратор",  "rate": 190, "is_cashier": False},
]

USERS = [
    {"username": "manager1",    "password": "manager123",    "full_name": "Менеджер Тест",    "role": UserRole.manager,    "branch_id": BRANCH_ID},
    {"username": "accountant1", "password": "accountant123", "full_name": "Бухгалтер Тест",   "role": UserRole.accountant, "branch_id": None},
]


def _hash(value: str) -> str:
    return bcrypt.hashpw(value.encode(), bcrypt.gensalt()).decode()


async def main():
    async with Session() as db:
        # Получаем owner для ставок
        owner_res = await db.execute(select(User).where(User.role == UserRole.owner).limit(1))
        owner = owner_res.scalar_one_or_none()
        if not owner:
            print("❌ Owner не найден. Сначала запустите create_owner.py")
            return

        # Создаём системных пользователей
        for u in USERS:
            exists = await db.execute(select(User).where(User.username == u["username"]))
            if exists.scalar_one_or_none():
                print(f"  ⏭  Пользователь {u['username']} уже существует")
                continue
            user = User(
                username=u["username"],
                password_hash=_hash(u["password"]),
                full_name=u["full_name"],
                role=u["role"],
                branch_id=u["branch_id"],
                is_active=True,
            )
            db.add(user)
            print(f"  ✅ Пользователь создан: {u['username']} / {u['password']}")
        await db.flush()

        # Получаем должности
        pos_res = await db.execute(select(Position))
        positions = {p.name: p for p in pos_res.scalars().all()}

        # Создаём сотрудников
        for e in EMPLOYEES:
            exists = await db.execute(
                select(Employee).where(
                    Employee.full_name == e["full_name"],
                    Employee.branch_id == BRANCH_ID,
                )
            )
            existing_emp = exists.scalar_one_or_none()
            if existing_emp:
                # Обновляем PIN и is_cashier
                existing_emp.pin_hash = _hash(e["pin"])
                existing_emp.is_cashier = e["is_cashier"]
                print(f"  🔄 Обновлён: {e['full_name']} → PIN={e['pin']}, is_cashier={e['is_cashier']}")
                emp = existing_emp
            else:
                pos = positions.get(e["pos"])
                if not pos:
                    print(f"  ❌ Должность не найдена: {e['pos']}")
                    continue
                emp = Employee(
                    full_name=e["full_name"],
                    pin_hash=_hash(e["pin"]),
                    position_id=pos.id,
                    branch_id=BRANCH_ID,
                    is_cashier=e["is_cashier"],
                    is_active=True,
                )
                db.add(emp)
                await db.flush()
                print(f"  ✅ Сотрудник создан: {e['full_name']} | PIN={e['pin']}")

            # Ставка (если ещё нет)
            rate_res = await db.execute(
                select(EmployeeRate).where(EmployeeRate.employee_id == emp.id)
            )
            if not rate_res.scalar_one_or_none():
                db.add(EmployeeRate(
                    employee_id=emp.id,
                    rate=e["rate"],
                    effective_from=date(2026, 1, 1),
                    created_by=owner.id,
                ))
                print(f"     Ставка: {e['rate']} р/ч")

        await db.commit()
        print("\n✅ Тестовые данные загружены!")
        print("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("ТЕСТОВЫЕ PIN (филиал: Челябинск)")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        for e in EMPLOYEES:
            role = "КАССИР" if e["is_cashier"] else "      "
            print(f"  {e['pin']}  {role}  {e['full_name']}")
        print("\nСИСТЕМНЫЕ ПОЛЬЗОВАТЕЛИ (логин/пароль)")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("  owner       / owner123      — Владелец")
        print("  manager1    / manager123    — Управляющий")
        print("  accountant1 / accountant123 — Бухгалтер")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")

    await engine.dispose()


asyncio.run(main())
