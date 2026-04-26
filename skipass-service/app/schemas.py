from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

AgeCategory = Literal["child", "teen", "adult", "senior"]
AccessType = Literal["day", "evening", "full"]


class SkipassTariffOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    resort_id: int
    season_name: str
    season_start: date
    season_end: date
    age_category: AgeCategory
    access_type: AccessType
    duration_days: int
    is_fast_track: bool
    price: float
    currency: str
    is_active: bool


class SkipassTariffCreate(BaseModel):
    season_name: str = Field(min_length=1, max_length=80)
    season_start: date
    season_end: date
    age_category: AgeCategory
    access_type: AccessType
    duration_days: int = Field(ge=1, le=30)
    is_fast_track: bool = False
    price: float = Field(gt=0)
    currency: str = Field(default="RUB", min_length=3, max_length=8)
    is_active: bool = True


class SkipassTariffUpdate(BaseModel):
    season_name: str | None = Field(default=None, min_length=1, max_length=80)
    season_start: date | None = None
    season_end: date | None = None
    age_category: AgeCategory | None = None
    access_type: AccessType | None = None
    duration_days: int | None = Field(default=None, ge=1, le=30)
    is_fast_track: bool | None = None
    price: float | None = Field(default=None, gt=0)
    currency: str | None = Field(default=None, min_length=3, max_length=8)
    is_active: bool | None = None


class PriceResponse(BaseModel):
    price: float
    currency: str = "RUB"
    tariff_id: int | None = None
    season_name: str | None = None
