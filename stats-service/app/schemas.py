from datetime import datetime
from pydantic import BaseModel, Field

class TrackPoint(BaseModel):
    lat: float
    lng: float
    alt: float
    speed: float # m/s
    timestamp: datetime

class TrackCreate(BaseModel):
    started_at: datetime
    ended_at: datetime
    points: list[TrackPoint]

class TrackOut(BaseModel):
    id: int
    user_id: int
    started_at: datetime
    ended_at: datetime
    max_speed: float
    avg_speed: float
    distance: float
    total_descent: float
    total_ascent: float
    points: list[dict]

    class Config:
        from_attributes = True

class UserStats(BaseModel):
    total_distance: float
    total_descent: float
    max_speed: float
    total_tracks: int
