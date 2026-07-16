from httpx import AsyncClient


LESSON_PAYLOAD = {
    "title": "Основы карвинга",
    "category": "ski",
    "lesson_url": "https://youtube.com/watch?v=test123",
}


async def test_health(client: AsyncClient):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["service"] == "lesson-service"


async def test_list_lessons_seeded(client: AsyncClient):
    r = await client.get("/lessons")
    assert r.status_code == 200
    data = r.json()
    # lifespan seeds 3 lessons when DB is empty
    assert len(data) == 3


async def test_list_lessons_filter_by_category(client: AsyncClient):
    r = await client.get("/lessons", params={"category": "snowboard"})
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["category"] == "snowboard"


async def test_list_lessons_filter_no_match(client: AsyncClient):
    r = await client.get("/lessons", params={"category": "freestyle"})
    assert r.status_code == 200
    assert r.json() == []


async def test_get_lesson_found(client: AsyncClient):
    lessons = (await client.get("/lessons")).json()
    lesson_id = lessons[0]["id"]

    r = await client.get(f"/lessons/{lesson_id}")
    assert r.status_code == 200
    assert r.json()["id"] == lesson_id


async def test_get_lesson_not_found(client: AsyncClient):
    r = await client.get("/lessons/99999")
    assert r.status_code == 404


async def test_create_lesson(client: AsyncClient):
    r = await client.post("/lessons", json=LESSON_PAYLOAD)
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "Основы карвинга"
    assert body["category"] == "ski"
    assert body["lesson_url"] == LESSON_PAYLOAD["lesson_url"]
    assert "id" in body


async def test_create_lesson_with_instructor(client: AsyncClient):
    r = await client.post(
        "/lessons",
        json={**LESSON_PAYLOAD, "instructor_id": 42},
    )
    assert r.status_code == 200
    assert r.json()["instructor_id"] == 42


async def test_update_lesson(client: AsyncClient):
    created = (await client.post("/lessons", json=LESSON_PAYLOAD)).json()

    r = await client.patch(
        f"/lessons/{created['id']}",
        json={"title": "Продвинутый карвинг", "category": "freestyle"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "Продвинутый карвинг"
    assert body["category"] == "freestyle"


async def test_update_lesson_not_found(client: AsyncClient):
    r = await client.patch("/lessons/99999", json={"title": "X"})
    assert r.status_code == 404


async def test_delete_lesson(client: AsyncClient):
    created = (await client.post("/lessons", json=LESSON_PAYLOAD)).json()

    r = await client.delete(f"/lessons/{created['id']}")
    assert r.status_code == 204

    r2 = await client.get(f"/lessons/{created['id']}")
    assert r2.status_code == 404


async def test_delete_lesson_not_found(client: AsyncClient):
    r = await client.delete("/lessons/99999")
    assert r.status_code == 404


async def test_preview_url_none_for_non_rutube(client: AsyncClient):
    created = (await client.post("/lessons", json=LESSON_PAYLOAD)).json()

    r = await client.get(f"/lessons/{created['id']}")
    assert r.status_code == 200
    # YouTube URL → no Rutube preview
    assert r.json()["preview_url"] is None


async def test_list_lessons_pagination(client: AsyncClient):
    for i in range(3):
        await client.post(
            "/lessons",
            json={"title": f"Урок {i}", "category": "ski", "lesson_url": f"https://youtube.com/watch?v={i}"},
        )

    r = await client.get("/lessons", params={"limit": 2, "skip": 0})
    assert len(r.json()) == 2


# --- Level field ---

async def test_create_lesson_with_level(client: AsyncClient):
    r = await client.post("/lessons", json={**LESSON_PAYLOAD, "level": "beginner"})
    assert r.status_code == 200
    assert r.json()["level"] == "beginner"


async def test_create_lesson_invalid_level(client: AsyncClient):
    r = await client.post("/lessons", json={**LESSON_PAYLOAD, "level": "expert"})
    assert r.status_code == 422


async def test_list_lessons_filter_by_level(client: AsyncClient):
    await client.post("/lessons", json={**LESSON_PAYLOAD, "title": "Про мод", "level": "advanced"})

    r = await client.get("/lessons", params={"level": "advanced"})
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["level"] == "advanced"


async def test_update_lesson_level(client: AsyncClient):
    created = (await client.post("/lessons", json=LESSON_PAYLOAD)).json()
    assert created["level"] is None

    r = await client.patch(f"/lessons/{created['id']}", json={"level": "intermediate"})
    assert r.status_code == 200
    assert r.json()["level"] == "intermediate"


# --- Rutube preview cache ---

async def test_preview_fetched_once_and_cached(client: AsyncClient):
    from unittest.mock import patch

    rutube_lesson = {
        "title": "Урок с Rutube",
        "category": "ski",
        "lesson_url": "https://rutube.ru/video/abc123/",
    }
    with patch("app.main._fetch_rutube_preview_sync", return_value="https://img.example/p.jpg") as mock_fetch:
        created = (await client.post("/lessons", json=rutube_lesson)).json()
        assert created["preview_url"] == "https://img.example/p.jpg"

        r = await client.get(f"/lessons/{created['id']}")
        assert r.json()["preview_url"] == "https://img.example/p.jpg"

    assert mock_fetch.call_count == 1  # второй запрос взял превью из кэша
