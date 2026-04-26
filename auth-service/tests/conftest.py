import os
import tempfile

# Must be set before any app imports so the engine picks up the test URL
_db_file = tempfile.mktemp(suffix="_auth_test.db")
_log_file = tempfile.mktemp(suffix="_auth_test.log")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_db_file}"
os.environ["AUTH_POST_LOG_FILE"] = _log_file
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


def auth_headers(user_id: int = 1, email: str = "test@test.com") -> dict:
    return {"Authorization": f"Bearer {make_token(user_id, email)}"}


@pytest_asyncio.fixture(autouse=True)
async def reset_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)


@pytest_asyncio.fixture
async def client(reset_db):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
