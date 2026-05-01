from fastapi import APIRouter, Depends, Response, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_

from app.backend.core.security import security
from app.backend.core.config import settings
from app.backend.core.database import get_session
from app.backend.repository.user import Repository
from app.backend.schemas.user import UserCreate, UserLogin, UserSearch
from app.backend.models.user import User

router = APIRouter(prefix="/users", tags=["users"])

@router.post("/register")
async def register(user_data: UserCreate,
                   session: AsyncSession = Depends(get_session)):
    existing_user = await Repository.find_user(email=user_data.email, session=session)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    user = await Repository.create_user(user_data, session=session)
    return user


@router.post("/login")
async def login(user_data: UserLogin,
                response: Response,
                session: AsyncSession = Depends(get_session)):
    user = await Repository.login(user_data, session)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    token = security.auth.create_access_token(uid=str(user.id))
    response.set_cookie(settings.ACCESS_COOKIE_NAME, token)

    return {
        "message": "ok",
        "token": token
    }

@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(settings.ACCESS_COOKIE_NAME)
    return {
        "message": "Successfully logged out"
    }

@router.get("/me")
async def get_me(user_id: int = Depends(security.get_current_user)):
    return {"id": user_id}


@router.post("/search")
async def search_users(
        other_user: UserSearch,
        session: AsyncSession = Depends(get_session)
):
    # Оборачиваем поисковое слово в % для поиска по подстроке в SQL
    search_term = f"%{other_user.first_name}%" if other_user.first_name else ""

    if not search_term or search_term == "%%":
        return []

    result = await session.execute(
        select(User)
        .where(
            or_(
                User.first_name.ilike(search_term),
                User.last_name.ilike(search_term)
            )
        )
    )
    users = result.scalars().all()

    return [
        {
            "id": u.id,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "email": u.email
        }
        for u in users
    ]
