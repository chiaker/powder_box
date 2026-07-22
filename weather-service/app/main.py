import os
import asyncio
import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime

import aio_pika
import httpx
from fastapi import Depends, FastAPI, HTTPException, Query
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import Base, engine, get_db
from app.models import ResortAltitudePoint
from app.observability import setup_observability
from app.schemas import (
    AltitudePointCreate,
    AltitudePointOut,
    AltitudePointUpdate,
    AltitudePointWeather,
    AltitudePointHourlyForecast,
    AltitudeHourlyEntry,
    AltitudePointDailyForecast,
    AltitudeDailyEntry,
    CurrentWeather,
)

OPEN_METEO_URL = os.getenv("OPEN_METEO_URL", "https://api.open-meteo.com/v1/forecast")
WEATHER_CACHE_TTL = int(os.getenv("WEATHER_CACHE_TTL_SECONDS", "600"))
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")
EVENTS_EXCHANGE = os.getenv("EVENTS_EXCHANGE", "powderbox.events")

# ponytail: незакрытый in-memory кэш без вытеснения — точек высот единицы,
# сменить на TTLCache/Redis если точек станут тысячи.
_meteo_cache: dict[tuple, tuple[float, dict]] = {}


async def _fetch_open_meteo(cache_key: tuple, params: dict) -> dict:
    """GET к Open-Meteo с TTL-кэшем, чтобы не упереться в rate limit."""
    hit = _meteo_cache.get(cache_key)
    if hit and time.monotonic() - hit[0] < WEATHER_CACHE_TTL:
        return hit[1]
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(OPEN_METEO_URL, params=params)
        resp.raise_for_status()
        data = resp.json()
    _meteo_cache[cache_key] = (time.monotonic(), data)
    return data


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        try:
            # Существующие точки становятся основными (DEFAULT 1 бэкфиллит строки)
            await conn.execute(text("ALTER TABLE resort_altitude_points ADD COLUMN is_primary BOOLEAN NOT NULL DEFAULT 1"))
        except Exception:
            pass

    from app.snow_alerts import SNOW_ALERT_CHECK_INTERVAL, snow_alert_loop

    try:
        mq_conn = await aio_pika.connect_robust(RABBITMQ_URL)
        ch = await mq_conn.channel()
        app.state.mq_conn = mq_conn
        app.state.mq_exchange = await ch.declare_exchange(EVENTS_EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True)
    except Exception as e:
        logging.warning("RabbitMQ connection failed: %s", e)
        app.state.mq_conn = None
        app.state.mq_exchange = None

    alert_task = None
    if SNOW_ALERT_CHECK_INTERVAL > 0:
        alert_task = asyncio.create_task(snow_alert_loop(app))

    yield

    if alert_task:
        alert_task.cancel()
    if getattr(app.state, "mq_conn", None):
        await app.state.mq_conn.close()


app = FastAPI(title="Weather Service", version="1.0.0", lifespan=lifespan)
setup_observability(app, service_name="weather-service")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "weather-service"}


# Ручной прогон снежных алертов (через gateway недостижим).
# force=true — тест: игнорирует порог/дедуп, шлёт по всем подпискам.
# Пример: curl -X POST "127.0.0.1:8005/internal/snow-alerts/run?force=true"
@app.post("/internal/snow-alerts/run")
async def run_snow_alerts_now(force: bool = False):
    from app.snow_alerts import run_snow_alert_check

    sent = await run_snow_alert_check(app, force=force)
    return {"sent": sent}


def weather_condition_from_code(code: int | None) -> str:
    mapping = {
        0: "Ясно",
        1: "Преимущественно ясно",
        2: "Переменная облачность",
        3: "Пасмурно",
        45: "Туман",
        48: "Изморозь",
        51: "Морось",
        53: "Морось",
        55: "Сильная морось",
        61: "Дождь",
        63: "Умеренный дождь",
        65: "Сильный дождь",
        71: "Снег",
        73: "Умеренный снег",
        75: "Сильный снег",
        77: "Снежные зерна",
        80: "Ливень",
        81: "Ливень",
        82: "Сильный ливень",
        85: "Снежные заряды",
        86: "Сильные снежные заряды",
        95: "Гроза",
        96: "Гроза с градом",
        99: "Сильная гроза с градом",
    }
    return mapping.get(-1 if code is None else code, "Неизвестно")


async def fetch_open_meteo_current(latitude: float, longitude: float) -> dict:
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": "temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code",
        "timezone": "auto",
    }
    data = await _fetch_open_meteo(("current", latitude, longitude), params)
    current = data.get("current")
    if not current:
        raise HTTPException(status_code=502, detail="Open-Meteo returned empty current weather")
    return current


