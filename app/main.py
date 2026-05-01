from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.backend.core.database import Base, engine
from app.backend.api.router_page import router as router_page
from app.backend.api.websocket import router as router_websocket
from app.backend.api.user import router as user_router
from app.backend.api.dialogs import router as dialog_router


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

app.mount("/static", StaticFiles(directory="app/frontend/static"), name="static")

app.include_router(router_page)
app.include_router(router_websocket)
app.include_router(user_router)
app.include_router(dialog_router)