import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers


async def test_health(client: AsyncClient):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["service"] == "resort-service"


async def test_list_resorts_seeded(client: AsyncClient):
    r = await client.get("/resorts")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 3
    names = [d["name"] for d in data]
    assert "Роза Хутор" in names


async def test_list_resorts_pagination(client: AsyncClient):
    r = await client.get("/resorts", params={"limit": 1, "skip": 0})
    assert r.status_code == 200
    assert len(r.json()) == 1

    r2 = await client.get("/resorts", params={"limit": 1, "skip": 1})
    assert len(r2.json()) == 1
    assert r.json()[0]["id"] != r2.json()[0]["id"]


async def test_get_resort_found(client: AsyncClient):
    resorts = (await client.get("/resorts")).json()
    resort_id = resorts[0]["id"]

    r = await client.get(f"/resorts/{resort_id}")
    assert r.status_code == 200
    assert r.json()["id"] == resort_id


async def test_get_resort_not_found(client: AsyncClient):
    r = await client.get("/resorts/99999")
    assert r.status_code == 404


async def test_create_resort(client: AsyncClient):
    r = await client.post(
        "/resorts",
        json={
            "name": "Тест Курорт",
            "description": "Тестовый курорт",
            "rating": 4.0,
            "track_length_km": 50,
            "elevation_drop_m": 800,
            "trails_green": 5,
            "trails_blue": 10,
            "trails_red": 3,
            "trails_black": 2,
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Тест Курорт"
    assert body["id"] is not None


async def test_update_resort(client: AsyncClient):
    resorts = (await client.get("/resorts")).json()
    resort_id = resorts[0]["id"]

    r = await client.patch(f"/resorts/{resort_id}", json={"name": "Обновлённый Курорт"})
    assert r.status_code == 200
    assert r.json()["name"] == "Обновлённый Курорт"


async def test_update_resort_not_found(client: AsyncClient):
    r = await client.patch("/resorts/99999", json={"name": "X"})
    assert r.status_code == 404


async def test_delete_resort(client: AsyncClient):
    created = (
        await client.post("/resorts", json={"name": "Удалить"})
    ).json()
    resort_id = created["id"]

    r = await client.delete(f"/resorts/{resort_id}")
    assert r.status_code == 204

    r2 = await client.get(f"/resorts/{resort_id}")
    assert r2.status_code == 404


async def test_delete_resort_not_found(client: AsyncClient):
    r = await client.delete("/resorts/99999")
    assert r.status_code == 404


async def test_list_reviews_empty(client: AsyncClient):
    resorts = (await client.get("/resorts")).json()
    resort_id = resorts[0]["id"]

    r = await client.get(f"/resorts/{resort_id}/reviews")
    assert r.status_code == 200
    assert r.json() == []


async def test_create_review_unauthenticated(client: AsyncClient):
    resorts = (await client.get("/resorts")).json()
    resort_id = resorts[0]["id"]

    r = await client.post(
        f"/resorts/{resort_id}/reviews",
        json={"rating": 5, "review_text": "Отлично"},
    )
    assert r.status_code == 403


async def test_create_review_success(client: AsyncClient):
    resorts = (await client.get("/resorts")).json()
    resort_id = resorts[0]["id"]

    r = await client.post(
        f"/resorts/{resort_id}/reviews",
        json={"rating": 4, "review_text": "Хорошо"},
        headers=auth_headers(user_id=1),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["rating"] == 4
    assert body["user_id"] == 1
    assert body["resort_id"] == resort_id


async def test_create_review_invalid_rating(client: AsyncClient):
    resorts = (await client.get("/resorts")).json()
    resort_id = resorts[0]["id"]

    r = await client.post(
        f"/resorts/{resort_id}/reviews",
        json={"rating": 10},
        headers=auth_headers(user_id=1),
    )
    assert r.status_code == 422


async def test_upsert_review(client: AsyncClient):
    resorts = (await client.get("/resorts")).json()
    resort_id = resorts[0]["id"]
    headers = auth_headers(user_id=5)

    await client.post(
        f"/resorts/{resort_id}/reviews",
        json={"rating": 3, "review_text": "Средне"},
        headers=headers,
    )
    r = await client.post(
        f"/resorts/{resort_id}/reviews",
        json={"rating": 5, "review_text": "Переосмыслил"},
        headers=headers,
    )
    assert r.status_code == 201
    assert r.json()["rating"] == 5

    reviews = (await client.get(f"/resorts/{resort_id}/reviews")).json()
    user_reviews = [rv for rv in reviews if rv["user_id"] == 5]
    assert len(user_reviews) == 1


async def test_rating_reflects_reviews(client: AsyncClient):
    resorts = (await client.get("/resorts")).json()
    resort_id = resorts[0]["id"]

    await client.post(
        f"/resorts/{resort_id}/reviews",
        json={"rating": 2},
        headers=auth_headers(user_id=10),
    )
    await client.post(
        f"/resorts/{resort_id}/reviews",
        json={"rating": 4},
        headers=auth_headers(user_id=11),
    )

    r = await client.get(f"/resorts/{resort_id}")
    assert r.json()["rating"] == pytest.approx(3.0)
    assert r.json()["review_count"] == 2


async def test_update_review(client: AsyncClient):
    resorts = (await client.get("/resorts")).json()
    resort_id = resorts[0]["id"]
    headers = auth_headers(user_id=20)

    created = (
        await client.post(
            f"/resorts/{resort_id}/reviews",
            json={"rating": 3},
            headers=headers,
        )
    ).json()
    review_id = created["id"]

    r = await client.patch(
        f"/resorts/{resort_id}/reviews/{review_id}",
        json={"rating": 5, "review_text": "Изменил мнение"},
        headers=headers,
    )
    assert r.status_code == 200
    assert r.json()["rating"] == 5


async def test_update_review_other_user_forbidden(client: AsyncClient):
    resorts = (await client.get("/resorts")).json()
    resort_id = resorts[0]["id"]

    created = (
        await client.post(
            f"/resorts/{resort_id}/reviews",
            json={"rating": 3},
            headers=auth_headers(user_id=30),
        )
    ).json()

    r = await client.patch(
        f"/resorts/{resort_id}/reviews/{created['id']}",
        json={"rating": 1},
        headers=auth_headers(user_id=31),
    )
    assert r.status_code == 403


async def test_delete_review(client: AsyncClient):
    resorts = (await client.get("/resorts")).json()
    resort_id = resorts[0]["id"]
    headers = auth_headers(user_id=40)

    created = (
        await client.post(
            f"/resorts/{resort_id}/reviews",
            json={"rating": 3},
            headers=headers,
        )
    ).json()

    r = await client.delete(
        f"/resorts/{resort_id}/reviews/{created['id']}",
        headers=headers,
    )
    assert r.status_code == 204

    reviews = (await client.get(f"/resorts/{resort_id}/reviews")).json()
    assert not any(rv["id"] == created["id"] for rv in reviews)


async def test_delete_review_other_user_forbidden(client: AsyncClient):
    resorts = (await client.get("/resorts")).json()
    resort_id = resorts[0]["id"]

    created = (
        await client.post(
            f"/resorts/{resort_id}/reviews",
            json={"rating": 3},
            headers=auth_headers(user_id=50),
        )
    ).json()

    r = await client.delete(
        f"/resorts/{resort_id}/reviews/{created['id']}",
        headers=auth_headers(user_id=51),
    )
    assert r.status_code == 403