async def fetch_open_meteo_forecast(latitude: float, longitude: float, forecast_days: int = 8) -> dict:
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": "temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code",
        "hourly": "temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,precipitation",
        "daily": "temperature_2m_max,temperature_2m_min,wind_speed_10m_max,precipitation_sum,snowfall_sum,weather_code",
        "forecast_days": forecast_days,
        "timezone": "auto",
    }
    return await _fetch_open_meteo(("forecast", latitude, longitude, forecast_days), params)


def current_from_open_meteo(resort_id: int, current: dict) -> CurrentWeather:
    return CurrentWeather(
        resortId=resort_id,
        temperature=float(current.get("temperature_2m", 0)),
        windSpeed=float(current.get("wind_speed_10m", 0)),
        humidity=int(current.get("relative_humidity_2m", 0)),
        condition=weather_condition_from_code(current.get("weather_code")),
        timestamp=datetime.fromisoformat(str(current.get("time"))),
    )


async def get_active_points(db: AsyncSession, resort_id: int) -> list[ResortAltitudePoint]:
    """Точки для погодных эндпоинтов: только основные (вспомогательные — для карты)."""
    result = await db.execute(
        select(ResortAltitudePoint)
        .where(
            ResortAltitudePoint.resort_id == resort_id,
            ResortAltitudePoint.is_active.is_(True),
            ResortAltitudePoint.is_primary.is_(True),
        )
        .order_by(ResortAltitudePoint.altitude_m.asc())
    )
    return result.scalars().all()


@app.get("/weather/{resort_id}/altitude-points", response_model=list[AltitudePointOut])
async def list_altitude_points(resort_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ResortAltitudePoint)
        .where(ResortAltitudePoint.resort_id == resort_id)
        .order_by(ResortAltitudePoint.altitude_m.asc())
    )
    return [AltitudePointOut.model_validate(p) for p in result.scalars().all()]


@app.post("/weather/{resort_id}/altitude-points", response_model=AltitudePointOut, status_code=201)
async def create_altitude_point(resort_id: int, data: AltitudePointCreate, db: AsyncSession = Depends(get_db)):
    point = ResortAltitudePoint(
        resort_id=resort_id,
        name=data.name,
        altitude_m=data.altitude_m,
        latitude=data.latitude,
        longitude=data.longitude,
        is_active=data.is_active,
        is_primary=data.is_primary,
    )
    db.add(point)
    await db.commit()
    await db.refresh(point)
    return AltitudePointOut.model_validate(point)


@app.patch("/weather/altitude-points/{point_id}", response_model=AltitudePointOut)
async def update_altitude_point(point_id: int, data: AltitudePointUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ResortAltitudePoint).where(ResortAltitudePoint.id == point_id))
    point = result.scalar_one_or_none()
    if not point:
        raise HTTPException(status_code=404, detail="Altitude point not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(point, key, value)
    await db.commit()
    await db.refresh(point)
    return AltitudePointOut.model_validate(point)


@app.delete("/weather/altitude-points/{point_id}", status_code=204)
async def delete_altitude_point(point_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ResortAltitudePoint).where(ResortAltitudePoint.id == point_id))
    point = result.scalar_one_or_none()
    if not point:
        raise HTTPException(status_code=404, detail="Altitude point not found")
    await db.delete(point)
    await db.commit()


@app.get("/weather/{resort_id}/altitudes/current", response_model=list[AltitudePointWeather])
async def get_altitude_weather(resort_id: int, db: AsyncSession = Depends(get_db)):
    points = await get_active_points(db, resort_id)
    if not points:
        return []
    result: list[AltitudePointWeather] = []
    for point in points:
        current = await fetch_open_meteo_current(point.latitude, point.longitude)
        result.append(
            AltitudePointWeather(
                point_id=point.id,
                point_name=point.name,
                altitude_m=point.altitude_m,
                temperature=float(current.get("temperature_2m", 0)),
                windSpeed=float(current.get("wind_speed_10m", 0)),
                humidity=int(current.get("relative_humidity_2m", 0)),
                condition=weather_condition_from_code(current.get("weather_code")),
                timestamp=datetime.fromisoformat(str(current.get("time"))),
            )
        )
    return result


