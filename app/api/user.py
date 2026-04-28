from fastapi import APIRouter, Depends, Response, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import auth
from app.core.config import settings
from app.core.database import get_session
from app.repository.user import Repository
from app.schemas.user import UserCreate, UserLogin

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

    token = auth.create_access_token(uid=str(user.id))
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