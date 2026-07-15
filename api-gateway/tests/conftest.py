import os

os.environ["JWT_SECRET"] = "dev-secret-key"
os.environ["ADMIN_EMAILS"] = "admin@example.com"

import pytest_asyncio
from unittest.mock import patch, AsyncMock, MagicMock
from httpx import AsyncClient, ASGITransport, Response
from jose import jwt

from app.main import app

JWT_SECRET = "dev-secret-key"


def make_token(user_id: int = 1, email: str = "user@example.com") -> str:
    return jwt.encode(
        {"sub": str(user_id), "email": email, "type": "access"},
        JWT_SECRET,
        algorithm="HS256",
    )


def auth_headers(user_id: int = 1, email: str = "user@example.com") -> dict:
    return {"Authorization": f"Bearer {make_token(user_id, email)}"}


def admin_headers() -> dict:
    return {"Authorization": f"Bearer {make_token(99, 'admin@example.com')}"}


def make_role_token(user_id: int = 2, email: str = "someone@example.com", role: str = "user") -> str:
    return jwt.encode(
        {"sub": str(user_id), "email": email, "role": role, "type": "access"},
        JWT_SECRET,
        algorithm="HS256",
    )


def make_mock_downstream(status_code: int = 200, json_body: dict = None):
    """Мок httpx-клиента gateway'я: .request() возвращает подготовленный ответ.

    Патчить нужно app.main.get_http_client (return_value=этот мок), а не
    httpx.AsyncClient глобально — иначе перехватывается и сам тестовый клиент.
    """
    mock_response = MagicMock()
    mock_response.status_code = status_code
    mock_response.json.return_value = json_body or {"ok": True}
    mock_response.headers = {"content-type": "application/json"}
    mock_response.content = b'{"ok": true}'

    mock_client = MagicMock()
    mock_client.request = AsyncMock(return_value=mock_response)
    return mock_client


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
