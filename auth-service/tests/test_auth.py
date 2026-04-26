import pytest
from httpx import AsyncClient


async def test_health(client: AsyncClient):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["service"] == "auth-service"


async def test_register_success(client: AsyncClient):
    r = await client.post(
        "/auth/register",
        json={"email": "user@example.com", "password": "secret123"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "access_token" in body
    assert "refresh_token" in body
    assert body["token_type"] == "bearer"


async def test_register_duplicate_email(client: AsyncClient):
    payload = {"email": "dup@example.com", "password": "pass123"}
    await client.post("/auth/register", json=payload)
    r = await client.post("/auth/register", json=payload)
    assert r.status_code == 400
    assert "already registered" in r.json()["detail"]


async def test_register_invalid_email(client: AsyncClient):
    r = await client.post(
        "/auth/register",
        json={"email": "not-an-email", "password": "pass123"},
    )
    assert r.status_code == 422


async def test_register_password_too_long(client: AsyncClient):
    r = await client.post(
        "/auth/register",
        json={"email": "long@example.com", "password": "x" * 73},
    )
    assert r.status_code == 400
    assert "too long" in r.json()["detail"]


async def test_login_success(client: AsyncClient):
    await client.post(
        "/auth/register",
        json={"email": "login@example.com", "password": "mypassword"},
    )
    r = await client.post(
        "/auth/login",
        json={"email": "login@example.com", "password": "mypassword"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "access_token" in body
    assert "refresh_token" in body


async def test_login_wrong_password(client: AsyncClient):
    await client.post(
        "/auth/register",
        json={"email": "wrong@example.com", "password": "correct"},
    )
    r = await client.post(
        "/auth/login",
        json={"email": "wrong@example.com", "password": "incorrect"},
    )
    assert r.status_code == 401
    assert "Invalid" in r.json()["detail"]


async def test_login_unknown_email(client: AsyncClient):
    r = await client.post(
        "/auth/login",
        json={"email": "nobody@example.com", "password": "anything"},
    )
    assert r.status_code == 401


async def test_refresh_success(client: AsyncClient):
    reg = await client.post(
        "/auth/register",
        json={"email": "refresh@example.com", "password": "pass"},
    )
    refresh_token = reg.json()["refresh_token"]

    r = await client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert r.status_code == 200
    body = r.json()
    assert "access_token" in body
    assert body["refresh_token"] != refresh_token


async def test_refresh_invalid_token(client: AsyncClient):
    r = await client.post("/auth/refresh", json={"refresh_token": "badtoken"})
    assert r.status_code == 401


async def test_refresh_revoked_token(client: AsyncClient):
    reg = await client.post(
        "/auth/register",
        json={"email": "rev@example.com", "password": "pass"},
    )
    refresh_token = reg.json()["refresh_token"]

    await client.post("/auth/refresh", json={"refresh_token": refresh_token})
    # Using the same refresh token again should fail (it was revoked on rotation)
    r = await client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert r.status_code == 401


async def test_logout_success(client: AsyncClient):
    reg = await client.post(
        "/auth/register",
        json={"email": "logout@example.com", "password": "pass"},
    )
    refresh_token = reg.json()["refresh_token"]

    r = await client.post("/auth/logout", json={"refresh_token": refresh_token})
    assert r.status_code == 200
    assert r.json()["success"] is True


async def test_logout_then_refresh_fails(client: AsyncClient):
    reg = await client.post(
        "/auth/register",
        json={"email": "logoutref@example.com", "password": "pass"},
    )
    refresh_token = reg.json()["refresh_token"]

    await client.post("/auth/logout", json={"refresh_token": refresh_token})
    r = await client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert r.status_code == 401


async def test_logout_invalid_token(client: AsyncClient):
    r = await client.post("/auth/logout", json={"refresh_token": "garbage"})
    assert r.status_code == 200
    assert r.json()["success"] is True
