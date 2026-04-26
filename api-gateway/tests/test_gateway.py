import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from httpx import AsyncClient, ConnectError

from tests.conftest import auth_headers, admin_headers, make_mock_downstream
from app.main import verify_jwt, is_public_path, is_admin_write_path, get_service_for_path


# --- Unit tests for helper functions ---

def test_get_service_for_path_auth():
    service, prefix = get_service_for_path("/auth/login")
    assert service == "auth"
    assert prefix == "/auth"


def test_get_service_for_path_resorts():
    service, prefix = get_service_for_path("/resorts")
    assert service == "resort"


def test_get_service_for_path_unknown():
    service, prefix = get_service_for_path("/unknown/path")
    assert service is None
    assert prefix is None


def test_is_public_path_health():
    assert is_public_path("/health") is True


def test_is_public_path_auth_endpoints():
    assert is_public_path("/auth/login") is True
    assert is_public_path("/auth/register") is True


def test_is_public_path_resorts_get():
    assert is_public_path("/resorts", "GET") is True


def test_is_public_path_resorts_post_is_not_public():
    assert is_public_path("/resorts", "POST") is False


def test_is_public_path_lessons_get():
    assert is_public_path("/lessons", "GET") is True


def test_is_public_path_activities_post_not_public():
    assert is_public_path("/activities", "POST") is False


def test_is_admin_write_path_resorts_post():
    assert is_admin_write_path("/resorts", "POST") is True


def test_is_admin_write_path_resorts_reviews_not_admin():
    assert is_admin_write_path("/resorts/1/reviews", "POST") is False


def test_is_admin_write_path_equipment_items_not_admin():
    assert is_admin_write_path("/equipment/items", "POST") is False


def test_is_admin_write_path_get_never_admin():
    assert is_admin_write_path("/resorts", "GET") is False


def test_verify_jwt_valid_token():
    from jose import jwt as _jwt
    token = _jwt.encode(
        {"sub": "1", "email": "test@test.com"},
        "dev-secret-key",
        algorithm="HS256",
    )
    payload = verify_jwt(token)
    assert payload is not None
    assert payload["sub"] == "1"


def test_verify_jwt_invalid_token():
    assert verify_jwt("bad.token.value") is None


# --- Integration tests (with mocked downstream services) ---

async def test_health(client: AsyncClient):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["service"] == "api-gateway"


async def test_unknown_path_returns_404(client: AsyncClient):
    r = await client.get("/nonexistent/path")
    assert r.status_code == 404


async def test_public_get_resorts_no_auth(client: AsyncClient):
    mock_get = make_mock_downstream(200, [{"id": 1, "name": "Test Resort"}])
    with patch("httpx.AsyncClient.get", mock_get):
        r = await client.get("/resorts")
    assert r.status_code == 200


async def test_public_get_lessons_no_auth(client: AsyncClient):
    mock_get = make_mock_downstream(200, [])
    with patch("httpx.AsyncClient.get", mock_get):
        r = await client.get("/lessons")
    assert r.status_code == 200


async def test_protected_activities_post_requires_auth(client: AsyncClient):
    r = await client.post("/activities", json={"type": "photo"})
    assert r.status_code == 401


async def test_protected_activities_post_with_auth(client: AsyncClient):
    mock_post = make_mock_downstream(200, {"id": 1, "type": "photo"})
    with patch("httpx.AsyncClient.post", mock_post):
        r = await client.post(
            "/activities",
            json={"type": "photo"},
            headers=auth_headers(user_id=1),
        )
    assert r.status_code == 200


async def test_protected_users_me_requires_auth(client: AsyncClient):
    r = await client.get("/users/me")
    assert r.status_code == 401


async def test_protected_users_me_with_auth(client: AsyncClient):
    mock_get = make_mock_downstream(200, {"user_id": "1"})
    with patch("httpx.AsyncClient.get", mock_get):
        r = await client.get("/users/me", headers=auth_headers(user_id=1))
    assert r.status_code == 200


async def test_invalid_jwt_token_rejected(client: AsyncClient):
    r = await client.get(
        "/users/me",
        headers={"Authorization": "Bearer invalid.jwt.token"},
    )
    assert r.status_code == 401


async def test_admin_write_resorts_requires_admin(client: AsyncClient):
    r = await client.post(
        "/resorts",
        json={"name": "New Resort"},
        headers=auth_headers(user_id=1, email="user@example.com"),
    )
    assert r.status_code == 403


async def test_admin_write_resorts_with_admin_token(client: AsyncClient):
    mock_post = make_mock_downstream(200, {"id": 1, "name": "New Resort"})
    with patch("httpx.AsyncClient.post", mock_post):
        r = await client.post(
            "/resorts",
            json={"name": "New Resort"},
            headers=admin_headers(),
        )
    assert r.status_code == 200


async def test_resort_reviews_not_admin_restricted(client: AsyncClient):
    # Review creation is NOT admin-only
    mock_post = make_mock_downstream(201, {"id": 1, "rating": 5})
    with patch("httpx.AsyncClient.post", mock_post):
        r = await client.post(
            "/resorts/1/reviews",
            json={"rating": 5},
            headers=auth_headers(user_id=1),
        )
    assert r.status_code == 201


async def test_service_unavailable(client: AsyncClient):
    import httpx as _httpx

    mock_downstream = AsyncMock()
    mock_downstream.__aenter__.return_value = mock_downstream
    mock_downstream.__aexit__.return_value = None
    mock_downstream.get.side_effect = _httpx.ConnectError("Connection refused")

    with patch("app.main.httpx.AsyncClient", return_value=mock_downstream):
        r = await client.get("/resorts")
    assert r.status_code == 503


async def test_auth_register_proxied(client: AsyncClient):
    mock_post = make_mock_downstream(
        200, {"access_token": "tok", "refresh_token": "ref", "token_type": "bearer"}
    )
    with patch("httpx.AsyncClient.post", mock_post):
        r = await client.post(
            "/auth/register",
            json={"email": "new@example.com", "password": "pass123"},
        )
    assert r.status_code == 200


async def test_stats_tracks_post_requires_auth(client: AsyncClient):
    r = await client.post("/stats/tracks", json={})
    assert r.status_code == 401


async def test_stats_tracks_with_auth_proxied(client: AsyncClient):
    mock_post = make_mock_downstream(200, {"id": 1, "distance": 2.5})
    with patch("httpx.AsyncClient.post", mock_post):
        r = await client.post(
            "/stats/tracks",
            json={"started_at": "2026-01-15T10:00:00Z", "ended_at": "2026-01-15T11:00:00Z", "points": []},
            headers=auth_headers(user_id=1),
        )
    assert r.status_code == 200
