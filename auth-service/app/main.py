import os
import json
import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from contextlib import asynccontextmanager

import aio_pika
import bcrypt
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, async_session
from app.models import User, RefreshToken
from app.observability import setup_observability
from app.schemas import (
    RegisterRequest,
    LoginRequest,
    AuthTokens,
    RefreshRequest,
    LogoutResponse,
    ConfirmRequest,
    AuthMe,
    SuccessResponse,
    InternalEmailsRequest,
    ChangeEmailRequest,
)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-key")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
REFRESH_TOKEN_EXPIRE = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "http://localhost:3000").rstrip("/")
CONFIRM_TOKEN_EXPIRE_HOURS = int(os.getenv("CONFIRM_TOKEN_EXPIRE_HOURS", "48"))
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")
EVENTS_EXCHANGE = os.getenv("EVENTS_EXCHANGE", "powderbox.events")
# Роль кладётся в access-токен при выпуске: единый источник — ADMIN_EMAILS
# на auth-сервисе; gateway и фронт читают подписанный claim, а не свои списки.
ADMIN_EMAILS = {
    email.strip().lower()
    for email in os.getenv("ADMIN_EMAILS", "").split(",")
    if email.strip()
}


def role_for(user: User) -> str:
    return "admin" if user.email.strip().lower() in ADMIN_EMAILS else "user"


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE)
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE)
    to_encode.update({"exp": expire, "type": "refresh", "jti": secrets.token_hex(16)})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def token_sha256(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


async def persist_refresh_token(db: AsyncSession, user_id: int, refresh_token: str) -> None:
    payload = jwt.decode(refresh_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    exp = payload.get("exp")
    jti = payload.get("jti")
    if not exp or not jti:
        raise HTTPException(status_code=500, detail="Failed to issue refresh token")
    db.add(
        RefreshToken(
            user_id=user_id,
            token_hash=token_sha256(refresh_token),
            jti=str(jti),
            expires_at=datetime.fromtimestamp(int(exp), tz=timezone.utc),
        )
    )
    await db.flush()


async def issue_token_pair(db: AsyncSession, user: User) -> AuthTokens:
    access_token = create_access_token({"sub": str(user.id), "email": user.email, "role": role_for(user)})
    refresh_token = create_refresh_token({"sub": str(user.id)})
    await persist_refresh_token(db, user.id, refresh_token)
    return AuthTokens(access_token=access_token, refresh_token=refresh_token)


def issue_confirm_token(user: User) -> str:
    token = secrets.token_urlsafe(32)
    user.confirm_token_hash = token_sha256(token)
    user.confirm_token_expires_at = datetime.now(timezone.utc) + timedelta(hours=CONFIRM_TOKEN_EXPIRE_HOURS)
    return token


async def publish_email(to: str, subject: str, text: str) -> None:
    exchange = getattr(app.state, "mq_exchange", None)
    if not exchange:
        logging.warning("email.send skipped (no broker): %s", subject)
        return
    try:
        await exchange.publish(
            aio_pika.Message(
                body=json.dumps({"to": to, "subject": subject, "text": text}).encode(),
                content_type="application/json",
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            ),
            routing_key="email.send",
        )
    except Exception:
        logging.exception("email.send publish failed")


async def send_confirmation_email(user: User, token: str) -> None:
    link = f"{PUBLIC_BASE_URL}/confirm-email?token={token}"
    await publish_email(
        user.email,
        "Подтвердите email — PowderBox",
        f"Здравствуйте!\n\nПодтвердите ваш email, перейдя по ссылке:\n{link}\n\n"
        f"Ссылка действует {CONFIRM_TOKEN_EXPIRE_HOURS} ч. "
        "Если вы не регистрировались на PowderBox, просто проигнорируйте это письмо.",
    )


security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access" or not payload.get("sub"):
            raise HTTPException(status_code=401, detail="Invalid token")
        user_id = int(payload["sub"])
    except (JWTError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        conn = await aio_pika.connect_robust(RABBITMQ_URL)
        ch = await conn.channel()
        exchange = await ch.declare_exchange(EVENTS_EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True)
        app.state.mq_conn = conn
        app.state.mq_exchange = exchange
    except Exception as e:
        logging.warning("RabbitMQ connection failed: %s", e)
        app.state.mq_conn = None
        app.state.mq_exchange = None

    yield

    if getattr(app.state, "mq_conn", None):
        await app.state.mq_conn.close()


app = FastAPI(title="Auth Service", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
setup_observability(app, service_name="auth-service")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "auth-service"}


@app.post("/auth/register", response_model=AuthTokens)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(select(User).where(User.email == data.email))
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email already registered")
        if len(data.password.encode("utf-8")) > 72:
            raise HTTPException(status_code=400, detail="Password too long")
        user = User(email=data.email, password_hash=hash_password(data.password))
        db.add(user)
        await db.flush()
        confirm_token = issue_confirm_token(user)
        tokens = await issue_token_pair(db, user)
        await db.commit()
        await db.refresh(user)
        await send_confirmation_email(user, confirm_token)
        return tokens
    except HTTPException:
        raise
    except Exception:
        logging.exception("Register failed")
        raise HTTPException(status_code=500, detail="Registration failed. Please try again.")


@app.post("/auth/login", response_model=AuthTokens)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    tokens = await issue_token_pair(db, user)
    await db.commit()
    return tokens


@app.post("/auth/refresh", response_model=AuthTokens)
async def refresh(data: RefreshRequest):
    try:
        payload = jwt.decode(data.refresh_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user_id = payload.get("sub")
        jti = payload.get("jti")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        if not jti:
            raise HTTPException(status_code=401, detail="Invalid token")
        async with async_session() as db:
            token_result = await db.execute(
                select(RefreshToken).where(
                    RefreshToken.token_hash == token_sha256(data.refresh_token),
                    RefreshToken.jti == str(jti),
                    RefreshToken.user_id == int(user_id),
                )
            )
            refresh_row = token_result.scalar_one_or_none()
            if not refresh_row or refresh_row.revoked_at is not None:
                raise HTTPException(status_code=401, detail="Refresh token revoked")
            if as_utc(refresh_row.expires_at) < datetime.now(timezone.utc):
                raise HTTPException(status_code=401, detail="Refresh token expired")

            result = await db.execute(select(User).where(User.id == int(user_id)))
            user = result.scalar_one_or_none()
            if not user:
                raise HTTPException(status_code=401, detail="User not found")

            refresh_row.revoked_at = datetime.now(timezone.utc)
            tokens = await issue_token_pair(db, user)
            await db.commit()
        return tokens
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")


@app.post("/auth/logout", response_model=LogoutResponse)
async def logout(data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    try:
        payload = jwt.decode(data.refresh_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            return LogoutResponse()
        user_id = payload.get("sub")
        jti = payload.get("jti")
        if not user_id or not jti:
            return LogoutResponse()

        result = await db.execute(
            select(RefreshToken).where(
                RefreshToken.token_hash == token_sha256(data.refresh_token),
                RefreshToken.jti == str(jti),
                RefreshToken.user_id == int(user_id),
            )
        )
        refresh_row = result.scalar_one_or_none()
        if refresh_row and refresh_row.revoked_at is None:
            refresh_row.revoked_at = datetime.now(timezone.utc)
            await db.commit()
        return LogoutResponse()
    except (JWTError, ValueError):
        return LogoutResponse()


@app.get("/auth/me", response_model=AuthMe)
async def auth_me(user: User = Depends(get_current_user)):
    return AuthMe(email=user.email, email_confirmed=user.email_confirmed)


@app.post("/auth/confirm", response_model=SuccessResponse)
async def confirm_email(data: ConfirmRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.confirm_token_hash == token_sha256(data.token)))
    user = result.scalar_one_or_none()
    if not user or not user.confirm_token_expires_at or as_utc(user.confirm_token_expires_at) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Ссылка недействительна или устарела")
    user.email_confirmed = True
    user.confirm_token_hash = None
    user.confirm_token_expires_at = None
    await db.commit()
    return SuccessResponse()


@app.post("/auth/change-email", response_model=SuccessResponse)
async def change_email(
    data: ChangeEmailRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный пароль")
    if data.new_email == user.email:
        raise HTTPException(status_code=400, detail="Это уже ваш текущий email")
    result = await db.execute(select(User).where(User.email == data.new_email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email уже занят")
    user.email = data.new_email
    user.email_confirmed = False
    token = issue_confirm_token(user)
    await db.commit()
    await send_confirmation_email(user, token)
    return SuccessResponse()


@app.post("/auth/resend-confirmation", response_model=SuccessResponse)
async def resend_confirmation(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if user.email_confirmed:
        raise HTTPException(status_code=400, detail="Email уже подтверждён")
    token = issue_confirm_token(user)
    await db.commit()
    await send_confirmation_email(user, token)
    return SuccessResponse()


# Внутренний эндпоинт для джоба снежных алертов (weather-service).
# Через gateway недостижим: /internal нет в PATH_TO_SERVICE.
@app.post("/internal/users/emails")
async def internal_user_emails(data: InternalEmailsRequest, db: AsyncSession = Depends(get_db)):
    if not data.ids:
        return {}
    result = await db.execute(select(User).where(User.id.in_(data.ids)))
    return {
        str(u.id): {"email": u.email, "confirmed": u.email_confirmed}
        for u in result.scalars().all()
    }
