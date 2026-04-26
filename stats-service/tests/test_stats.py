import pytest
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient

from tests.conftest import auth_headers


def make_track_payload(
    user_id: int = 1,
    start_offset_minutes: int = 0,
    duration_minutes: int = 60,
):
    started_at = datetime(2026, 1, 15, 10, 0, 0, tzinfo=timezone.utc) + timedelta(
        minutes=start_offset_minutes
    )
    ended_at = started_at + timedelta(minutes=duration_minutes)
    return {
        "started_at": started_at.isoformat(),
        "ended_at": ended_at.isoformat(),
        "points": [
            {
                "lat": 43.6737,
                "lng": 40.2678,
                "alt": 2200.0,
                "speed": 15.0,
                "timestamp": started_at.isoformat(),
            },
            {
                "lat": 43.6720,
                "lng": 40.2690,
                "alt": 2100.0,
                "speed": 20.0,
                "timestamp": (started_at + timedelta(minutes=30)).isoformat(),
            },
            {
                "lat": 43.6700,
                "lng": 40.2710,
                "alt": 2000.0,
                "speed": 25.0,
                "timestamp": ended_at.isoformat(),
            },
        ],
    }


async def test_health(client: AsyncClient):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["service"] == "stats-service"


async def test_upload_track_unauthenticated(client: AsyncClient):
    r = await client.post("/stats/tracks", json=make_track_payload())
    assert r.status_code in (401, 403)


async def test_upload_track_success(client: AsyncClient):
    r = await client.post(
        "/stats/tracks",
        json=make_track_payload(),
        headers=auth_headers(user_id=1),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["user_id"] == 1
    assert body["distance"] > 0
    assert body["max_speed"] >= 0
    assert body["avg_speed"] >= 0
    assert body["total_descent"] > 0
    assert body["total_ascent"] == pytest.approx(0.0)
    assert len(body["points"]) == 3
    assert "id" in body


async def test_upload_track_empty_points(client: AsyncClient):
    started_at = datetime(2026, 1, 15, 10, 0, 0, tzinfo=timezone.utc)
    r = await client.post(
        "/stats/tracks",
        json={
            "started_at": started_at.isoformat(),
            "ended_at": (started_at + timedelta(hours=1)).isoformat(),
            "points": [],
        },
        headers=auth_headers(user_id=1),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["distance"] == 0.0
    assert body["max_speed"] == 0.0


async def test_get_tracks_empty(client: AsyncClient):
    r = await client.get("/stats/tracks", headers=auth_headers(user_id=1))
    assert r.status_code == 200
    assert r.json() == []


async def test_get_tracks_unauthenticated(client: AsyncClient):
    r = await client.get("/stats/tracks")
    assert r.status_code in (401, 403)


async def test_get_tracks_returns_own_tracks(client: AsyncClient):
    await client.post(
        "/stats/tracks", json=make_track_payload(), headers=auth_headers(user_id=1)
    )
    await client.post(
        "/stats/tracks", json=make_track_payload(start_offset_minutes=120), headers=auth_headers(user_id=1)
    )
    await client.post(
        "/stats/tracks", json=make_track_payload(), headers=auth_headers(user_id=2)
    )

    r = await client.get("/stats/tracks", headers=auth_headers(user_id=1))
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 2
    assert all(t["user_id"] == 1 for t in data)


async def test_get_stats_empty(client: AsyncClient):
    r = await client.get("/stats/me", headers=auth_headers(user_id=1))
    assert r.status_code == 200
    body = r.json()
    assert body["total_tracks"] == 0
    assert body["total_distance"] == 0.0
    assert body["total_descent"] == 0.0
    assert body["max_speed"] == 0.0


async def test_get_stats_aggregates_tracks(client: AsyncClient):
    await client.post(
        "/stats/tracks", json=make_track_payload(), headers=auth_headers(user_id=5)
    )
    await client.post(
        "/stats/tracks",
        json=make_track_payload(start_offset_minutes=120),
        headers=auth_headers(user_id=5),
    )

    r = await client.get("/stats/me", headers=auth_headers(user_id=5))
    assert r.status_code == 200
    body = r.json()
    assert body["total_tracks"] == 2
    assert body["total_distance"] > 0
    assert body["total_descent"] > 0


async def test_get_stats_unauthenticated(client: AsyncClient):
    r = await client.get("/stats/me")
    assert r.status_code in (401, 403)


async def test_track_statistics_calculation(client: AsyncClient):
    # Upload a track with known geometry to verify calculations
    started_at = datetime(2026, 1, 15, 10, 0, 0, tzinfo=timezone.utc)
    ended_at = started_at + timedelta(hours=1)
    r = await client.post(
        "/stats/tracks",
        json={
            "started_at": started_at.isoformat(),
            "ended_at": ended_at.isoformat(),
            "points": [
                {
                    "lat": 43.6737,
                    "lng": 40.2678,
                    "alt": 2200.0,
                    "speed": 10.0,
                    "timestamp": started_at.isoformat(),
                },
                {
                    "lat": 43.6737,
                    "lng": 40.2678,
                    "alt": 2100.0,
                    "speed": 30.0,  # 30 m/s = 108 km/h
                    "timestamp": ended_at.isoformat(),
                },
            ],
        },
        headers=auth_headers(user_id=1),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total_descent"] == pytest.approx(100.0)
    assert body["total_ascent"] == pytest.approx(0.0)
    assert body["max_speed"] == pytest.approx(108.0)
