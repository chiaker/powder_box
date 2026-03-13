from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ResortCategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str


class ResortOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: str | None
    image_url: str | None
    category_id: int | None
    rating: float | None
    track_length_km: float | None = None
    elevation_drop_m: int | None = None
    trails_green: int | None = None
    trails_blue: int | None = None
    trails_red: int | None = None
    trails_black: int | None = None
    freeride_rating: float | None = None
    beginner_friendly: bool | None = None
    review_count: int = 0


class ResortCreate(BaseModel):
    name: str
    description: str | None = None
    image_url: str | None = None
    rating: float | None = None
    track_length_km: float | None = None
    elevation_drop_m: int | None = None
    trails_green: int | None = None
    trails_blue: int | None = None
    trails_red: int | None = None
    trails_black: int | None = None
    freeride_rating: float | None = None
    beginner_friendly: bool | None = None


class ResortUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    image_url: str | None = None
    rating: float | None = None
    track_length_km: float | None = None
    elevation_drop_m: int | None = None
    trails_green: int | None = None
    trails_blue: int | None = None
    trails_red: int | None = None
    trails_black: int | None = None
    freeride_rating: float | None = None
    beginner_friendly: bool | None = None


class ResortReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    resort_id: int
    user_id: int
    rating: int
    review_text: str | None = None
    created_at: datetime
    updated_at: datetime


class ResortReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    review_text: str | None = Field(default=None, max_length=3000)


class ResortReviewUpdate(BaseModel):
    rating: int | None = Field(default=None, ge=1, le=5)
    review_text: str | None = Field(default=None, max_length=3000)
