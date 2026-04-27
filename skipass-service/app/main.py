from contextlib import asynccontextmanager
from datetime import date

from fastapi import FastAPI, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, Base, engine
from app.models import SkipassTariff
from app.schemas import (
    PriceResponse,
    SkipassTariffCreate,
    SkipassTariffOut,
    SkipassTariffUpdate,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(title="Skipass Service", version="1.0.0", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "skipass-service"}


@app.get("/skipasses", response_model=list[SkipassTariffOut])
async def list_tariffs(
    resort_id: int | None = None,
    age_category: str | None = None,
    access_type: str | None = None,
    season_date: date | None = None,
    is_fast_track: bool | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    q = select(SkipassTariff)
    if resort_id is not None:
        q = q.where(SkipassTariff.resort_id == resort_id)
    if age_category is not None:
        q = q.where(SkipassTariff.age_category == age_category)
    if access_type is not None:
        q = q.where(SkipassTariff.access_type == access_type)
    if is_fast_track is not None:
        q = q.where(SkipassTariff.is_fast_track == is_fast_track)
    if season_date is not None:
        q = q.where(SkipassTariff.season_start <= season_date, SkipassTariff.season_end >= season_date)
    q = q.offset(skip).limit(limit)
    result = await db.execute(q)
    return [SkipassTariffOut.model_validate(t) for t in result.scalars().all()]


@app.get("/skipasses/{tariff_id}", response_model=SkipassTariffOut)
async def get_tariff(tariff_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SkipassTariff).where(SkipassTariff.id == tariff_id))
    tariff = result.scalar_one_or_none()
    if not tariff:
        raise HTTPException(status_code=404, detail="Tariff not found")
    return SkipassTariffOut.model_validate(tariff)


@app.post("/skipasses/resort/{resort_id}", response_model=SkipassTariffOut, status_code=201)
async def create_tariff(resort_id: int, data: SkipassTariffCreate, db: AsyncSession = Depends(get_db)):
    if data.season_start > data.season_end:
        raise HTTPException(status_code=400, detail="season_start must be <= season_end")
    tariff = SkipassTariff(
        resort_id=resort_id,
        season_name=data.season_name,
        season_start=data.season_start,
        season_end=data.season_end,
        age_category=data.age_category,
        access_type=data.access_type,
        duration_days=data.duration_days,
        is_fast_track=data.is_fast_track,
        price=data.price,
        currency=data.currency,
        is_active=data.is_active,
    )
    db.add(tariff)
    await db.commit()
    await db.refresh(tariff)
    return SkipassTariffOut.model_validate(tariff)


@app.patch("/skipasses/{tariff_id}", response_model=SkipassTariffOut)
async def update_tariff(tariff_id: int, data: SkipassTariffUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SkipassTariff).where(SkipassTariff.id == tariff_id))
    tariff = result.scalar_one_or_none()
    if not tariff:
        raise HTTPException(status_code=404, detail="Tariff not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(tariff, key, value)
    if tariff.season_start > tariff.season_end:
        raise HTTPException(status_code=400, detail="season_start must be <= season_end")
    await db.commit()
    await db.refresh(tariff)
    return SkipassTariffOut.model_validate(tariff)


@app.delete("/skipasses/{tariff_id}", status_code=204)
async def delete_tariff(tariff_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SkipassTariff).where(SkipassTariff.id == tariff_id))
    tariff = result.scalar_one_or_none()
    if not tariff:
        raise HTTPException(status_code=404, detail="Tariff not found")
    await db.delete(tariff)
    await db.commit()


@app.get("/skipasses/resort/{resort_id}/price", response_model=PriceResponse)
async def get_resort_price(
    resort_id: int,
    duration_days: int = Query(..., ge=1),
    age_group: str = Query(..., pattern="^(child|teen|adult|senior)$"),
    time_type: str = Query(..., pattern="^(day|evening|full)$"),
    season_date: date | None = None,
    fast_track: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    target_date = season_date or date.today()
    result = await db.execute(
        select(SkipassTariff).where(
            SkipassTariff.resort_id == resort_id,
            SkipassTariff.duration_days == duration_days,
            SkipassTariff.age_category == age_group,
            SkipassTariff.access_type == time_type,
            SkipassTariff.is_fast_track == fast_track,
            SkipassTariff.is_active.is_(True),
            SkipassTariff.season_start <= target_date,
            SkipassTariff.season_end >= target_date,
        )
        .limit(1)
    )
    tariff = result.scalar_one_or_none()
    if not tariff:
        return PriceResponse(price=0.0, currency="RUB")
    return PriceResponse(
        price=round(float(tariff.price), 2),
        currency=tariff.currency,
        tariff_id=tariff.id,
        season_name=tariff.season_name,
    )
