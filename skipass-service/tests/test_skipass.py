import pytest
from httpx import AsyncClient


TARIFF_PAYLOAD = {
    "season_name": "Зима 2025/2026",
    "season_start": "2025-12-01",
    "season_end": "2026-03-31",
    "age_category": "adult",
    "access_type": "day",
    "duration_days": 1,
    "is_fast_track": False,
    "price": 3500.0,
    "currency": "RUB",
    "is_active": True,
}


async def test_health(client: AsyncClient):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["service"] == "skipass-service"


async def test_list_tariffs_empty(client: AsyncClient):
    r = await client.get("/skipasses")
    assert r.status_code == 200
    assert r.json() == []


async def test_create_tariff(client: AsyncClient):
    r = await client.post("/skipasses/resort/1", json=TARIFF_PAYLOAD)
    assert r.status_code == 201
    body = r.json()
    assert body["season_name"] == "Зима 2025/2026"
    assert body["resort_id"] == 1
    assert body["price"] == 3500.0
    assert "id" in body


async def test_create_tariff_invalid_dates(client: AsyncClient):
    bad_payload = {
        **TARIFF_PAYLOAD,
        "season_start": "2026-04-01",
        "season_end": "2025-12-01",
    }
    r = await client.post("/skipasses/resort/1", json=bad_payload)
    assert r.status_code == 400
    assert "season_start" in r.json()["detail"]


async def test_get_tariff_found(client: AsyncClient):
    created = (await client.post("/skipasses/resort/1", json=TARIFF_PAYLOAD)).json()

    r = await client.get(f"/skipasses/{created['id']}")
    assert r.status_code == 200
    assert r.json()["id"] == created["id"]


async def test_get_tariff_not_found(client: AsyncClient):
    r = await client.get("/skipasses/99999")
    assert r.status_code == 404


async def test_list_tariffs_filter_by_resort(client: AsyncClient):
    await client.post("/skipasses/resort/1", json=TARIFF_PAYLOAD)
    await client.post("/skipasses/resort/1", json={**TARIFF_PAYLOAD, "age_category": "child"})
    await client.post("/skipasses/resort/2", json=TARIFF_PAYLOAD)

    r = await client.get("/skipasses", params={"resort_id": 1})
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 2
    assert all(t["resort_id"] == 1 for t in data)


async def test_list_tariffs_filter_by_age_category(client: AsyncClient):
    await client.post("/skipasses/resort/1", json={**TARIFF_PAYLOAD, "age_category": "adult"})
    await client.post("/skipasses/resort/1", json={**TARIFF_PAYLOAD, "age_category": "child"})

    r = await client.get("/skipasses", params={"age_category": "child"})
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["age_category"] == "child"


async def test_list_tariffs_filter_by_access_type(client: AsyncClient):
    await client.post("/skipasses/resort/1", json={**TARIFF_PAYLOAD, "access_type": "day"})
    await client.post("/skipasses/resort/1", json={**TARIFF_PAYLOAD, "access_type": "evening"})

    r = await client.get("/skipasses", params={"access_type": "evening"})
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["access_type"] == "evening"


async def test_list_tariffs_filter_by_season_date(client: AsyncClient):
    await client.post("/skipasses/resort/1", json=TARIFF_PAYLOAD)  # Dec-Mar

    r = await client.get("/skipasses", params={"season_date": "2026-01-15"})
    assert r.status_code == 200
    assert len(r.json()) == 1

    r2 = await client.get("/skipasses", params={"season_date": "2026-06-01"})
    assert r2.status_code == 200
    assert r2.json() == []


async def test_update_tariff(client: AsyncClient):
    created = (await client.post("/skipasses/resort/1", json=TARIFF_PAYLOAD)).json()

    r = await client.patch(
        f"/skipasses/{created['id']}",
        json={"price": 4000.0, "is_active": False},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["price"] == 4000.0
    assert body["is_active"] is False


async def test_update_tariff_invalid_dates(client: AsyncClient):
    created = (await client.post("/skipasses/resort/1", json=TARIFF_PAYLOAD)).json()

    r = await client.patch(
        f"/skipasses/{created['id']}",
        json={"season_start": "2027-01-01", "season_end": "2026-01-01"},
    )
    assert r.status_code == 400


async def test_update_tariff_not_found(client: AsyncClient):
    r = await client.patch("/skipasses/99999", json={"price": 100.0})
    assert r.status_code == 404


async def test_delete_tariff(client: AsyncClient):
    created = (await client.post("/skipasses/resort/1", json=TARIFF_PAYLOAD)).json()

    r = await client.delete(f"/skipasses/{created['id']}")
    assert r.status_code == 204

    r2 = await client.get(f"/skipasses/{created['id']}")
    assert r2.status_code == 404


async def test_delete_tariff_not_found(client: AsyncClient):
    r = await client.delete("/skipasses/99999")
    assert r.status_code == 404


async def test_get_price_found(client: AsyncClient):
    await client.post("/skipasses/resort/5", json=TARIFF_PAYLOAD)

    r = await client.get(
        "/skipasses/resort/5/price",
        params={
            "duration_days": 1,
            "age_group": "adult",
            "time_type": "day",
            "fast_track": "false",
            "season_date": "2026-01-15",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["price"] == pytest.approx(3500.0)
    assert body["currency"] == "RUB"
    assert body["tariff_id"] is not None


async def test_get_price_not_found_returns_zero(client: AsyncClient):
    r = await client.get(
        "/skipasses/resort/999/price",
        params={
            "duration_days": 1,
            "age_group": "adult",
            "time_type": "day",
        },
    )
    assert r.status_code == 200
    assert r.json()["price"] == 0.0


async def test_fast_track_tariff(client: AsyncClient):
    fast_payload = {**TARIFF_PAYLOAD, "is_fast_track": True, "price": 5000.0}
    await client.post("/skipasses/resort/1", json=fast_payload)
    await client.post("/skipasses/resort/1", json=TARIFF_PAYLOAD)

    r = await client.get("/skipasses", params={"is_fast_track": "true"})
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["is_fast_track"] is True
