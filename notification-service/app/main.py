"""Notification service: единственная точка отправки email в PowderBox.

Слушает RabbitMQ (exchange powderbox.events, routing key email.send),
сообщение: {"to": str, "subject": str, "text": str?, "html": str?}.
Отправляет через SMTP (env SMTP_*). Дальше сюда же лягут рекламные
рассылки и письма восстановления пароля.
"""

import os
import json
import asyncio
import logging
from contextlib import asynccontextmanager
from email.message import EmailMessage

import aio_pika
import aiosmtplib
from fastapi import FastAPI

from app.observability import setup_observability

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")
EXCHANGE = os.getenv("EVENTS_EXCHANGE", "powderbox.events")
SMTP_HOST = os.getenv("SMTP_HOST", "mailpit")
SMTP_PORT = int(os.getenv("SMTP_PORT", "1025"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "noreply@powderbox.local")
SMTP_TLS = os.getenv("SMTP_TLS", "none")  # none | starttls | ssl

logger = logging.getLogger(__name__)


async def send_email(to: str, subject: str, text: str | None = None, html: str | None = None) -> None:
    msg = EmailMessage()
    msg["From"] = SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text or "")
    if html:
        msg.add_alternative(html, subtype="html")
    await aiosmtplib.send(
        msg,
        hostname=SMTP_HOST,
        port=SMTP_PORT,
        username=SMTP_USER or None,
        password=SMTP_PASSWORD or None,
        start_tls=(SMTP_TLS == "starttls"),
        use_tls=(SMTP_TLS == "ssl"),
    )


async def handle_message(body: bytes) -> None:
    """Разбор одного сообщения email.send; мусор логируем и пропускаем."""
    try:
        data = json.loads(body.decode())
    except (ValueError, UnicodeDecodeError):
        logger.error("email.send: malformed message body")
        return
    to, subject = data.get("to"), data.get("subject")
    if not to or not subject:
        logger.error("email.send: missing 'to' or 'subject': %r", data)
        return
    try:
        await send_email(to, subject, data.get("text"), data.get("html"))
        logger.info("email sent to %s: %s", to, subject)
    except Exception:
        logger.exception("failed to send email to %s", to)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        conn = await aio_pika.connect_robust(RABBITMQ_URL)
        ch = await conn.channel()
        exchange = await ch.declare_exchange(EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True)
        queue = await ch.declare_queue("notification-service.email", durable=True)
        await queue.bind(exchange, routing_key="email.send")

        async def worker():
            async with queue.iterator() as q:
                async for msg in q:
                    async with msg.process():
                        await handle_message(msg.body)

        task = asyncio.create_task(worker())
        app.state._mq = (conn, task)
    except Exception as e:
        logger.warning("Failed to start RabbitMQ consumer: %s", e)
        app.state._mq = None

    yield

    if app.state._mq:
        conn, task = app.state._mq
        task.cancel()
        await conn.close()


app = FastAPI(title="Notification Service", version="1.0.0", lifespan=lifespan)
setup_observability(app, service_name="notification-service")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "notification-service"}
