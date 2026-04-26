from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SkipassTariff(Base):
    __tablename__ = "skipass_tariffs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    resort_id: Mapped[int] = mapped_column(Integer, nullable=False)
    season_name: Mapped[str] = mapped_column(String(80), nullable=False)
    season_start: Mapped[date] = mapped_column(Date, nullable=False)
    season_end: Mapped[date] = mapped_column(Date, nullable=False)
    age_category: Mapped[str] = mapped_column(String(20), nullable=False)  # child, teen, adult, senior
    access_type: Mapped[str] = mapped_column(String(20), nullable=False)  # day, evening, full
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False)
    is_fast_track: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    price: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="RUB")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
