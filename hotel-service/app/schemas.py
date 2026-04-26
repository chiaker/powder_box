from pydantic import BaseModel, ConfigDict


class HotelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: str | None
    image_url: str | None
    gallery_urls: list[str] | None
    room_photo_urls: list[str] | None
    price_from: float | None
    currency: str | None
    booking_url: str | None
    resort_id: int | None
    rating: float | None


class HotelCreate(BaseModel):
    name: str
    description: str | None = None
    image_url: str | None = None
    gallery_urls: list[str] | None = None
    room_photo_urls: list[str] | None = None
    price_from: float | None = None
    currency: str | None = None
    booking_url: str | None = None
    resort_id: int | None = None
    rating: float | None = None


class HotelUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    image_url: str | None = None
    gallery_urls: list[str] | None = None
    room_photo_urls: list[str] | None = None
    price_from: float | None = None
    currency: str | None = None
    booking_url: str | None = None
    resort_id: int | None = None
    rating: float | None = None
