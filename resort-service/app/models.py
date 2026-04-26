from datetime import datetime

from sqlalchemy import String, Integer, Float, ForeignKey, Text, DateTime, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ResortCategory(Base):
    __tablename__ = "resort_categories"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)


class Resort(Base):
    __tablename__ = "resorts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    category_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("resort_categories.id"), nullable=True)
    rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Детальная информация
    track_length_km: Mapped[float | None] = mapped_column(Float, nullable=True)  # протяжённость трасс
    elevation_drop_m: Mapped[int | None] = mapped_column(Integer, nullable=True)  # перепад высот
    trails_green: Mapped[int | None] = mapped_column(Integer, nullable=True)
    trails_blue: Mapped[int | None] = mapped_column(Integer, nullable=True)
    trails_red: Mapped[int | None] = mapped_column(Integer, nullable=True)
    trails_black: Mapped[int | None] = mapped_column(Integer, nullable=True)
    freeride_rating: Mapped[float | None] = mapped_column(Float, nullable=True)  # 1-5
    beginner_friendly: Mapped[bool | None] = mapped_column(Integer, nullable=True)  # 1=True, 0=False


class ResortReview(Base):
    __tablename__ = "resort_reviews"
    __table_args__ = (UniqueConstraint("resort_id", "user_id", name="uq_resort_reviews_resort_user"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    resort_id: Mapped[int] = mapped_column(Integer, ForeignKey("resorts.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    review_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
