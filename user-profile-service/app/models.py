from sqlalchemy import String, Integer, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


# Use JSON (not JSONB) for SQLite compatibility - JSONB is PostgreSQL-only
class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, unique=True, nullable=False, index=True)
    nickname: Mapped[str | None] = mapped_column(String(100), nullable=True)
    level: Mapped[str | None] = mapped_column(String(20), nullable=True)  # beginner, intermediate, advanced
    equipment_type: Mapped[str | None] = mapped_column(String(20), nullable=True)  # ski, snowboard
    favorite_resorts: Mapped[list] = mapped_column(JSON, default=list, nullable=False)  # list of resort_id strings
    total_distance: Mapped[float] = mapped_column(default=0.0, nullable=False)
    total_descent: Mapped[float] = mapped_column(default=0.0, nullable=False)
