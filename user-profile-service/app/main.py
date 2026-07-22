import os
import json
import asyncio
import aio_pika
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user_id
from app.database import get_db, Base, engine, async_session
from app.models import Profile
from app.observability import setup_observability
from app.schemas import UserProfile, UserProfileUpdate

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")
EXCHANGE = os.getenv("EVENTS_EXCHANGE", "powderbox.events")

async def _add_column(conn, table: str, column: str, col_type: str):
    try:
        await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
    except Exception:
        pass

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _add_column(conn, "profiles", "total_distance", "FLOAT DEFAULT 0.0")
        await _add_column(conn, "profiles", "total_descent", "FLOAT DEFAULT 0.0")
        await _add_column(conn, "profiles", "snow_alerts_enabled", "BOOLEAN NOT NULL DEFAULT 0")
        await _add_column(conn, "profiles", "snow_alert_threshold_cm", "INTEGER NOT NULL DEFAULT 10")
        
    try:
        conn = await aio_pika.connect_robust(RABBITMQ_URL)
        ch = await conn.channel()
        exchange = await ch.declare_exchange(EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True)
        
        queue = await ch.declare_queue("user-profile-service.stats", durable=True)
        await queue.bind(exchange, routing_key="stats.track.processed")
        
        async def worker():
            async with queue.iterator() as q:
                async for msg in q:
                    async with msg.process():
                        try:
                            data = json.loads(msg.body.decode())
                            user_id = data.get("user_id")
                            distance = data.get("distance", 0.0)
                            descent = data.get("total_descent", 0.0)
                            
                            if user_id:
                                async with async_session() as db:
                                    result = await db.execute(select(Profile).where(Profile.user_id == user_id))
                                    profile = result.scalar_one_or_none()
                                    if not profile:
                                        profile = Profile(user_id=user_id)
                                        db.add(profile)
                                    
                                    profile.total_distance += distance
                                    profile.total_descent += descent
                                    await db.commit()
                        except Exception as e:
                            print(f"Error processing message: {e}")

        task = asyncio.create_task(worker())
        app.state._mq = (conn, task)
    except Exception as e:
        print(f"Failed to start RabbitMQ consumer: {e}")
        app.state._mq = None
        
    yield
    
    if app.state._mq:
        conn, task = app.state._mq
        task.cancel()
        await conn.close()

app = FastAPI(title="User Profile Service", version="1.0.0", lifespan=lifespan)
setup_observability(app, service_name="user-profile-service")

@app.get("/health")
async def health():
    return {"status": "ok", "service": "user-profile-service"}

def profile_out(profile: Profile) -> UserProfile:
    return UserProfile(
        user_id=str(profile.user_id),
        nickname=profile.nickname,
        level=profile.level,
        equipment_type=profile.equipment_type,
        favorite_resorts=profile.favorite_resorts or [],
        total_distance=profile.total_distance,
        total_descent=profile.total_descent,
        snow_alerts_enabled=profile.snow_alerts_enabled,
        snow_alert_threshold_cm=profile.snow_alert_threshold_cm,
    )

@app.get("/users/me", response_model=UserProfile)
async def get_me(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Profile).where(Profile.user_id == user_id))
    profile = result.scalar_one_or_none()
    if not profile:
        return UserProfile(user_id=str(user_id))
    return profile_out(profile)

@app.put("/users/me", response_model=UserProfile)
async def update_me(
    data: UserProfileUpdate,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Profile).where(Profile.user_id == user_id))
    profile = result.scalar_one_or_none()
    if not profile:
        profile = Profile(user_id=user_id)
        db.add(profile)
        await db.flush()

    if data.nickname is not None:
        profile.nickname = data.nickname
    if data.level is not None:
        profile.level = data.level
    if data.equipment_type is not None:
        profile.equipment_type = data.equipment_type
    if data.favorite_resorts is not None:
        profile.favorite_resorts = data.favorite_resorts
    if data.snow_alerts_enabled is not None:
        profile.snow_alerts_enabled = data.snow_alerts_enabled
    if data.snow_alert_threshold_cm is not None:
        profile.snow_alert_threshold_cm = data.snow_alert_threshold_cm

    await db.commit()
    await db.refresh(profile)
    return profile_out(profile)

@app.get("/users/{user_id}", response_model=UserProfile)
async def get_user(
    user_id: str,
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    try:
        uid = int(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user id")
    result = await db.execute(select(Profile).where(Profile.user_id == uid))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile_out(profile)


# Внутренний эндпоинт для джоба снежных алертов (weather-service).
# Через gateway недостижим: /internal нет в PATH_TO_SERVICE.
@app.get("/internal/snow-alert-subscriptions")
async def snow_alert_subscriptions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Profile).where(Profile.snow_alerts_enabled.is_(True)))
    return [
        {
            "user_id": p.user_id,
            "threshold_cm": p.snow_alert_threshold_cm,
            "resort_ids": p.favorite_resorts or [],
        }
        for p in result.scalars().all()
        if p.favorite_resorts
    ]
