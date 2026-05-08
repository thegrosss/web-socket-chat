import re
from datetime import date

from fastapi import APIRouter, Depends, File, Form, Response, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, or_

from app.backend.core.security import security
from app.backend.core.config import settings
from app.backend.core.database import get_session
from app.backend.core.uploads import save_upload_file
from app.backend.repository.user import Repository
from app.backend.schemas.user import UserCreate, UserLogin, UserSearch
from app.backend.models.user import User

router = APIRouter(prefix="/users", tags=["users"])
USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,32}$")


def normalize_username(username: str | None) -> str | None:
    if username is None:
        return None

    cleaned = username.strip()
    if cleaned.startswith("@"):
        cleaned = cleaned[1:]
    if not cleaned:
        return None
    if not USERNAME_RE.fullmatch(cleaned):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username must be 3-32 characters and contain only letters, numbers and underscores",
        )
    return cleaned


def serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "username": user.username,
        "bio": user.bio,
        "avatar_url": user.avatar_url,
        "birth_date": user.birth_date.isoformat() if user.birth_date else None,
    }


def serialize_public_user(user: User) -> dict:
    return {
        "id": user.id,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "username": user.username,
        "bio": user.bio,
        "avatar_url": user.avatar_url,
        "birth_date": user.birth_date.isoformat() if user.birth_date else None,
    }

@router.post("/register")
async def register(user_data: UserCreate,
                   session: AsyncSession = Depends(get_session)):
    user_data.username = normalize_username(user_data.username)
    existing_user = await Repository.find_user(email=user_data.email, session=session)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    if user_data.username:
        existing_username = await session.execute(
            select(User).where(func.lower(User.username) == user_data.username.lower())
        )
        if existing_username.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken"
            )

    user = await Repository.create_user(user_data, session=session)
    return serialize_user(user)


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
async def get_me(
        user_id: int = Depends(security.get_current_user),
        session: AsyncSession = Depends(get_session)
):
    user = await Repository.find_user(session, id=user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return serialize_user(user)


@router.put("/me")
async def update_me(
        first_name: str | None = Form(None),
        last_name: str | None = Form(None),
        username: str | None = Form(None),
        bio: str | None = Form(None),
        birth_date: str | None = Form(None),
        avatar: UploadFile | None = File(None),
        user_id: int = Depends(security.get_current_user),
        session: AsyncSession = Depends(get_session),
):
    user = await Repository.find_user(session, id=user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    normalized_username = normalize_username(username)
    if normalized_username:
        existing = await session.execute(
            select(User).where(
                func.lower(User.username) == normalized_username.lower(),
                User.id != user_id
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken"
            )

    parsed_birth_date = None
    if birth_date:
        try:
            parsed_birth_date = date.fromisoformat(birth_date)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Birth date must be in YYYY-MM-DD format",
            )

    if avatar and avatar.filename:
        saved_avatar = await save_upload_file(avatar, "avatars", max_size=5 * 1024 * 1024)
        user.avatar_url = saved_avatar["url"]

    user.first_name = (first_name or "").strip()
    user.last_name = (last_name or "").strip()
    user.username = normalized_username
    user.bio = (bio or "").strip() or None
    user.birth_date = parsed_birth_date

    await session.commit()
    await session.refresh(user)

    return serialize_user(user)


@router.post("/search")
async def search_users(
        other_user: UserSearch,
        session: AsyncSession = Depends(get_session)
):
    raw_term = (other_user.first_name or other_user.last_name or "").strip()
    if raw_term.startswith("@"):
        raw_term = raw_term[1:]

    if not raw_term:
        return []

    search_term = f"%{raw_term}%"
    result = await session.execute(
        select(User)
        .where(
            or_(
                User.first_name.ilike(search_term),
                User.last_name.ilike(search_term),
                User.username.ilike(search_term)
            )
        )
        .limit(20)
    )
    users = result.scalars().all()

    return [
        {
            "id": u.id,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "email": u.email,
            "username": u.username,
            "avatar_url": u.avatar_url
        }
        for u in users
    ]


@router.get("/{other_user_id}")
async def get_user_profile(
        other_user_id: int,
        user_id: int = Depends(security.get_current_user),
        session: AsyncSession = Depends(get_session)
):
    user = await Repository.find_user(session, id=other_user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return serialize_public_user(user)
