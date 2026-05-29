from pydantic import BaseModel
from app.models.user import UserRole


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: UserRole
    full_name: str
    branch_id: int | None


class PinRequest(BaseModel):
    pin: str
    branch_id: int
