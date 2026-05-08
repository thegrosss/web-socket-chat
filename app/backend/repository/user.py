from app.backend.core.security import security
from app.backend.models.user import User
from app.backend.schemas.user import UserCreate, UserLogin

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

class Repository:
    @classmethod
    async def find_user(cls,
                        session: AsyncSession,
                        **filters):
        query = select(User).filter_by(**filters)
        user = await session.execute(query)

        return user.scalar_one_or_none()


    @classmethod
    async def create_user(cls,
                          user_data: UserCreate,
                          session: AsyncSession):
        user = User(
            email=user_data.email,
            password_hash=security.get_password_hash(user_data.password),
            first_name=user_data.first_name or "",
            last_name=user_data.last_name or "",
            username=user_data.username,
        )

        session.add(user)
        await session.commit()

        return user

    @classmethod
    async def login(cls,
                        user_data: UserLogin,
                        session: AsyncSession):
        user = await cls.find_user(session, email=user_data.email)
        if not user or not security.verify_password(user_data.password, user.password_hash):
            return None
        return user
