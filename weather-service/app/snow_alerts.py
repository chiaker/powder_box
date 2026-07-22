"""Снежные алерты: периодически сверяет прогноз snowfall_sum с порогами
подписчиков (избранные курорты) и публикует письма в RabbitMQ (email.send).

Дедуп — таблица sent_snow_alerts: одно письмо на (user, resort, дата прогноза).
"""

import os
import json
import asyncio
import logging

import aio_pika
import httpx
from sqlalchemy.exc import IntegrityError

from app.database import async_session
from app.models import SentSnowAlert

USER_PROFILE_SERVICE_URL = os.getenv("USER_PROFILE_SERVICE_URL", "http://user-profile-service:8002")
AUTH_SERVICE_URL = os.getenv("AUTH_SERVICE_URL", "http://auth-service:8001")
RESORT_SERVICE_URL = os.getenv("RESORT_SERVICE_URL", "http://resort-service:8004")
SNOW_ALERT_CHECK_INTERVAL = int(os.getenv("SNOW_ALERT_CHECK_INTERVAL_SECONDS", "21600"))
SNOW_ALERT_FORECAST_DAYS = int(os.getenv("SNOW_ALERT_FORECAST_DAYS", "3"))

logger = logging.getLogger(__name__)


# Мелкие обёртки над HTTP — их мокают тесты
async def _get_subscriptions(client: httpx.AsyncClient) -> list[dict]:
    resp = await client.get(f"{USER_PROFILE_SERVICE_URL}/internal/snow-alert-subscriptions")
    resp.raise_for_status()
    return resp.json()


async def _get_emails(client: httpx.AsyncClient, user_ids: list[int]) -> dict:
    resp = await client.post(f"{AUTH_SERVICE_URL}/internal/users/emails", json={"ids": user_ids})
    resp.raise_for_status()
    return resp.json()


async def _get_resort_names(client: httpx.AsyncClient) -> dict[str, str]:
    resp = await client.get(f"{RESORT_SERVICE_URL}/resorts")
    resp.raise_for_status()
    data = resp.json()
    items = data.get("items", data) if isinstance(data, dict) else data
    return {str(r["id"]): r.get("name", f"курорт {r['id']}") for r in items}


async def _resort_forecast(resort_id: str) -> list[tuple[str, float]]:
    """[(YYYY-MM-DD, snowfall_cm), ...] на ближайшие дни; [] если нет точек."""
    from app.main import fetch_open_meteo_forecast, get_active_points  # избегаем циклического импорта

    async with async_session() as db:
        points = await get_active_points(db, int(resort_id))
    if not points:
        return []
    data = await fetch_open_meteo_forecast(points[0].latitude, points[0].longitude, forecast_days=SNOW_ALERT_FORECAST_DAYS)
    daily = data.get("daily", {})
    times = daily.get("time", [])
    snows = daily.get("snowfall_sum") or []
    return [
        (str(times[i]), float(snows[i]) if snows[i] is not None else 0.0)
        for i in range(min(len(times), len(snows), SNOW_ALERT_FORECAST_DAYS))
    ]


async def _publish_email(app, to: str, subject: str, text: str) -> None:
    exchange = getattr(app.state, "mq_exchange", None)
    if not exchange:
        return
    await exchange.publish(
        aio_pika.Message(
            body=json.dumps({"to": to, "subject": subject, "text": text}).encode(),
            content_type="application/json",
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
        ),
        routing_key="email.send",
    )


async def run_snow_alert_check(app, force: bool = False) -> int:
    """Один прогон проверки. Возвращает число отправленных писем.

    force=True — тестовый режим: игнорирует порог и дедуп, шлёт письмо по
    каждому избранному курорту подписчиков с фактическим прогнозом
    (даже если снега 0 см). Нужен, чтобы проверить цепочку летом.
    """
    if not getattr(app.state, "mq_exchange", None):
        logger.warning("snow alert check skipped: no RabbitMQ exchange")
        return 0

    async with httpx.AsyncClient(timeout=15.0) as client:
        subs = await _get_subscriptions(client)
        if not subs:
            return 0
        resort_names = await _get_resort_names(client)
        emails = await _get_emails(client, [s["user_id"] for s in subs])

    # Прогноз один раз на каждый уникальный курорт
    forecasts: dict[str, list[tuple[str, float]]] = {}
    for rid in {str(rid) for s in subs for rid in s["resort_ids"]}:
        try:
            forecasts[rid] = await _resort_forecast(rid)
        except Exception:
            logger.exception("forecast failed for resort %s", rid)
            forecasts[rid] = []

    sent = 0
    for sub in subs:
        info = emails.get(str(sub["user_id"]))
        if not info or not info.get("confirmed"):
            continue
        for rid in map(str, sub["resort_ids"]):
            if force:
                # Тест: без порога и дедупа, показываем прогноз как есть
                new_hits = forecasts.get(rid) or [("нет прогноза", 0.0)]
            else:
                hits = [(d, cm) for d, cm in forecasts.get(rid, []) if cm >= sub["threshold_cm"]]
                if not hits:
                    continue
                # Дедуп: вставляем по строке, конфликт => уже алертили
                new_hits = []
                async with async_session() as db:
                    for d, cm in hits:
                        db.add(SentSnowAlert(user_id=sub["user_id"], resort_id=int(rid), forecast_date=d))
                        try:
                            await db.commit()
                            new_hits.append((d, cm))
                        except IntegrityError:
                            await db.rollback()
                if not new_hits:
                    continue
            name = resort_names.get(rid, f"курорт {rid}")
            subject = f"Снегопад на {name} — PowderBox" if not force else f"[ТЕСТ] Снежный алерт: {name} — PowderBox"
            lines = "\n".join(f"  {d}: {cm:g} см" for d, cm in new_hits)
            try:
                await _publish_email(
                    app,
                    info["email"],
                    subject,
                    f"Паудер-алерт! На курорте {name} ожидается снег:\n{lines}\n\n"
                    "Отключить уведомления можно в профиле на PowderBox.",
                )
                sent += 1
            except Exception:
                logger.exception("failed to publish snow alert email")
    return sent


async def snow_alert_loop(app) -> None:
    while True:
        try:
            sent = await run_snow_alert_check(app)
            if sent:
                logger.info("snow alerts sent: %d", sent)
        except Exception:
            logger.exception("snow alert check failed")
        await asyncio.sleep(SNOW_ALERT_CHECK_INTERVAL)
