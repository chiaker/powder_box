import os
import tempfile

_db_file = tempfile.mktemp(suffix="_lesson_test.db")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_db_file}"

import pytest_asyncio
from unittest.mock import patch
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.database import Base, engine, async_session
from app.models import Lesson

SEED_LESSONS = [
    ("Базовая стойка на сноуборде", "snowboard", "https://youtube.com/watch?v=example1"),
    ("Карвинг для начинающих", "ski", "https://youtube.com/watch?v=example2"),
    ("Как не бояться бугеля", "ski", "https://youtube.com/watch?v=example3"),
]


@pytest_asyncio.fixture(autouse=True)
async def reset_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)


@pytest_asyncio.fixture
async def client(reset_db):
    # ASGITransport does not trigger ASGI lifespan, so we seed manually
    async with async_session() as db:
        for title, cat, url in SEED_LESSONS:
            db.add(Lesson(title=title, category=cat, lesson_url=url))
        await db.commit()

    # Mock Rutube API calls so tests don't make real HTTP requests
    with patch("app.main._fetch_rutube_preview_sync", return_value=None):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            yield ac
