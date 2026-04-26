import io
import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers


async def test_health(client: AsyncClient):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["service"] == "equipment-service"


# --- Categories ---

async def test_list_categories_empty(client: AsyncClient):
    r = await client.get("/equipment/categories")
    assert r.status_code == 200
    assert r.json() == []


async def test_create_category(client: AsyncClient):
    r = await client.post("/equipment/categories", json={"name": "Лыжи"})
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Лыжи"
    assert "id" in body


async def test_list_categories_after_create(client: AsyncClient):
    await client.post("/equipment/categories", json={"name": "Сноуборды"})
    await client.post("/equipment/categories", json={"name": "Ботинки"})

    r = await client.get("/equipment/categories")
    assert r.status_code == 200
    assert len(r.json()) == 2


# --- Items ---

async def test_list_items_empty(client: AsyncClient):
    r = await client.get("/equipment/items")
    assert r.status_code == 200
    assert r.json() == []


async def test_create_item_unauthenticated(client: AsyncClient):
    r = await client.post(
        "/equipment/items",
        json={"name": "Лыжи Atomic", "price": 5000.0},
    )
    assert r.status_code == 403


async def test_create_item_success(client: AsyncClient):
    r = await client.post(
        "/equipment/items",
        json={
            "name": "Лыжи Atomic",
            "description": "Отличные лыжи",
            "price": 5000.0,
            "price_per_day": 800.0,
            "condition": "good",
            "equipment_type": "ski",
        },
        headers=auth_headers(user_id=1),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Лыжи Atomic"
    assert body["owner_id"] == 1
    assert body["equipment_type"] == "ski"


async def test_get_item_found(client: AsyncClient):
    created = (
        await client.post(
            "/equipment/items",
            json={"name": "Шлем", "price": 2000.0},
            headers=auth_headers(user_id=1),
        )
    ).json()

    r = await client.get(f"/equipment/items/{created['id']}")
    assert r.status_code == 200
    assert r.json()["id"] == created["id"]


async def test_get_item_not_found(client: AsyncClient):
    r = await client.get("/equipment/items/99999")
    assert r.status_code == 404


async def test_list_items_filter_by_owner(client: AsyncClient):
    await client.post(
        "/equipment/items", json={"name": "Item A"}, headers=auth_headers(user_id=1)
    )
    await client.post(
        "/equipment/items", json={"name": "Item B"}, headers=auth_headers(user_id=2)
    )

    r = await client.get("/equipment/items", params={"owner_id": 1})
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["owner_id"] == 1


async def test_list_items_filter_by_type(client: AsyncClient):
    await client.post(
        "/equipment/items",
        json={"name": "Лыжи", "equipment_type": "ski"},
        headers=auth_headers(user_id=1),
    )
    await client.post(
        "/equipment/items",
        json={"name": "Сноуборд", "equipment_type": "snowboard"},
        headers=auth_headers(user_id=1),
    )

    r = await client.get("/equipment/items", params={"equipment_type": "ski"})
    assert all(item["equipment_type"] == "ski" for item in r.json())


async def test_update_item_owner(client: AsyncClient):
    created = (
        await client.post(
            "/equipment/items",
            json={"name": "Old Name"},
            headers=auth_headers(user_id=1),
        )
    ).json()

    r = await client.patch(
        f"/equipment/items/{created['id']}",
        json={"name": "New Name"},
        headers=auth_headers(user_id=1),
    )
    assert r.status_code == 200
    assert r.json()["name"] == "New Name"


async def test_update_item_not_owner_forbidden(client: AsyncClient):
    created = (
        await client.post(
            "/equipment/items",
            json={"name": "My Item"},
            headers=auth_headers(user_id=1),
        )
    ).json()

    r = await client.patch(
        f"/equipment/items/{created['id']}",
        json={"name": "Stolen Name"},
        headers=auth_headers(user_id=2),
    )
    assert r.status_code == 403


async def test_update_item_admin_allowed(client: AsyncClient):
    created = (
        await client.post(
            "/equipment/items",
            json={"name": "Admin Target"},
            headers=auth_headers(user_id=1),
        )
    ).json()

    r = await client.patch(
        f"/equipment/items/{created['id']}",
        json={"name": "Admin Changed"},
        headers={**auth_headers(user_id=99), "X-Is-Admin": "true"},
    )
    assert r.status_code == 200
    assert r.json()["name"] == "Admin Changed"


async def test_update_item_not_found(client: AsyncClient):
    r = await client.patch(
        "/equipment/items/99999",
        json={"name": "X"},
        headers=auth_headers(user_id=1),
    )
    assert r.status_code == 404


async def test_delete_item_owner(client: AsyncClient):
    created = (
        await client.post(
            "/equipment/items",
            json={"name": "Delete Me"},
            headers=auth_headers(user_id=1),
        )
    ).json()

    r = await client.delete(
        f"/equipment/items/{created['id']}",
        headers=auth_headers(user_id=1),
    )
    assert r.status_code == 204

    r2 = await client.get(f"/equipment/items/{created['id']}")
    assert r2.status_code == 404


async def test_delete_item_not_owner_forbidden(client: AsyncClient):
    created = (
        await client.post(
            "/equipment/items",
            json={"name": "Protected Item"},
            headers=auth_headers(user_id=1),
        )
    ).json()

    r = await client.delete(
        f"/equipment/items/{created['id']}",
        headers=auth_headers(user_id=2),
    )
    assert r.status_code == 403


async def test_upload_image_not_authenticated(client: AsyncClient):
    r = await client.post(
        "/equipment/upload",
        files={"file": ("test.jpg", b"fake image data", "image/jpeg")},
    )
    assert r.status_code == 403


async def test_upload_image_success(client: AsyncClient):
    r = await client.post(
        "/equipment/upload",
        files={"file": ("photo.jpg", b"\xff\xd8\xff" + b"x" * 100, "image/jpeg")},
        headers=auth_headers(user_id=1),
    )
    assert r.status_code == 200
    assert "image_url" in r.json()


async def test_upload_non_image_rejected(client: AsyncClient):
    r = await client.post(
        "/equipment/upload",
        files={"file": ("doc.pdf", b"pdf content", "application/pdf")},
        headers=auth_headers(user_id=1),
    )
    assert r.status_code == 400
    assert "Only images" in r.json()["detail"]


async def test_upload_too_large_rejected(client: AsyncClient):
    big_file = b"x" * (5 * 1024 * 1024 + 1)
    r = await client.post(
        "/equipment/upload",
        files={"file": ("big.jpg", big_file, "image/jpeg")},
        headers=auth_headers(user_id=1),
    )
    assert r.status_code == 400
    assert "too large" in r.json()["detail"]
