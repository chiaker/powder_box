"""
Базовая наблюдаемость для микросервисов PowderBox.

Подключает:
  * структурированные JSON-логи в stdout с correlation_id;
  * Correlation ID middleware (header X-Request-ID, генерируется при отсутствии);
  * метрики Prometheus (RPS / latency / error rate) + endpoint /metrics.

Использование:

    from app.observability import setup_observability
    app = FastAPI(...)
    setup_observability(app, service_name="auth-service")
"""

from __future__ import annotations

import json
import logging
import sys
import time
import uuid
from contextvars import ContextVar
from typing import Awaitable, Callable

from fastapi import FastAPI, Request
from fastapi.responses import Response
from prometheus_client import (
    CONTENT_TYPE_LATEST,
    CollectorRegistry,
    Counter,
    Gauge,
    Histogram,
    generate_latest,
)
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.routing import Match


# ---------------------------------------------------------------------------
# Correlation ID
# ---------------------------------------------------------------------------

CORRELATION_ID_HEADER = "X-Request-ID"
_correlation_id_ctx: ContextVar[str] = ContextVar("correlation_id", default="-")


def get_correlation_id() -> str:
    """Возвращает correlation_id текущего запроса (или '-' вне запроса)."""
    return _correlation_id_ctx.get()


def set_correlation_id(value: str) -> None:
    _correlation_id_ctx.set(value)


# ---------------------------------------------------------------------------
# Структурированный логгер (JSON в stdout)
# ---------------------------------------------------------------------------

class _JsonFormatter(logging.Formatter):
    def __init__(self, service_name: str) -> None:
        super().__init__()
        self.service_name = service_name

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "service": self.service_name,
            "logger": record.name,
            "message": record.getMessage(),
            "correlation_id": get_correlation_id(),
        }
        for key in ("method", "path", "status_code", "duration_ms", "client_ip"):
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def _configure_logging(service_name: str) -> logging.Logger:
    root = logging.getLogger()
    # Сбрасываем хэндлеры uvicorn/root, чтобы избежать дублей строк.
    for handler in list(root.handlers):
        root.removeHandler(handler)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(_JsonFormatter(service_name))
    root.addHandler(handler)
    root.setLevel(logging.INFO)

    # Uvicorn пишет свои логи через собственные логгеры — переключаем их на JSON-формат.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        lg = logging.getLogger(name)
        lg.handlers = [handler]
        lg.propagate = False

    return logging.getLogger(service_name)


# ---------------------------------------------------------------------------
# Prometheus метрики
# ---------------------------------------------------------------------------

# Отдельный registry на процесс — фронт-эндпоинт /metrics отдаёт только их.
_REGISTRY = CollectorRegistry()

REQUESTS_TOTAL = Counter(
    "http_requests_total",
    "Общее количество HTTP-запросов",
    ["service", "method", "path", "status_code"],
    registry=_REGISTRY,
)

REQUEST_LATENCY = Histogram(
    "http_request_duration_seconds",
    "Длительность HTTP-запросов (секунды)",
    ["service", "method", "path"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
    registry=_REGISTRY,
)

REQUESTS_IN_PROGRESS = Gauge(
    "http_requests_in_progress",
    "Количество запросов, обрабатываемых прямо сейчас",
    ["service", "method"],
    registry=_REGISTRY,
)

EXCEPTIONS_TOTAL = Counter(
    "http_exceptions_total",
    "Необработанные исключения в обработчиках",
    ["service", "method", "path", "exception_type"],
    registry=_REGISTRY,
)


def _route_template(request: Request) -> str:
    """Возвращает шаблон роутинга (например, /resorts/{id}) вместо конкретного URL.

    Это ограничивает кардинальность метрик: без этого каждый ID будет
    превращаться в отдельную метрическую серию.
    """
    router = request.app.router
    for route in router.routes:
        match, _ = route.matches(request.scope)
        if match == Match.FULL:
            return getattr(route, "path", request.url.path)
    return "__unmatched__"


# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------

class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """Читает X-Request-ID или генерирует новый, кладёт в contextvar и в ответ."""

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        correlation_id = request.headers.get(CORRELATION_ID_HEADER) or uuid.uuid4().hex
        token = _correlation_id_ctx.set(correlation_id)
        try:
            response = await call_next(request)
        finally:
            _correlation_id_ctx.reset(token)
        response.headers[CORRELATION_ID_HEADER] = correlation_id
        return response


class MetricsMiddleware(BaseHTTPMiddleware):
    """Собирает RPS / latency / error rate + пишет access-лог в JSON."""

    def __init__(self, app, service_name: str, logger: logging.Logger) -> None:
        super().__init__(app)
        self.service_name = service_name
        self.logger = logger

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        # /metrics не должен накручивать сам себя.
        if request.url.path == "/metrics":
            return await call_next(request)

        method = request.method
        path_template = _route_template(request)
        start = time.perf_counter()
        REQUESTS_IN_PROGRESS.labels(self.service_name, method).inc()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        except Exception as exc:
            EXCEPTIONS_TOTAL.labels(
                self.service_name, method, path_template, type(exc).__name__
            ).inc()
            raise
        finally:
            duration = time.perf_counter() - start
            REQUESTS_IN_PROGRESS.labels(self.service_name, method).dec()
            REQUEST_LATENCY.labels(self.service_name, method, path_template).observe(duration)
            REQUESTS_TOTAL.labels(
                self.service_name, method, path_template, str(status_code)
            ).inc()
            self.logger.info(
                "request handled",
                extra={
                    "method": method,
                    "path": request.url.path,
                    "status_code": status_code,
                    "duration_ms": round(duration * 1000, 2),
                    "client_ip": request.client.host if request.client else None,
                },
            )


# ---------------------------------------------------------------------------
# Публичный API
# ---------------------------------------------------------------------------

def setup_observability(app: FastAPI, service_name: str) -> logging.Logger:
    """Регистрирует middleware, /metrics и настраивает структурированное логирование."""

    logger = _configure_logging(service_name)

    # Порядок add_middleware важен: последний добавленный — самый внешний.
    # Хотим, чтобы CorrelationId был самым внешним, и его id попадал в метрики/логи.
    app.add_middleware(MetricsMiddleware, service_name=service_name, logger=logger)
    app.add_middleware(CorrelationIdMiddleware)

    @app.get("/metrics", include_in_schema=False)
    async def metrics() -> Response:
        return Response(generate_latest(_REGISTRY), media_type=CONTENT_TYPE_LATEST)

    logger.info("observability initialized", extra={"path": "/metrics"})
    return logger
