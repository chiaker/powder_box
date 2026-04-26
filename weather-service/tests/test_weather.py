import pytest
from unittest.mock import patch, AsyncMock
from httpx import AsyncClient


POINT_PAYLOAD = {
    "name": "Вершина",
    "altitude_m": 2320,
    "latitude": 43.6737,
    "longitude": 40.2678,
    "is_active": True,
}

MOCK_CURRENT_DATA = {
    "temperature_2m": -5.0,
    "relative_humidity_2m": 75,
    "wind_speed_10m": 12.5,
    "weather_code": 71,
    "time": "2026-01-15T10:00",
}


async def test_health(client: AsyncClient):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["service"] == "weather-service"


# --- Altitude Points CRUD ---

async def test_list_altitude_points_empty(client: AsyncClient):
    r = await client.get("/weather/1/altitude-points")
    assert r.status_code == 200
    assert r.json() == []


async def test_create_altitude_point(client: AsyncClient):
    r = await client.post("/weather/1/altitude-points", json=POINT_PAYLOAD)
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Вершина"
    assert body["resort_id"] == 1
    assert body["altitude_m"] == 2320
    assert "id" in body


async def test_list_altitude_points_after_create(client: AsyncClient):
    await client.post("/weather/1/altitude-points", json=POINT_PAYLOAD)
    await client.post(
        "/weather/1/altitude-points",
        json={**POINT_PAYLOAD, "name": "База", "altitude_m": 560},
    )

    r = await client.get("/weather/1/altitude-points")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 2
    assert all(p["resort_id"] == 1 for p in data)


async def test_list_altitude_points_ordered_by_altitude(client: AsyncClient):
    await client.post(
        "/weather/1/altitude-points",
        json={**POINT_PAYLOAD, "altitude_m": 2000},
    )
    await client.post(
        "/weather/1/altitude-points",
        json={**POINT_PAYLOAD, "name": "База", "altitude_m": 560},
    )

    r = await client.get("/weather/1/altitude-points")
    data = r.json()
    assert data[0]["altitude_m"] < data[1]["altitude_m"]


async def test_list_altitude_points_filtered_by_resort(client: AsyncClient):
    await client.post("/weather/1/altitude-points", json=POINT_PAYLOAD)
    await client.post("/weather/2/altitude-points", json={**POINT_PAYLOAD, "name": "Other"})

    r = await client.get("/weather/1/altitude-points")
    assert len(r.json()) == 1
    assert r.json()[0]["resort_id"] == 1


async def test_update_altitude_point(client: AsyncClient):
    created = (await client.post("/weather/1/altitude-points", json=POINT_PAYLOAD)).json()

    r = await client.patch(
        f"/weather/altitude-points/{created['id']}",
        json={"name": "Новая Вершина", "altitude_m": 2500},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Новая Вершина"
    assert body["altitude_m"] == 2500


async def test_update_altitude_point_not_found(client: AsyncClient):
    r = await client.patch("/weather/altitude-points/99999", json={"name": "X"})
    assert r.status_code == 404


async def test_delete_altitude_point(client: AsyncClient):
    created = (await client.post("/weather/1/altitude-points", json=POINT_PAYLOAD)).json()

    r = await client.delete(f"/weather/altitude-points/{created['id']}")
    assert r.status_code == 204

    r2 = await client.get("/weather/1/altitude-points")
    assert r2.json() == []


async def test_delete_altitude_point_not_found(client: AsyncClient):
    r = await client.delete("/weather/altitude-points/99999")
    assert r.status_code == 404


async def test_create_altitude_point_invalid_latitude(client: AsyncClient):
    r = await client.post(
        "/weather/1/altitude-points",
        json={**POINT_PAYLOAD, "latitude": 200.0},
    )
    assert r.status_code == 422


async def test_create_altitude_point_negative_altitude(client: AsyncClient):
    r = await client.post(
        "/weather/1/altitude-points",
        json={**POINT_PAYLOAD, "altitude_m": -10},
    )
    assert r.status_code == 422


# --- Weather endpoints with mocked external API ---

async def test_get_altitude_weather_no_points(client: AsyncClient):
    r = await client.get("/weather/1/altitudes/current")
    assert r.status_code == 200
    assert r.json() == []


async def test_get_altitude_weather_with_mocked_api(client: AsyncClient):
    await client.post("/weather/1/altitude-points", json=POINT_PAYLOAD)

    with patch("app.main.fetch_open_meteo_current", return_value=MOCK_CURRENT_DATA):
        r = await client.get("/weather/1/altitudes/current")

    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["temperature"] == pytest.approx(-5.0)
    assert data[0]["windSpeed"] == pytest.approx(12.5)
    assert data[0]["altitude_m"] == 2320


async def test_get_current_weather_fallback_no_points(client: AsyncClient):
    # When no altitude points exist, returns fallback mock data
    r = await client.get("/weather/1/current")
    assert r.status_code == 200
    body = r.json()
    assert "temperature" in body
    assert "windSpeed" in body
    assert "condition" in body
    assert body["resortId"] == 1


async def test_get_current_weather_with_points_mocked(client: AsyncClient):
    await client.post("/weather/1/altitude-points", json=POINT_PAYLOAD)

    with patch("app.main.fetch_open_meteo_current", return_value=MOCK_CURRENT_DATA):
        r = await client.get("/weather/1/current")

    assert r.status_code == 200
    body = r.json()
    assert body["temperature"] == pytest.approx(-5.0)
    assert body["resortId"] == 1
    assert body["condition"] == "Снег"


async def test_get_hourly_forecast(client: AsyncClient):
    r = await client.get("/weather/1/hourly", params={"hours": 3})
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 3
    assert all("temperature" in h for h in data)
    assert all(h["resortId"] == 1 for h in data)


async def test_get_daily_forecast(client: AsyncClient):
    r = await client.get("/weather/1/daily", params={"days": 5})
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 5
    assert all("minTemperature" in d for d in data)


async def test_get_snow_conditions(client: AsyncClient):
    r = await client.get("/snow/1/conditions")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["resortId"] == 1
    assert "baseSnowDepth" in data[0]
    assert "avalancheRiskLevel" in data[0]


async def test_weather_condition_from_code():
    from app.main import weather_condition_from_code
    # code=0 is falsy, so `code or -1` gives -1 → "Неизвестно" (known quirk)
    assert weather_condition_from_code(0) == "Неизвестно"
    assert weather_condition_from_code(1) == "Преимущественно ясно"
    assert weather_condition_from_code(71) == "Снег"
    assert weather_condition_from_code(95) == "Гроза"
    assert weather_condition_from_code(999) == "Неизвестно"
    assert weather_condition_from_code(None) == "Неизвестно"
