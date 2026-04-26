from httpx import AsyncClient


HOTEL_PAYLOAD = {
    "name": "Горный отель",
    "description": "Уютный отель у склона",
    "price_from": 5000.0,
    "currency": "RUB",
    "resort_id": 1,
    "rating": 4.5,
}


async def test_health(client: AsyncClient):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["service"] == "hotel-service"


async def test_list_hotels_empty(client: AsyncClient):
    r = await client.get("/hotels")
    assert r.status_code == 200
    assert r.json() == []


async def test_create_hotel(client: AsyncClient):
    r = await client.post("/hotels", json=HOTEL_PAYLOAD)
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Горный отель"
    assert body["price_from"] == 5000.0
    assert body["resort_id"] == 1
    assert "id" in body


async def test_get_hotel_found(client: AsyncClient):
    created = (await client.post("/hotels", json=HOTEL_PAYLOAD)).json()

    r = await client.get(f"/hotels/{created['id']}")
    assert r.status_code == 200
    assert r.json()["id"] == created["id"]


async def test_get_hotel_not_found(client: AsyncClient):
    r = await client.get("/hotels/99999")
    assert r.status_code == 404


async def test_update_hotel(client: AsyncClient):
    created = (await client.post("/hotels", json=HOTEL_PAYLOAD)).json()

    r = await client.patch(
        f"/hotels/{created['id']}",
        json={"name": "Новое название", "price_from": 7000.0},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Новое название"
    assert body["price_from"] == 7000.0


async def test_update_hotel_not_found(client: AsyncClient):
    r = await client.patch("/hotels/99999", json={"name": "X"})
    assert r.status_code == 404


async def test_delete_hotel(client: AsyncClient):
    created = (await client.post("/hotels", json=HOTEL_PAYLOAD)).json()

    r = await client.delete(f"/hotels/{created['id']}")
    assert r.status_code == 204

    r2 = await client.get(f"/hotels/{created['id']}")
    assert r2.status_code == 404


async def test_delete_hotel_not_found(client: AsyncClient):
    r = await client.delete("/hotels/99999")
    assert r.status_code == 404


async def test_list_hotels_filter_by_resort_id(client: AsyncClient):
    await client.post("/hotels", json={**HOTEL_PAYLOAD, "resort_id": 1})
    await client.post("/hotels", json={**HOTEL_PAYLOAD, "resort_id": 1, "name": "Hotel 2"})
    await client.post("/hotels", json={**HOTEL_PAYLOAD, "resort_id": 2, "name": "Hotel 3"})

    r = await client.get("/hotels", params={"resort_id": 1})
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 2
    assert all(h["resort_id"] == 1 for h in data)


async def test_list_hotels_filter_by_resort_ids(client: AsyncClient):
    await client.post("/hotels", json={**HOTEL_PAYLOAD, "resort_id": 10})
    await client.post("/hotels", json={**HOTEL_PAYLOAD, "resort_id": 20, "name": "H2"})
    await client.post("/hotels", json={**HOTEL_PAYLOAD, "resort_id": 30, "name": "H3"})

    r = await client.get("/hotels", params={"resort_ids": "10,20"})
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 2
    resort_ids = {h["resort_id"] for h in data}
    assert resort_ids == {10, 20}


async def test_create_hotel_with_gallery(client: AsyncClient):
    r = await client.post(
        "/hotels",
        json={
            **HOTEL_PAYLOAD,
            "gallery_urls": ["/img/1.jpg", "/img/2.jpg"],
            "room_photo_urls": ["/room/1.jpg"],
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body["gallery_urls"]) == 2
    assert body["room_photo_urls"] == ["/room/1.jpg"]


async def test_list_hotels_pagination(client: AsyncClient):
    for i in range(5):
        await client.post("/hotels", json={**HOTEL_PAYLOAD, "name": f"Hotel {i}"})

    r = await client.get("/hotels", params={"limit": 2, "skip": 0})
    assert len(r.json()) == 2

    r2 = await client.get("/hotels", params={"limit": 2, "skip": 2})
    assert len(r2.json()) == 2
