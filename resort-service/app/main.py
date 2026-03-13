from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Depends, HTTPException, Query, status
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user_id
from app.database import get_db, Base, engine
from app.models import Resort, ResortCategory, ResortReview
from app.schemas import (
    ResortOut,
    ResortCategoryOut,
    ResortUpdate,
    ResortCreate,
    ResortReviewOut,
    ResortReviewCreate,
    ResortReviewUpdate,
)

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for col, sql in [
            ("image_url", "ALTER TABLE resorts ADD COLUMN image_url VARCHAR(500)"),
            ("track_length_km", "ALTER TABLE resorts ADD COLUMN track_length_km FLOAT"),
            ("elevation_drop_m", "ALTER TABLE resorts ADD COLUMN elevation_drop_m INTEGER"),
            ("trails_green", "ALTER TABLE resorts ADD COLUMN trails_green INTEGER"),
            ("trails_blue", "ALTER TABLE resorts ADD COLUMN trails_blue INTEGER"),
            ("trails_red", "ALTER TABLE resorts ADD COLUMN trails_red INTEGER"),
            ("trails_black", "ALTER TABLE resorts ADD COLUMN trails_black INTEGER"),
            ("freeride_rating", "ALTER TABLE resorts ADD COLUMN freeride_rating FLOAT"),
            ("beginner_friendly", "ALTER TABLE resorts ADD COLUMN beginner_friendly INTEGER"),
        ]:
            try:
                await conn.execute(text(sql))
            except Exception:
                pass

    # Seed: 3 курорта (Роза Хутор, Красная Поляна, Газпром Поляна)
    from app.database import async_session
    async with async_session() as db:
        result = await db.execute(select(Resort))
        if not result.scalars().first():
            defaults = [
                {
                    "name": "Роза Хутор",
                    "description": "Крупнейший горнолыжный курорт Красной Поляны, олимпийский объект",
                    "rating": 4.8,
                    "image_url": "/static/resorts/1.jpg",
                    "track_length_km": 102,
                    "elevation_drop_m": 1534,
                    "trails_green": 15,
                    "trails_blue": 22,
                    "trails_red": 18,
                    "trails_black": 12,
                    "freeride_rating": 4.5,
                    "beginner_friendly": True,
                },
                {
                    "name": "Красная Поляна",
                    "description": "Горки Город — курорт в составе горного кластера Красной Поляны",
                    "rating": 4.6,
                    "image_url": "/static/resorts/2.jpg",
                    "track_length_km": 30,
                    "elevation_drop_m": 1350,
                    "trails_green": 8,
                    "trails_blue": 12,
                    "trails_red": 6,
                    "trails_black": 4,
                    "freeride_rating": 4.0,
                    "beginner_friendly": True,
                },
                {
                    "name": "Газпром Поляна",
                    "description": "Курорт «Газпром» — Лаура и Альпика, объединённые зоны катания",
                    "rating": 4.7,
                    "image_url": "/static/resorts/gazprom.jpg",
                    "track_length_km": 102,
                    "elevation_drop_m": 1698,
                    "trails_green": 12,
                    "trails_blue": 20,
                    "trails_red": 16,
                    "trails_black": 14,
                    "freeride_rating": 4.8,
                    "beginner_friendly": True,
                },
            ]
            for d in defaults:
                db.add(Resort(**d))
            await db.commit()
    yield


app = FastAPI(title="Resort Service", version="1.0.0", lifespan=lifespan)

# Локальные картинки: /static/resorts/1.jpg и т.д.
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "resort-service"}


async def _ensure_resort_exists(db: AsyncSession, resort_id: int) -> Resort:
    result = await db.execute(select(Resort).where(Resort.id == resort_id))
    resort = result.scalar_one_or_none()
    if not resort:
        raise HTTPException(status_code=404, detail="Resort not found")
    return resort


async def _review_stats_for_resort_ids(db: AsyncSession, resort_ids: list[int]) -> dict[int, tuple[float | None, int]]:
    if not resort_ids:
        return {}
    stats_query = (
        select(
            ResortReview.resort_id,
            func.avg(ResortReview.rating),
            func.count(ResortReview.id),
        )
        .where(ResortReview.resort_id.in_(resort_ids))
        .group_by(ResortReview.resort_id)
    )
    stats_result = await db.execute(stats_query)
    stats_map: dict[int, tuple[float | None, int]] = {}
    for resort_id, avg_rating, count_reviews in stats_result.all():
        stats_map[resort_id] = (float(avg_rating) if avg_rating is not None else None, int(count_reviews or 0))
    return stats_map


def _attach_rating_from_reviews(
    resort: Resort, review_stats: tuple[float | None, int] | None
) -> ResortOut:
    out = ResortOut.model_validate(resort)
    avg_rating = review_stats[0] if review_stats else None
    review_count = review_stats[1] if review_stats else 0
    out.rating = avg_rating if avg_rating is not None else resort.rating
    out.review_count = review_count
    return out


