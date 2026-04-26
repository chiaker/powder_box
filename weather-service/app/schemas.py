from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class CurrentWeather(BaseModel):
    resortId: int
    temperature: float
    windSpeed: float
    humidity: int
    condition: str
    timestamp: datetime


class HourlyForecast(BaseModel):
    resortId: int
    temperature: float
    windSpeed: float
    humidity: int
    condition: str
    timestamp: datetime


class DailyForecast(BaseModel):
    resortId: int
    minTemperature: float
    maxTemperature: float
    snowfall: float
    condition: str
    timestamp: datetime


class SnowCondition(BaseModel):
    resortId: int
    baseSnowDepth: float
    topSnowDepth: float
    lastSnowfall: datetime
    avalancheRiskLevel: str


class AltitudePointCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    altitude_m: int = Field(ge=0, le=10000)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    is_active: bool = True


class AltitudePointUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    altitude_m: int | None = Field(default=None, ge=0, le=10000)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    is_active: bool | None = None


class AltitudePointOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    resort_id: int
    name: str
    altitude_m: int
    latitude: float
    longitude: float
    is_active: bool


class AltitudePointWeather(BaseModel):
    point_id: int
    point_name: str
    altitude_m: int
    temperature: float
    windSpeed: float
    humidity: int
    condition: str
    timestamp: datetime


class AltitudeHourlyEntry(BaseModel):
    timestamp: datetime
    temperature: float
    windSpeed: float
    humidity: int
    precipitation: float
    condition: str


class AltitudePointHourlyForecast(BaseModel):
    point_id: int
    point_name: str
    altitude_m: int
    hours: list[AltitudeHourlyEntry]


class AltitudeDailyEntry(BaseModel):
    date: datetime
    minTemperature: float
    maxTemperature: float
    windSpeed: float
    precipitation: float
    condition: str


class AltitudePointDailyForecast(BaseModel):
    point_id: int
    point_name: str
    altitude_m: int
    days: list[AltitudeDailyEntry]