def build_hourly_entries(hourly: dict) -> list[AltitudeHourlyEntry]:
    times = hourly.get("time", [])
    temps = hourly.get("temperature_2m", [])
    winds = hourly.get("wind_speed_10m", [])
    humids = hourly.get("relative_humidity_2m", [])
    precs = hourly.get("precipitation", [])
    codes = hourly.get("weather_code", [])
    limit = min(len(times), len(temps), len(winds), len(humids), len(precs), len(codes))
    entries: list[AltitudeHourlyEntry] = []
    for i in range(limit):
        entries.append(
            AltitudeHourlyEntry(
                timestamp=datetime.fromisoformat(str(times[i])),
                temperature=float(temps[i]),
                windSpeed=float(winds[i]),
                humidity=int(humids[i]),
                precipitation=float(precs[i]),
                condition=weather_condition_from_code(codes[i]),
            )
        )
    return entries


@app.get("/weather/{resort_id}/altitudes/hourly", response_model=list[AltitudePointHourlyForecast])
async def get_altitude_hourly_weather(
    resort_id: int,
    day: str = Query("today", pattern="^(today|tomorrow)$"),
    db: AsyncSession = Depends(get_db),
):
    points = await get_active_points(db, resort_id)
    if not points:
        return []

    datasets = await asyncio.gather(
        *(fetch_open_meteo_forecast(point.latitude, point.longitude, forecast_days=3) for point in points)
    )
    out: list[AltitudePointHourlyForecast] = []
    for point, dataset in zip(points, datasets):
        entries = build_hourly_entries(dataset.get("hourly", {}))
        unique_dates: list[str] = []
        for entry in entries:
            d = entry.timestamp.date().isoformat()
            if d not in unique_dates:
                unique_dates.append(d)
        if not unique_dates:
            selected = []
        else:
            day_idx = 0 if day == "today" else 1
            target_date = unique_dates[min(day_idx, len(unique_dates) - 1)]
            selected = [
                e
                for e in entries
                if e.timestamp.date().isoformat() == target_date and e.timestamp.hour % 3 == 0
            ]
        out.append(
            AltitudePointHourlyForecast(
                point_id=point.id,
                point_name=point.name,
                altitude_m=point.altitude_m,
                hours=selected,
            )
        )
    return out


def build_daily_entries(daily: dict, days: int) -> list[AltitudeDailyEntry]:
    times = daily.get("time", [])
    mins = daily.get("temperature_2m_min", [])
    maxs = daily.get("temperature_2m_max", [])
    winds = daily.get("wind_speed_10m_max", [])
    precs = daily.get("precipitation_sum", [])
    # snowfall_sum (см) не участвует в limit: старые данные/моки без него не должны обнулять прогноз
    snows = daily.get("snowfall_sum") or []
    codes = daily.get("weather_code", [])
    limit = min(len(times), len(mins), len(maxs), len(winds), len(precs), len(codes), days)
    entries: list[AltitudeDailyEntry] = []
    for i in range(limit):
        entries.append(
            AltitudeDailyEntry(
                date=datetime.fromisoformat(f"{times[i]}T00:00:00"),
                minTemperature=float(mins[i]),
                maxTemperature=float(maxs[i]),
                windSpeed=float(winds[i]),
                precipitation=float(precs[i]),
                snowfall=float(snows[i]) if i < len(snows) else 0.0,
                condition=weather_condition_from_code(codes[i]),
            )
        )
    return entries


@app.get("/weather/{resort_id}/altitudes/daily", response_model=list[AltitudePointDailyForecast])
async def get_altitude_daily_weather(
    resort_id: int,
    days: int = Query(7, ge=1, le=10),
    db: AsyncSession = Depends(get_db),
):
    points = await get_active_points(db, resort_id)
    if not points:
        return []
    datasets = await asyncio.gather(
        *(fetch_open_meteo_forecast(point.latitude, point.longitude, forecast_days=max(days, 3)) for point in points)
    )
    out: list[AltitudePointDailyForecast] = []
    for point, dataset in zip(points, datasets):
        entries = build_daily_entries(dataset.get("daily", {}), days=days)
        out.append(
            AltitudePointDailyForecast(
                point_id=point.id,
                point_name=point.name,
                altitude_m=point.altitude_m,
                days=entries,
            )
        )
    return out


@app.get("/weather/{resort_id}/current", response_model=CurrentWeather)
async def get_current_weather(resort_id: int, db: AsyncSession = Depends(get_db)):
    points = await get_active_points(db, resort_id)
    if points:
        current = await fetch_open_meteo_current(points[0].latitude, points[0].longitude)
        return current_from_open_meteo(resort_id, current)
    raise HTTPException(status_code=404, detail="No altitude points configured for this resort")
