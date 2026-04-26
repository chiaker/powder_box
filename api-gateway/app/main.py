import os

from dotenv import load_dotenv

load_dotenv()

from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse, Response
from jose import JWTError, jwt

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
    "/snow": "weather",  # weather service handles snow conditions
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
    "/snow",
    "/hotels",
    "/skipasses",
]

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-key")
JWT_ALGORITHM = "HS256"
ADMIN_EMAILS = {
    email.strip().lower()
    for email in os.getenv("ADMIN_EMAILS", "").split(",")
    if email.strip()
}
ADMIN_WRITE_PATH_PREFIXES = ["/resorts", "/lessons", "/equipment", "/hotels", "/skipasses", "/weather", "/snow"]


def get_service_for_path(path: str) -> tuple[str | None, str | None]:
    """Return (service_name, base_path) or (None, None) if no match."""
    for prefix, service in PATH_TO_SERVICE.items():
        if path.startswith(prefix):
            return service, prefix
    return None, None


def is_public_path(path: str, method: str = "GET") -> bool:
    if path == "/health":
        return True
    if path == "/equipment/upload" and method == "POST":
        return True
    if method in ("POST", "PATCH", "PUT", "DELETE"):
        for p in ["/resorts", "/lessons", "/equipment", "/hotels", "/skipasses", "/weather", "/snow"]:
            if path.startswith(p):
                return False
    return any(path.startswith(p) for p in PUBLIC_PATH_PREFIXES)


def verify_jwt(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        return None


def is_admin_write_path(path: str, method: str) -> bool:
    if method not in ("POST", "PATCH", "PUT", "DELETE"):
        return False
    if path.startswith("/resorts/") and "/reviews" in path:
        return False
    if path.startswith("/equipment/items") or path.startswith("/equipment/upload"):
        return False
    return any(path.startswith(prefix) for prefix in ADMIN_WRITE_PATH_PREFIXES)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="PowderBox API Gateway", version="1.0.0", lifespan=lifespan)

from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
        if is_admin_write_path(full_path, request.method):
            email = str(payload.get("email", "")).strip().lower()
            if not ADMIN_EMAILS or email not in ADMIN_EMAILS:
                raise HTTPException(status_code=403, detail="Admin access required")

    headers = dict(request.headers)
    headers.pop("host", None)
    if full_path == "/equipment/upload" and request.method == "POST":
        x_token = request.headers.get("x-auth-token") or request.headers.get("X-Auth-Token")
        auth_val = headers.get("authorization") or headers.get("Authorization")
        if x_token and not auth_val:
            headers["Authorization"] = f"Bearer {x_token}"
    if payload:
        email = str(payload.get("email", "")).strip().lower()
        if ADMIN_EMAILS and email in ADMIN_EMAILS:
            headers["X-Is-Admin"] = "true"

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            if request.method == "GET":
                resp = await client.get(target_url, params=request.query_params, headers=headers)
            elif request.method == "POST":
                body = await request.body()
                resp = await client.post(target_url, content=body, headers=headers)
            elif request.method == "PUT":
                body = await request.body()
                resp = await client.put(target_url, content=body, headers=headers)
            elif request.method == "PATCH":
                body = await request.body()
                resp = await client.patch(target_url, content=body, headers=headers)
            elif request.method == "DELETE":
                resp = await client.delete(target_url, headers=headers)
            else:
                raise HTTPException(status_code=405, detail="Method not allowed")

            content_type = resp.headers.get("content-type", "")
            if "application/json" in content_type:
                try:
                    return JSONResponse(status_code=resp.status_code, content=resp.json())
                except Exception:
                    pass
            return Response(content=resp.content, status_code=resp.status_code, media_type=content_type or "text/plain")
        except httpx.ConnectError:
            raise HTTPException(status_code=503, detail=f"Service {service_name} unavailable")
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="Gateway timeout")
