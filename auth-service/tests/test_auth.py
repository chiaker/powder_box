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
    payload = {"email": "dup@example.com", "password": "pass1234"}
    await client.post("/auth/register", json=payload)
    r = await client.post("/auth/register", json=payload)
    assert r.status_code == 400
    assert "already registered" in r.json()["detail"]


async def test_register_invalid_email(client: AsyncClient):
    r = await client.post(
        "/auth/register",
        json={"email": "not-an-email", "password": "pass1234"},
    )
    assert r.status_code == 422


async def test_register_password_too_short(client: AsyncClient):
    r = await client.post(
        "/auth/register",
        json={"email": "short@example.com", "password": "short"},
    )
    assert r.status_code == 422


async def test_access_token_has_role_claim(client: AsyncClient):
    from jose import jwt
    from app.main import JWT_SECRET, JWT_ALGORITHM

    r = await client.post(
        "/auth/register",
        json={"email": "roleuser@example.com", "password": "password1"},
    )
    payload = jwt.decode(r.json()["access_token"], JWT_SECRET, algorithms=[JWT_ALGORITHM])
    assert payload["role"] == "user"
    assert payload["email"] == "roleuser@example.com"


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
        json={"email": "wrong@example.com", "password": "correct1"},
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
        json={"email": "refresh@example.com", "password": "password1"},
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
        json={"email": "rev@example.com", "password": "password1"},
    )
    refresh_token = reg.json()["refresh_token"]

    await client.post("/auth/refresh", json={"refresh_token": refresh_token})
    # Using the same refresh token again should fail (it was revoked on rotation)
    r = await client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert r.status_code == 401


async def test_logout_success(client: AsyncClient):
    reg = await client.post(
        "/auth/register",
        json={"email": "logout@example.com", "password": "password1"},
    )
    refresh_token = reg.json()["refresh_token"]

    r = await client.post("/auth/logout", json={"refresh_token": refresh_token})
    assert r.status_code == 200
    assert r.json()["success"] is True


async def test_logout_then_refresh_fails(client: AsyncClient):
    reg = await client.post(
        "/auth/register",
        json={"email": "logoutref@example.com", "password": "password1"},
    )
    refresh_token = reg.json()["refresh_token"]

    await client.post("/auth/logout", json={"refresh_token": refresh_token})
    r = await client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert r.status_code == 401


async def test_logout_invalid_token(client: AsyncClient):
    r = await client.post("/auth/logout", json={"refresh_token": "garbage"})
    assert r.status_code == 200
    assert r.json()["success"] is True


# --- Email confirmation ---

async def _get_user(email: str):
    from sqlalchemy import select
    from app.database import async_session
    from app.models import User

    async with async_session() as db:
        result = await db.execute(select(User).where(User.email == email))
        return result.scalar_one()


async def test_register_creates_unconfirmed_user_with_token(client: AsyncClient):
    r = await client.post("/auth/register", json={"email": "conf@example.com", "password": "password1"})
    assert r.status_code == 200
    user = await _get_user("conf@example.com")
    assert user.email_confirmed is False
    assert user.confirm_token_hash
    assert user.confirm_token_expires_at is not None


async def test_confirm_email_success_and_reuse_fails(client: AsyncClient):
    from sqlalchemy import select
    from app.database import async_session
    from app.main import issue_confirm_token
    from app.models import User

    await client.post("/auth/register", json={"email": "conf2@example.com", "password": "password1"})
    async with async_session() as db:
        result = await db.execute(select(User).where(User.email == "conf2@example.com"))
        user = result.scalar_one()
        token = issue_confirm_token(user)
        await db.commit()

    r = await client.post("/auth/confirm", json={"token": token})
    assert r.status_code == 200
    user = await _get_user("conf2@example.com")
    assert user.email_confirmed is True
    assert user.confirm_token_hash is None

    # Повторный клик по той же ссылке
    r = await client.post("/auth/confirm", json={"token": token})
    assert r.status_code == 400


async def test_confirm_email_expired_token(client: AsyncClient):
    from datetime import datetime, timedelta, timezone

    from sqlalchemy import select
    from app.database import async_session
    from app.main import issue_confirm_token
    from app.models import User

    await client.post("/auth/register", json={"email": "conf3@example.com", "password": "password1"})
    async with async_session() as db:
        result = await db.execute(select(User).where(User.email == "conf3@example.com"))
        user = result.scalar_one()
        token = issue_confirm_token(user)
        user.confirm_token_expires_at = datetime.now(timezone.utc) - timedelta(hours=1)
        await db.commit()

    r = await client.post("/auth/confirm", json={"token": token})
    assert r.status_code == 400


async def test_confirm_email_garbage_token(client: AsyncClient):
    r = await client.post("/auth/confirm", json={"token": "garbage"})
    assert r.status_code == 400


async def test_auth_me(client: AsyncClient):
    reg = await client.post("/auth/register", json={"email": "me@example.com", "password": "password1"})
    access = reg.json()["access_token"]

    r = await client.get("/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert r.status_code == 200
    assert r.json() == {"email": "me@example.com", "email_confirmed": False}


async def test_auth_me_unauthorized(client: AsyncClient):
    r = await client.get("/auth/me")
    assert r.status_code == 403  # HTTPBearer без заголовка


async def test_resend_confirmation(client: AsyncClient):
    reg = await client.post("/auth/register", json={"email": "resend@example.com", "password": "password1"})
    access = reg.json()["access_token"]

    old_user = await _get_user("resend@example.com")
    old_hash = old_user.confirm_token_hash

    r = await client.post("/auth/resend-confirmation", headers={"Authorization": f"Bearer {access}"})
    assert r.status_code == 200
    user = await _get_user("resend@example.com")
    assert user.confirm_token_hash != old_hash


async def test_resend_confirmation_already_confirmed(client: AsyncClient):
    from sqlalchemy import select
    from app.database import async_session
    from app.models import User

    reg = await client.post("/auth/register", json={"email": "done@example.com", "password": "password1"})
    access = reg.json()["access_token"]
    async with async_session() as db:
        result = await db.execute(select(User).where(User.email == "done@example.com"))
        result.scalar_one().email_confirmed = True
        await db.commit()

    r = await client.post("/auth/resend-confirmation", headers={"Authorization": f"Bearer {access}"})
    assert r.status_code == 400


async def test_internal_users_emails(client: AsyncClient):
    await client.post("/auth/register", json={"email": "int1@example.com", "password": "password1"})
    await client.post("/auth/register", json={"email": "int2@example.com", "password": "password1"})
    u1 = await _get_user("int1@example.com")
    u2 = await _get_user("int2@example.com")

    r = await client.post("/internal/users/emails", json={"ids": [u1.id, u2.id, 9999]})
    assert r.status_code == 200
    data = r.json()
    assert data[str(u1.id)] == {"email": "int1@example.com", "confirmed": False}
    assert str(u2.id) in data
    assert "9999" not in data
