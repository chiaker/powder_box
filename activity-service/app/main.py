from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user_id
from app.database import get_db, Base, engine
from app.models import Activity
from app.schemas import ActivityOut, ActivityCreate


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(title="Activity Service", version="1.0.0", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "activity-service"}


@app.get("/activities", response_model=list[ActivityOut])
async def list_activities(
    user_id: int | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    q = select(Activity)
    if user_id is not None:
        q = q.where(Activity.user_id == user_id)
    q = q.order_by(Activity.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(q)
    return [ActivityOut.model_validate(a) for a in result.scalars().all()]


@app.post("/activities", response_model=ActivityOut)
async def create_activity(
    data: ActivityCreate,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    activity = Activity(user_id=user_id, type=data.type, description=data.description)
    db.add(activity)
    await db.commit()
    await db.refresh(activity)
    return ActivityOut.model_validate(activity)


@app.get("/activities/{activity_id}", response_model=ActivityOut)
async def get_activity(activity_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Activity).where(Activity.id == activity_id))
    activity = result.scalar_one_or_none()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    return ActivityOut.model_validate(activity)
