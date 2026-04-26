from datetime import datetime
from sqlalchemy import Column, Integer, Float, String, DateTime, JSON
from app.database import Base

class Track(Base):
    __tablename__ = "tracks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    started_at = Column(DateTime, nullable=False)
    ended_at = Column(DateTime, nullable=False)
    max_speed = Column(Float, default=0.0) # in km/h
    avg_speed = Column(Float, default=0.0) # in km/h
    distance = Column(Float, default=0.0) # in km
    total_descent = Column(Float, default=0.0) # in meters
    total_ascent = Column(Float, default=0.0) # in meters
    # We will store points as JSON: list of {lat, lng, alt, speed, timestamp}
    points = Column(JSON, nullable=False)
