from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.models.employee import Employee
from app.schemas.auth import LoginRequest, TokenResponse, PinRequest
from app.utils.security import verify_password, verify_pin, create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where(User.username == body.username, User.is_active == True)
    )
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный логин или пароль")

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(
        access_token=token,
        role=user.role,
        full_name=user.full_name,
        branch_id=user.branch_id,
    )


@router.post("/pin-verify")
async def verify_employee_pin(body: PinRequest, db: AsyncSession = Depends(get_db)):
    """Проверка PIN сотрудника. Возвращает данные сотрудника без создания смены."""
    result = await db.execute(
        select(Employee).where(
            Employee.branch_id == body.branch_id,
            Employee.is_active == True,
        )
    )
    employees = result.scalars().all()

    for emp in employees:
        if verify_pin(body.pin, emp.pin_hash):
            return {"id": emp.id, "full_name": emp.full_name}

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный PIN")
