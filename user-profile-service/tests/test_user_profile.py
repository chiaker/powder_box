from httpx import AsyncClient

from tests.conftest import auth_headers


async def test_health(client: AsyncClient):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["service"] == "user-profile-service"


async def test_get_me_no_profile(client: AsyncClient):
    r = await client.get("/users/me", headers=auth_headers(user_id=1))
    assert r.status_code == 200
    body = r.json()
    assert body["user_id"] == "1"
    assert body["nickname"] is None
    assert body["favorite_resorts"] == []


async def test_get_me_unauthenticated(client: AsyncClient):
    r = await client.get("/users/me")
    assert r.status_code in (401, 403)


async def test_update_me_creates_profile(client: AsyncClient):
    r = await client.put(
        "/users/me",
        json={
            "nickname": "Skipper",
            "level": "intermediate",
            "equipment_type": "ski",
        },
        headers=auth_headers(user_id=1),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["nickname"] == "Skipper"
    assert body["level"] == "intermediate"
    assert body["equipment_type"] == "ski"
    assert body["user_id"] == "1"


async def test_update_me_unauthenticated(client: AsyncClient):
    r = await client.put("/users/me", json={"nickname": "X"})
    assert r.status_code in (401, 403)


async def test_update_me_persists(client: AsyncClient):
    await client.put(
        "/users/me",
        json={"nickname": "SnowRider"},
        headers=auth_headers(user_id=2),
    )

    r = await client.get("/users/me", headers=auth_headers(user_id=2))
    assert r.status_code == 200
    assert r.json()["nickname"] == "SnowRider"


async def test_update_favorite_resorts(client: AsyncClient):
    r = await client.put(
        "/users/me",
        json={"favorite_resorts": ["1", "3", "5"]},
        headers=auth_headers(user_id=3),
    )
    assert r.status_code == 200
    assert r.json()["favorite_resorts"] == ["1", "3", "5"]


async def test_update_partial_fields(client: AsyncClient):
    await client.put(
        "/users/me",
        json={"nickname": "InitialName", "level": "beginner"},
        headers=auth_headers(user_id=4),
    )

    r = await client.put(
        "/users/me",
        json={"level": "advanced"},
        headers=auth_headers(user_id=4),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["nickname"] == "InitialName"
    assert body["level"] == "advanced"


async def test_get_user_by_id(client: AsyncClient):
    await client.put(
        "/users/me",
        json={"nickname": "PublicUser"},
        headers=auth_headers(user_id=10),
    )

    r = await client.get("/users/10", headers=auth_headers(user_id=1))
    assert r.status_code == 200
    assert r.json()["nickname"] == "PublicUser"
    assert r.json()["user_id"] == "10"


async def test_get_user_not_found(client: AsyncClient):
    r = await client.get("/users/99999", headers=auth_headers(user_id=1))
    assert r.status_code == 404


async def test_get_user_unauthenticated(client: AsyncClient):
    r = await client.get("/users/1")
    assert r.status_code in (401, 403)


async def test_get_user_invalid_id(client: AsyncClient):
    r = await client.get("/users/not-a-number", headers=auth_headers(user_id=1))
    assert r.status_code == 400


async def test_stats_default_zero(client: AsyncClient):
    r = await client.get("/users/me", headers=auth_headers(user_id=7))
    body = r.json()
    assert body["total_distance"] == 0.0
    assert body["total_descent"] == 0.0
