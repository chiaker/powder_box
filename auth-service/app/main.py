import os
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from contextlib import asynccontextmanager

import bcrypt
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, async_session
from app.models import User, RefreshToken
from app.schemas import RegisterRequest, LoginRequest, AuthTokens, RefreshRequest, LogoutResponse


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-key")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
REFRESH_TOKEN_EXPIRE = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))


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
    access_token = create_access_token({"sub": str(user.id), "email": user.email})
    refresh_token = create_refresh_token({"sub": str(user.id)})
    await persist_refresh_token(db, user.id, refresh_token)
    return AuthTokens(access_token=access_token, refresh_token=refresh_token)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Схема БД управляется через Alembic (alembic upgrade head).
    yield


app = FastAPI(title="Auth Service", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


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
        tokens = await issue_token_pair(db, user)
        await db.commit()
        await db.refresh(user)
        return tokens
    except HTTPException:
        raise
    except Exception as e:
        import logging
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

            # Ротация: текущий refresh токен отзывается и выдаётся новый.
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
        # Logout должен быть идемпотентным: очищаем клиент даже при плохом токене.
        return LogoutResponse()
