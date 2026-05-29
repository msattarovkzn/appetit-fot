from datetime import datetime, timedelta, timezone
import hashlib
import bcrypt
from jose import JWTError, jwt
from app.config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def hash_pin(pin: str) -> str:
    return bcrypt.hashpw(pin.encode(), bcrypt.gensalt()).decode()


def verify_pin(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def make_pin_check(pin: str) -> str:
    """Deterministic SHA-256 hash of PIN for uniqueness constraint.
    NOT for authentication — bcrypt (pin_hash) is used for that.
    Only for fast DB-level duplicate detection.
    """
    return hashlib.sha256(pin.encode()).hexdigest()


def create_access_token(data: dict) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {**data, "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    except JWTError:
        return None
