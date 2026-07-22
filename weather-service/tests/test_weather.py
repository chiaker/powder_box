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


async def test_get_current_weather_no_points_404(client: AsyncClient):
    r = await client.get("/weather/1/current")
    assert r.status_code == 404


async def test_get_current_weather_with_points_mocked(client: AsyncClient):
    await client.post("/weather/1/altitude-points", json=POINT_PAYLOAD)

    with patch("app.main.fetch_open_meteo_current", return_value=MOCK_CURRENT_DATA):
        r = await client.get("/weather/1/current")

    assert r.status_code == 200
    body = r.json()
    assert body["temperature"] == pytest.approx(-5.0)
    assert body["resortId"] == 1
    assert body["condition"] == "Снег"


MOCK_DAILY = {
    "time": ["2026-01-15", "2026-01-16"],
    "temperature_2m_min": [-10.0, -8.0],
    "temperature_2m_max": [-2.0, -1.0],
    "wind_speed_10m_max": [5.0, 7.0],
    "precipitation_sum": [3.0, 0.0],
    "snowfall_sum": [12.5, 4.0],
    "weather_code": [71, 1],
}


async def test_daily_forecast_includes_snowfall(client: AsyncClient):
    await client.post("/weather/1/altitude-points", json=POINT_PAYLOAD)

    with patch("app.main.fetch_open_meteo_forecast", return_value={"daily": MOCK_DAILY}):
        r = await client.get("/weather/1/altitudes/daily", params={"days": 7})

    assert r.status_code == 200
    days = r.json()[0]["days"]
    assert len(days) == 2
    assert days[0]["snowfall"] == pytest.approx(12.5)
    assert days[1]["snowfall"] == pytest.approx(4.0)


async def test_daily_forecast_snowfall_defaults_to_zero(client: AsyncClient):
    await client.post("/weather/1/altitude-points", json=POINT_PAYLOAD)
    daily_without_snow = {k: v for k, v in MOCK_DAILY.items() if k != "snowfall_sum"}

    with patch("app.main.fetch_open_meteo_forecast", return_value={"daily": daily_without_snow}):
        r = await client.get("/weather/1/altitudes/daily", params={"days": 7})

    assert r.status_code == 200
    days = r.json()[0]["days"]
    assert len(days) == 2  # отсутствие snowfall_sum не должно обнулять прогноз
    assert all(d["snowfall"] == 0.0 for d in days)


async def test_weather_condition_from_code():
    from app.main import weather_condition_from_code
    assert weather_condition_from_code(0) == "Ясно"
    assert weather_condition_from_code(1) == "Преимущественно ясно"
    assert weather_condition_from_code(71) == "Снег"
    assert weather_condition_from_code(95) == "Гроза"
    assert weather_condition_from_code(999) == "Неизвестно"
    assert weather_condition_from_code(None) == "Неизвестно"


async def test_auxiliary_point_excluded_from_weather(client: AsyncClient):
    await client.post("/weather/1/altitude-points", json=POINT_PAYLOAD)
    await client.post(
        "/weather/1/altitude-points",
        json={**POINT_PAYLOAD, "name": "Вспомогательная", "is_primary": False},
    )

    # В списке точек — обе (карта использует все)
    pts = (await client.get("/weather/1/altitude-points")).json()
    assert len(pts) == 2
    assert {p["is_primary"] for p in pts} == {True, False}

    # В погоде — только основная
    with patch("app.main.fetch_open_meteo_current", return_value=MOCK_CURRENT_DATA):
        r = await client.get("/weather/1/altitudes/current")
    assert len(r.json()) == 1
    assert r.json()[0]["point_name"] == "Вершина"


# --- Snow alerts ---

class FakeExchange:
    def __init__(self):
        self.published = []

    async def publish(self, message, routing_key):
        self.published.append((routing_key, message.body))


def _daily_forecast(snows):
    return {
        "daily": {
            "time": ["2026-07-23", "2026-07-24", "2026-07-25"],
            "snowfall_sum": snows,
        }
    }


async def _setup_snow_alert(client, monkeypatch, *, snows, confirmed=True, threshold=10):
    """Готовит точку, моки internal-вызовов и фейковый exchange; возвращает его."""
    from app.main import app
    from app import snow_alerts

    await client.post("/weather/1/altitude-points", json=POINT_PAYLOAD)

    async def fake_subs(http):
        return [{"user_id": 42, "threshold_cm": threshold, "resort_ids": ["1"]}]

    async def fake_emails(http, ids):
        return {"42": {"email": "rider@example.com", "confirmed": confirmed}}

    async def fake_names(http):
        return {"1": "Шерегеш"}

    async def fake_meteo(cache_key, params):
        return _daily_forecast(snows)

    monkeypatch.setattr(snow_alerts, "_get_subscriptions", fake_subs)
    monkeypatch.setattr(snow_alerts, "_get_emails", fake_emails)
    monkeypatch.setattr(snow_alerts, "_get_resort_names", fake_names)
    monkeypatch.setattr("app.main._fetch_open_meteo", fake_meteo)

    fake = FakeExchange()
    app.state.mq_exchange = fake
    return fake


async def test_snow_alert_sends_email_and_dedupes(client: AsyncClient, monkeypatch):
    import json as jsonlib

    from app.main import app
    from app.snow_alerts import run_snow_alert_check

    fake = await _setup_snow_alert(client, monkeypatch, snows=[12.0, 0.0, 5.0])

    sent = await run_snow_alert_check(app)
    assert sent == 1
    assert len(fake.published) == 1
    routing_key, body = fake.published[0]
    assert routing_key == "email.send"
    payload = jsonlib.loads(body.decode())
    assert payload["to"] == "rider@example.com"
    assert "Шерегеш" in payload["subject"]
    assert "2026-07-23" in payload["text"]

    # Второй прогон — та же дата уже заалерчена
    sent = await run_snow_alert_check(app)
    assert sent == 0
    assert len(fake.published) == 1


async def test_snow_alert_skips_unconfirmed_email(client: AsyncClient, monkeypatch):
    from app.main import app
    from app.snow_alerts import run_snow_alert_check

    fake = await _setup_snow_alert(client, monkeypatch, snows=[12.0, 0.0, 5.0], confirmed=False)
    sent = await run_snow_alert_check(app)
    assert sent == 0
    assert fake.published == []


async def test_snow_alert_below_threshold(client: AsyncClient, monkeypatch):
    from app.main import app
    from app.snow_alerts import run_snow_alert_check

    fake = await _setup_snow_alert(client, monkeypatch, snows=[3.0, 0.0, 5.0])
    sent = await run_snow_alert_check(app)
    assert sent == 0
    assert fake.published == []


async def test_snow_alert_no_exchange_noop(client: AsyncClient):
    from app.main import app
    from app.snow_alerts import run_snow_alert_check

    app.state.mq_exchange = None
    assert await run_snow_alert_check(app) == 0


async def test_snow_alert_force_run_ignores_threshold_and_dedupe(client: AsyncClient, monkeypatch):
    # Летний прогноз: снега нет вообще
    await _setup_snow_alert(client, monkeypatch, snows=[0.0, 0.0, 0.0])

    r = await client.post("/internal/snow-alerts/run?force=true")
    assert r.status_code == 200
    assert r.json()["sent"] == 1

    # force игнорирует дедуп — второй прогон тоже шлёт
    r = await client.post("/internal/snow-alerts/run?force=true")
    assert r.json()["sent"] == 1

    # обычный прогон — без снега ничего не шлёт
    r = await client.post("/internal/snow-alerts/run")
    assert r.json()["sent"] == 0
