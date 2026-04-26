from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException, Query
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, Base, engine
from app.models import Hotel
from app.schemas import HotelOut, HotelCreate, HotelUpdate


async def _add_column_if_missing(conn, table: str, column: str, col_type: str):
    try:
        await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
    except Exception:
        pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _add_column_if_missing(conn, "hotels", "image_url", "VARCHAR(500)")
        await _add_column_if_missing(conn, "hotels", "gallery_urls", "JSON")
        await _add_column_if_missing(conn, "hotels", "room_photo_urls", "JSON")
        await _add_column_if_missing(conn, "hotels", "price_from", "FLOAT")
        await _add_column_if_missing(conn, "hotels", "currency", "VARCHAR(10)")
        await _add_column_if_missing(conn, "hotels", "booking_url", "VARCHAR(500)")
    yield


app = FastAPI(title="Hotel Service", version="1.0.0", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "hotel-service"}


@app.get("/hotels", response_model=list[HotelOut])
async def list_hotels(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    resort_id: int | None = None,
    resort_ids: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = select(Hotel)
    ids = None
    if resort_ids:
        ids = [int(x.strip()) for x in resort_ids.split(",") if x.strip().isdigit()]
    elif resort_id is not None:
        ids = [resort_id]
    if ids:
        q = q.where(Hotel.resort_id.in_(ids))
    q = q.offset(skip).limit(limit)
    result = await db.execute(q)
    return [HotelOut.model_validate(h) for h in result.scalars().all()]


@app.get("/hotels/{hotel_id}", response_model=HotelOut)
async def get_hotel(hotel_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Hotel).where(Hotel.id == hotel_id))
    hotel = result.scalar_one_or_none()
    if not hotel:
        raise HTTPException(status_code=404, detail="Hotel not found")
    return HotelOut.model_validate(hotel)


@app.post("/hotels", response_model=HotelOut)
async def create_hotel(data: HotelCreate, db: AsyncSession = Depends(get_db)):
    hotel = Hotel(
        name=data.name,
        description=data.description,
        image_url=data.image_url,
        gallery_urls=data.gallery_urls,
        room_photo_urls=data.room_photo_urls,
        price_from=data.price_from,
        currency=data.currency,
        booking_url=data.booking_url,
        resort_id=data.resort_id,
        rating=data.rating,
    )
    db.add(hotel)
    await db.commit()
    await db.refresh(hotel)
    return HotelOut.model_validate(hotel)


@app.patch("/hotels/{hotel_id}", response_model=HotelOut)
async def update_hotel(hotel_id: int, data: HotelUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Hotel).where(Hotel.id == hotel_id))
    hotel = result.scalar_one_or_none()
    if not hotel:
        raise HTTPException(status_code=404, detail="Hotel not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(hotel, key, value)
    await db.commit()
    await db.refresh(hotel)
    return HotelOut.model_validate(hotel)


@app.delete("/hotels/{hotel_id}", status_code=204)
async def delete_hotel(hotel_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Hotel).where(Hotel.id == hotel_id))
    hotel = result.scalar_one_or_none()
    if not hotel:
        raise HTTPException(status_code=404, detail="Hotel not found")
    await db.delete(hotel)
    await db.commit()
