from httpx import AsyncClient

from tests.conftest import auth_headers


async def test_health(client: AsyncClient):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["service"] == "activity-service"


async def test_list_activities_empty(client: AsyncClient):
    r = await client.get("/activities")
    assert r.status_code == 200
    assert r.json() == []


async def test_create_activity_unauthenticated(client: AsyncClient):
    r = await client.post(
        "/activities",
        json={"type": "photo", "description": "Горная фотка"},
    )
    assert r.status_code == 403


async def test_create_activity_success(client: AsyncClient):
    r = await client.post(
        "/activities",
        json={"type": "photo", "description": "Горная фотка"},
        headers=auth_headers(user_id=1),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["type"] == "photo"
    assert body["user_id"] == 1
    assert body["id"] is not None


async def test_create_activity_video(client: AsyncClient):
    r = await client.post(
        "/activities",
        json={"type": "video", "description": "Запись спуска"},
        headers=auth_headers(user_id=2),
    )
    assert r.status_code == 200
    assert r.json()["type"] == "video"


async def test_create_activity_no_description(client: AsyncClient):
    r = await client.post(
        "/activities",
        json={"type": "track"},
        headers=auth_headers(user_id=1),
    )
    assert r.status_code == 200
    assert r.json()["description"] is None


async def test_get_activity_found(client: AsyncClient):
    created = (
        await client.post(
            "/activities",
            json={"type": "photo", "description": "Test"},
            headers=auth_headers(user_id=1),
        )
    ).json()

    r = await client.get(f"/activities/{created['id']}")
    assert r.status_code == 200
    assert r.json()["id"] == created["id"]


async def test_get_activity_not_found(client: AsyncClient):
    r = await client.get("/activities/99999")
    assert r.status_code == 404


async def test_list_activities_by_user(client: AsyncClient):
    await client.post(
        "/activities", json={"type": "photo"}, headers=auth_headers(user_id=10)
    )
    await client.post(
        "/activities", json={"type": "video"}, headers=auth_headers(user_id=10)
    )
    await client.post(
        "/activities", json={"type": "track"}, headers=auth_headers(user_id=20)
    )

    r = await client.get("/activities", params={"user_id": 10})
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 2
    assert all(a["user_id"] == 10 for a in data)


async def test_list_activities_pagination(client: AsyncClient):
    for _ in range(5):
        await client.post(
            "/activities", json={"type": "photo"}, headers=auth_headers(user_id=1)
        )

    r = await client.get("/activities", params={"limit": 2, "skip": 0})
    assert len(r.json()) == 2

    r2 = await client.get("/activities", params={"limit": 2, "skip": 2})
    assert len(r2.json()) == 2


async def test_list_activities_contains_all_user_items(client: AsyncClient):
    first = (
        await client.post(
            "/activities", json={"type": "photo", "description": "first"},
            headers=auth_headers(user_id=1),
        )
    ).json()
    second = (
        await client.post(
            "/activities", json={"type": "photo", "description": "second"},
            headers=auth_headers(user_id=1),
        )
    ).json()

    r = await client.get("/activities", params={"user_id": 1})
    data = r.json()
    ids = [a["id"] for a in data]
    assert first["id"] in ids
    assert second["id"] in ids
    assert len(data) == 2
