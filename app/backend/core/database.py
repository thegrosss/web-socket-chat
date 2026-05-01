from app.backend.core.config import settings

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase):
    pass

def get_db_url():
    return f"sqlite+aiosqlite:///.{settings.DB_NAME}.db"

engine = create_async_engine(url=get_db_url())
session = async_sessionmaker(bind=engine, expire_on_commit=False)

async def get_session():
    async with session() as s:
        yield s