@app.get("/resorts", response_model=list[ResortOut])
async def list_resorts(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Resort).offset(skip).limit(limit))
    resorts = result.scalars().all()
    stats_map = await _review_stats_for_resort_ids(db, [r.id for r in resorts])
    return [_attach_rating_from_reviews(r, stats_map.get(r.id)) for r in resorts]


@app.get("/resorts/{resort_id}", response_model=ResortOut)
async def get_resort(resort_id: int, db: AsyncSession = Depends(get_db)):
    resort = await _ensure_resort_exists(db, resort_id)
    stats_map = await _review_stats_for_resort_ids(db, [resort_id])
    return _attach_rating_from_reviews(resort, stats_map.get(resort_id))


@app.patch("/resorts/{resort_id}", response_model=ResortOut)
async def update_resort(resort_id: int, data: ResortUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Resort).where(Resort.id == resort_id))
    resort = result.scalar_one_or_none()
    if not resort:
        raise HTTPException(status_code=404, detail="Resort not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(resort, k, v)
    await db.commit()
    await db.refresh(resort)
    return ResortOut.model_validate(resort)


@app.post("/resorts", response_model=ResortOut)
async def create_resort(data: ResortCreate, db: AsyncSession = Depends(get_db)):
    resort = Resort(
        name=data.name,
        description=data.description,
        image_url=data.image_url,
        rating=data.rating,
        track_length_km=data.track_length_km,
        elevation_drop_m=data.elevation_drop_m,
        trails_green=data.trails_green,
        trails_blue=data.trails_blue,
        trails_red=data.trails_red,
        trails_black=data.trails_black,
        freeride_rating=data.freeride_rating,
        beginner_friendly=data.beginner_friendly,
    )
    db.add(resort)
    await db.commit()
    await db.refresh(resort)
    return ResortOut.model_validate(resort)


@app.delete("/resorts/{resort_id}", status_code=204)
async def delete_resort(resort_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Resort).where(Resort.id == resort_id))
    resort = result.scalar_one_or_none()
    if not resort:
        raise HTTPException(status_code=404, detail="Resort not found")
    await db.delete(resort)
    await db.commit()


@app.get("/resorts/{resort_id}/reviews", response_model=list[ResortReviewOut])
async def list_resort_reviews(resort_id: int, db: AsyncSession = Depends(get_db)):
    await _ensure_resort_exists(db, resort_id)
    result = await db.execute(
        select(ResortReview)
        .where(ResortReview.resort_id == resort_id)
        .order_by(ResortReview.updated_at.desc(), ResortReview.id.desc())
    )
    return [ResortReviewOut.model_validate(r) for r in result.scalars().all()]


@app.post("/resorts/{resort_id}/reviews", response_model=ResortReviewOut, status_code=status.HTTP_201_CREATED)
async def create_or_update_resort_review(
    resort_id: int,
    data: ResortReviewCreate,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    await _ensure_resort_exists(db, resort_id)
    existing_result = await db.execute(
        select(ResortReview).where(
            ResortReview.resort_id == resort_id,
            ResortReview.user_id == user_id,
        )
    )
    review = existing_result.scalar_one_or_none()
    if review:
        review.rating = data.rating
        review.review_text = data.review_text
    else:
        review = ResortReview(
            resort_id=resort_id,
            user_id=user_id,
            rating=data.rating,
            review_text=data.review_text,
        )
        db.add(review)
    await db.commit()
    await db.refresh(review)
    return ResortReviewOut.model_validate(review)


@app.patch("/resorts/{resort_id}/reviews/{review_id}", response_model=ResortReviewOut)
async def update_resort_review(
    resort_id: int,
    review_id: int,
    data: ResortReviewUpdate,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    await _ensure_resort_exists(db, resort_id)
    result = await db.execute(
        select(ResortReview).where(
            ResortReview.id == review_id,
            ResortReview.resort_id == resort_id,
        )
    )
    review = result.scalar_one_or_none()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    if review.user_id != user_id:
        raise HTTPException(status_code=403, detail="You can edit only your own review")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(review, key, value)
    await db.commit()
    await db.refresh(review)
    return ResortReviewOut.model_validate(review)


@app.delete("/resorts/{resort_id}/reviews/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resort_review(
    resort_id: int,
    review_id: int,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    await _ensure_resort_exists(db, resort_id)
    result = await db.execute(
        select(ResortReview).where(
            ResortReview.id == review_id,
            ResortReview.resort_id == resort_id,
        )
    )
    review = result.scalar_one_or_none()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    if review.user_id != user_id:
        raise HTTPException(status_code=403, detail="You can delete only your own review")
    await db.delete(review)
    await db.commit()
