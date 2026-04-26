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

@app.get("/health")
async def health():
    return {"status": "ok", "service": "user-profile-service"}

@app.get("/users/me", response_model=UserProfile)
async def get_me(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Profile).where(Profile.user_id == user_id))
    profile = result.scalar_one_or_none()
    if not profile:
        return UserProfile(user_id=str(user_id))
    return UserProfile(
        user_id=str(profile.user_id),
        nickname=profile.nickname,
        level=profile.level,
        equipment_type=profile.equipment_type,
        favorite_resorts=profile.favorite_resorts or [],
        total_distance=profile.total_distance,
        total_descent=profile.total_descent,
    )

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

    await db.commit()
    await db.refresh(profile)
    return UserProfile(
        user_id=str(profile.user_id),
        nickname=profile.nickname,
        level=profile.level,
        equipment_type=profile.equipment_type,
        favorite_resorts=profile.favorite_resorts or [],
        total_distance=profile.total_distance,
        total_descent=profile.total_descent,
    )

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
    return UserProfile(
        user_id=str(profile.user_id),
        nickname=profile.nickname,
        level=profile.level,
        equipment_type=profile.equipment_type,
        favorite_resorts=profile.favorite_resorts or [],
        total_distance=profile.total_distance,
        total_descent=profile.total_descent,
    )
