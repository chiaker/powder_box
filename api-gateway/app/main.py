import os

from dotenv import load_dotenv

load_dotenv()

from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import Response
from jose import JWTError, jwt

from app.observability import (
    CORRELATION_ID_HEADER,
    get_correlation_id,
    setup_observability,
)

# Service URL mapping
SERVICE_URLS = {
    "auth": os.getenv("AUTH_SERVICE_URL", "http://auth-service:8001"),
    "user-profile": os.getenv("USER_PROFILE_SERVICE_URL", "http://user-profile-service:8002"),
    "equipment": os.getenv("EQUIPMENT_SERVICE_URL", "http://equipment-service:8003"),
    "resort": os.getenv("RESORT_SERVICE_URL", "http://resort-service:8004"),
    "weather": os.getenv("WEATHER_SERVICE_URL", "http://weather-service:8005"),
    "hotel": os.getenv("HOTEL_SERVICE_URL", "http://hotel-service:8006"),
    "skipass": os.getenv("SKIPASS_SERVICE_URL", "http://skipass-service:8007"),
    "lesson": os.getenv("LESSON_SERVICE_URL", "http://lesson-service:8008"),
    "activity": os.getenv("ACTIVITY_SERVICE_URL", "http://activity-service:8009"),
    "stats": os.getenv("STATS_SERVICE_URL", "http://stats-service:8010"),
}

# Path prefix -> service mapping
PATH_TO_SERVICE = {
    "/auth": "auth",
    "/users": "user-profile",
    "/equipment": "equipment",
    "/equipment-static": "equipment",
    "/resorts": "resort",
    "/static": "resort",
    "/weather": "weather",
    "/hotels": "hotel",
    "/skipasses": "skipass",
    "/lessons": "lesson",
    "/activities": "activity",
    "/stats": "stats",
}

# Path prefixes that don't require JWT (публичный доступ для просмотра)
PUBLIC_PATH_PREFIXES = [
    "/auth/",      # register, login, refresh
    "/resorts",
    "/static",
    "/equipment-static",
    "/lessons",
    "/equipment",
    "/weather",
    "/hotels",
    "/skipasses",
]

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-key")
JWT_ALGORITHM = "HS256"
# Fallback для старых токенов без role-claim; источник истины — claim "role",
# который auth-service кладёт в access-токен.
ADMIN_EMAILS = {
    email.strip().lower()
    for email in os.getenv("ADMIN_EMAILS", "").split(",")
    if email.strip()
}
ADMIN_WRITE_PATH_PREFIXES = ["/resorts", "/lessons", "/equipment", "/hotels", "/skipasses", "/weather"]


def get_service_for_path(path: str) -> tuple[str | None, str | None]:
    """Return (service_name, base_path) or (None, None) if no match."""
    for prefix, service in PATH_TO_SERVICE.items():
        if path.startswith(prefix):
            return service, prefix
    return None, None


def is_public_path(path: str, method: str = "GET") -> bool:
    if path == "/health":
        return True
    if method in ("POST", "PATCH", "PUT", "DELETE"):
        if any(path.startswith(p) for p in ADMIN_WRITE_PATH_PREFIXES):
            return False
    return any(path.startswith(p) for p in PUBLIC_PATH_PREFIXES)


def verify_jwt(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        return None


def is_admin(payload: dict) -> bool:
    if payload.get("role") == "admin":
        return True
    email = str(payload.get("email", "")).strip().lower()
    return bool(ADMIN_EMAILS) and email in ADMIN_EMAILS


def is_admin_write_path(path: str, method: str) -> bool:
    if method not in ("POST", "PATCH", "PUT", "DELETE"):
        return False
    if path.startswith("/resorts/") and "/reviews" in path:
        return False
    if path.startswith("/equipment/items") or path.startswith("/equipment/upload"):
        return False
    return any(path.startswith(prefix) for prefix in ADMIN_WRITE_PATH_PREFIXES)


# Один переиспользуемый клиент с connection pool вместо клиента на каждый запрос.
_http_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(timeout=30.0)
    return _http_client


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    if _http_client and not _http_client.is_closed:
        await _http_client.aclose()


app = FastAPI(title="PowderBox API Gateway", version="1.0.0", lifespan=lifespan)

from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
setup_observability(app, service_name="api-gateway")

@app.get("/health")
async def health():
    return {"status": "ok", "service": "api-gateway"}


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def proxy(request: Request, path: str):
    full_path = f"/{path}" if path else "/"
    service_name, prefix = get_service_for_path(full_path)

    if not service_name:
        raise HTTPException(status_code=404, detail="Not found")

    base_url = SERVICE_URLS[service_name]
    target_url = f"{base_url.rstrip('/')}{full_path}"

    # JWT check for protected paths
    payload = None
    if not is_public_path(full_path, request.method):
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization")
        token = auth_header.split()[1]
        payload = verify_jwt(token)
        if not payload:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        if is_admin_write_path(full_path, request.method) and not is_admin(payload):
            raise HTTPException(status_code=403, detail="Admin access required")

    headers = dict(request.headers)
    headers.pop("host", None)
    # httpx сам выставит корректные заголовки тела запроса.
    headers.pop("content-length", None)
    headers.pop("transfer-encoding", None)
    # X-Is-Admin выставляет ТОЛЬКО gateway — клиентский заголовок отбрасываем,
    # иначе любой пользователь мог бы выдать себя за админа для downstream-сервисов.
    headers.pop("x-is-admin", None)
    # Прокидываем correlation ID на upstream-сервисы, чтобы логи одного
    # запроса от клиента до downstream-сервиса связывались по этому ключу.
    headers[CORRELATION_ID_HEADER] = get_correlation_id()
    if payload and is_admin(payload):
        headers["X-Is-Admin"] = "true"

    body = await request.body()
    try:
        resp = await get_http_client().request(
            request.method,
            target_url,
            params=request.query_params,
            content=body or None,
            headers=headers,
        )
        content_type = resp.headers.get("content-type", "")
        return Response(content=resp.content, status_code=resp.status_code, media_type=content_type or "text/plain")
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail=f"Service {service_name} unavailable")
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Gateway timeout")
