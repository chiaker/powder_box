import os
import json
import math
from contextlib import asynccontextmanager
import aio_pika
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, Base, engine
from app.models import Track
from app.schemas import TrackCreate, TrackOut, UserStats
from app.auth import get_current_user_id

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")
EXCHANGE = os.getenv("EVENTS_EXCHANGE", "powderbox.events")

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    try:
        conn = await aio_pika.connect_robust(RABBITMQ_URL)
        ch = await conn.channel()
        exchange = await ch.declare_exchange(EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True)
        app.state.mq_conn = conn
        app.state.mq_exchange = exchange
    except Exception as e:
        print(f"RabbitMQ connection failed: {e}")
        app.state.mq_conn = None
        app.state.mq_exchange = None
        
    yield
    
    if app.state.mq_conn:
        await app.state.mq_conn.close()

app = FastAPI(title="Stats Service", version="1.0.0", lifespan=lifespan)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "stats-service"}

def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371.0 # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def process_track(data: TrackCreate) -> dict:
    if not data.points:
        return {"distance": 0, "max_speed": 0, "avg_speed": 0, "descent": 0, "ascent": 0}
        
    distance = 0.0
    descent = 0.0
    ascent = 0.0
    max_speed_kmh = 0.0
    
    points = sorted(data.points, key=lambda p: p.timestamp)
    
    for i in range(1, len(points)):
        p1 = points[i-1]
        p2 = points[i]
        
        d = haversine_distance(p1.lat, p1.lng, p2.lat, p2.lng)
        distance += d
        
        alt_diff = p2.alt - p1.alt
        if alt_diff < 0:
            descent += abs(alt_diff)
        else:
            ascent += alt_diff
            
        speed_kmh = p2.speed * 3.6
        if speed_kmh > max_speed_kmh:
            max_speed_kmh = speed_kmh
            
    total_time_hours = (data.ended_at - data.started_at).total_seconds() / 3600.0
    avg_speed_kmh = distance / total_time_hours if total_time_hours > 0 else 0
    
    return {
        "distance": round(distance, 2),
        "max_speed": round(max_speed_kmh, 2),
        "avg_speed": round(avg_speed_kmh, 2),
        "descent": round(descent, 2),
        "ascent": round(ascent, 2)
    }

@app.post("/stats/tracks", response_model=TrackOut)
async def upload_track(
    data: TrackCreate,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    stats = process_track(data)
    
    points_dict = [p.model_dump() for p in data.points]
    for p in points_dict:
        p["timestamp"] = p["timestamp"].isoformat()
    
    track = Track(
        user_id=user_id,
        started_at=data.started_at,
        ended_at=data.ended_at,
        points=points_dict,
        max_speed=stats["max_speed"],
        avg_speed=stats["avg_speed"],
        distance=stats["distance"],
        total_descent=stats["descent"],
        total_ascent=stats["ascent"]
    )
    
    db.add(track)
    await db.commit()
    await db.refresh(track)
    
    if app.state.mq_exchange:
        try:
            await app.state.mq_exchange.publish(
                aio_pika.Message(
                    body=json.dumps({
                        "user_id": user_id,
                        "track_id": track.id,
                        "distance": track.distance,
                        "total_descent": track.total_descent
                    }).encode(),
                    content_type="application/json",
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                ),
                routing_key="stats.track.processed",
            )
        except Exception as e:
            print(f"Failed to publish event: {e}")
            
    return track

@app.get("/stats/tracks", response_model=list[TrackOut])
async def get_tracks(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Track).where(Track.user_id == user_id).order_by(Track.started_at.desc()))
    return result.scalars().all()

@app.get("/stats/me", response_model=UserStats)
async def get_my_stats(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(
            func.sum(Track.distance).label("total_distance"),
            func.sum(Track.total_descent).label("total_descent"),
            func.max(Track.max_speed).label("max_speed"),
            func.count(Track.id).label("total_tracks")
        ).where(Track.user_id == user_id)
    )
    
    row = result.fetchone()
    if not row:
        return UserStats(total_distance=0, total_descent=0, max_speed=0, total_tracks=0)
        
    return UserStats(
        total_distance=row.total_distance or 0,
        total_descent=row.total_descent or 0,
        max_speed=row.max_speed or 0,
        total_tracks=row.total_tracks or 0
    )
