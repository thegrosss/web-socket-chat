from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from contextlib import asynccontextmanager

from app.core.database import Base, engine
from app.api.router_page import router as router_page
from app.api.router_socket import router as router_socket
from app.api.user import router as user_router

import uvicorn

async def create_tables():
    async with engine.begin() as conn:
        # await conn.run_sync(Base.metadata.drop_all)
        # print("Таблицы очищены")

        await conn.run_sync(Base.metadata.create_all)
        print("Таблицы созданы")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    yield
    await engine.dispose()


app = FastAPI(lifespan=lifespan)

app.mount("/static", StaticFiles(directory="app/static"), name="static")

app.include_router(router_page)
app.include_router(router_socket)
app.include_router(user_router)