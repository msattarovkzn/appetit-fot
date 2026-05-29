from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.database import get_db
from app.models.branch import Branch
from app.dependencies import get_current_user, require_manager

router = APIRouter(prefix="/branches", tags=["branches"])


class BranchOut(BaseModel):
    id: int
    name: str
    city: str
    is_active: bool

    model_config = {"from_attributes": True}


@router.get("", response_model=list[BranchOut])
async def list_branches(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Branch).where(Branch.is_active == True))
    return result.scalars().all()
