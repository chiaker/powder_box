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


# --- Snow alerts ---

async def test_snow_alert_fields_default(client: AsyncClient):
    r = await client.get("/users/me", headers=auth_headers(50))
    assert r.status_code == 200
    assert r.json()["snow_alerts_enabled"] is False
    assert r.json()["snow_alert_threshold_cm"] == 10


async def test_enable_snow_alerts(client: AsyncClient):
    r = await client.put(
        "/users/me",
        json={"snow_alerts_enabled": True, "snow_alert_threshold_cm": 5},
        headers=auth_headers(51),
    )
    assert r.status_code == 200
    assert r.json()["snow_alerts_enabled"] is True
    assert r.json()["snow_alert_threshold_cm"] == 5


async def test_old_style_put_does_not_reset_snow_alerts(client: AsyncClient):
    # Включаем алерты
    await client.put(
        "/users/me",
        json={"snow_alerts_enabled": True, "snow_alert_threshold_cm": 7},
        headers=auth_headers(52),
    )
    # Старый фронтовый PUT без новых полей (toggleFavorite и т.п.)
    r = await client.put(
        "/users/me",
        json={"nickname": "rider", "level": None, "equipment_type": None, "favorite_resorts": ["3"]},
        headers=auth_headers(52),
    )
    assert r.status_code == 200
    assert r.json()["snow_alerts_enabled"] is True
    assert r.json()["snow_alert_threshold_cm"] == 7


async def test_snow_alert_threshold_validation(client: AsyncClient):
    r = await client.put("/users/me", json={"snow_alert_threshold_cm": 0}, headers=auth_headers(53))
    assert r.status_code == 422
    r = await client.put("/users/me", json={"snow_alert_threshold_cm": 101}, headers=auth_headers(53))
    assert r.status_code == 422


async def test_internal_snow_alert_subscriptions(client: AsyncClient):
    # Подписан с избранным — попадает
    await client.put(
        "/users/me",
        json={"snow_alerts_enabled": True, "snow_alert_threshold_cm": 15, "favorite_resorts": ["1", "2"]},
        headers=auth_headers(60),
    )
    # Подписан, но без избранного — не попадает
    await client.put("/users/me", json={"snow_alerts_enabled": True}, headers=auth_headers(61))
    # Не подписан — не попадает
    await client.put("/users/me", json={"favorite_resorts": ["1"]}, headers=auth_headers(62))

    r = await client.get("/internal/snow-alert-subscriptions")
    assert r.status_code == 200
    subs = r.json()
    assert subs == [{"user_id": 60, "threshold_cm": 15, "resort_ids": ["1", "2"]}]
