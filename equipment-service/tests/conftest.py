import os
import tempfile

_db_file = tempfile.mktemp(suffix="_equipment_test.db")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_db_file}"
os.environ["JWT_SECRET"] = "dev-secret-key"

import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from jose import jwt

from app.main import app
from app.database import Base, engine

JWT_SECRET = "dev-secret-key"


def make_token(user_id: int = 1, email: str = "test@test.com") -> str:
    return jwt.encode(
        {"sub": str(user_id), "email": email, "type": "access"},
        JWT_SECRET,
        algorithm="HS256",
    )


def auth_headers(user_id: int = 1) -> dict:
    return {"Authorization": f"Bearer {make_token(user_id)}"}


@pytest_asyncio.fixture(autouse=True)
async def reset_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)


@pytest_asyncio.fixture
async def client(reset_db):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
