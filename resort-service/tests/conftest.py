import os
import tempfile

_db_file = tempfile.mktemp(suffix="_resort_test.db")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_db_file}"
os.environ["JWT_SECRET"] = "dev-secret-key"

import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from jose import jwt

from app.main import app
from app.database import Base, engine, async_session
from app.models import Resort

JWT_SECRET = "dev-secret-key"

SEED_RESORTS = [
    {"name": "Роза Хутор", "description": "Крупнейший горнолыжный курорт Красной Поляны", "rating": 4.8},
    {"name": "Красная Поляна", "description": "Горки Город — курорт в Красной Поляне", "rating": 4.6},
    {"name": "Газпром Поляна", "description": "Курорт Газпром — Лаура и Альпика", "rating": 4.7},
]


def make_token(user_id: int = 1, email: str = "test@test.com") -> str:
    return jwt.encode(
        {"sub": str(user_id), "email": email, "type": "access"},
        JWT_SECRET,
        algorithm="HS256",
    )


def auth_headers(user_id: int = 1, email: str = "test@test.com") -> dict:
    return {"Authorization": f"Bearer {make_token(user_id, email)}"}


@pytest_asyncio.fixture(autouse=True)
async def reset_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)


@pytest_asyncio.fixture
async def client(reset_db):
    # ASGITransport does not trigger ASGI lifespan, so we seed manually
    async with async_session() as db:
        for data in SEED_RESORTS:
            db.add(Resort(**data))
        await db.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
