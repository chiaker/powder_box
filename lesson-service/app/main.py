from contextlib import asynccontextmanager
import asyncio
import json
import re
from urllib.parse import urlparse
from urllib.request import urlopen

from fastapi import FastAPI, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, Base, engine
from app.models import Lesson
from app.schemas import LessonOut, LessonCreate, LessonUpdate


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed sample lessons if empty
    from app.database import async_session
    async with async_session() as db:
        result = await db.execute(select(Lesson))
        if not result.scalars().first():
            for title, cat, url in [
                ("Базовая стойка на сноуборде", "snowboard", "https://youtube.com/watch?v=example1"),
                ("Карвинг для начинающих", "ski", "https://youtube.com/watch?v=example2"),
                ("Как не бояться бугеля", "ski", "https://youtube.com/watch?v=example3"),
            ]:
                db.add(Lesson(title=title, category=cat, lesson_url=url))
            await db.commit()
    yield


app = FastAPI(title="Lesson Service", version="1.0.0", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "lesson-service"}


def extract_rutube_video_id(lesson_url: str) -> str | None:
    try:
        parsed = urlparse(lesson_url)
        if "rutube.ru" not in parsed.netloc.lower():
            return None
        path_parts = [p for p in parsed.path.split("/") if p]
        for idx, part in enumerate(path_parts):
            if part == "video" and idx + 1 < len(path_parts):
                return path_parts[idx + 1]
    except Exception:
        pass

    match = re.search(r"rutube\.ru/video/([a-zA-Z0-9]+)", lesson_url)
    return match.group(1) if match else None


def _fetch_rutube_preview_sync(video_id: str) -> str | None:
    try:
        with urlopen(f"https://rutube.ru/api/video/{video_id}/?format=json", timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return data.get("thumbnail_url") or data.get("preview_url") or data.get("rutube_poster")
    except Exception:
        return None


async def get_rutube_preview_url(lesson_url: str) -> str | None:
    video_id = extract_rutube_video_id(lesson_url)
    if not video_id:
        return None
    return await asyncio.to_thread(_fetch_rutube_preview_sync, video_id)


async def serialize_lesson(lesson: Lesson) -> LessonOut:
    out = LessonOut.model_validate(lesson)
    out.preview_url = await get_rutube_preview_url(lesson.lesson_url)
    return out


@app.get("/lessons", response_model=list[LessonOut])
async def list_lessons(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    category: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(Lesson)
    if category:
        q = q.where(Lesson.category == category)
    q = q.offset(skip).limit(limit)
    result = await db.execute(q)
    lessons = result.scalars().all()
    return await asyncio.gather(*(serialize_lesson(lesson) for lesson in lessons))


@app.get("/lessons/{lesson_id}", response_model=LessonOut)
async def get_lesson(lesson_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Lesson).where(Lesson.id == lesson_id))
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return await serialize_lesson(lesson)


@app.post("/lessons", response_model=LessonOut)
async def create_lesson(data: LessonCreate, db: AsyncSession = Depends(get_db)):
    lesson = Lesson(
        title=data.title,
        category=data.category,
        lesson_url=data.lesson_url,
        instructor_id=data.instructor_id,
    )
    db.add(lesson)
    await db.commit()
    await db.refresh(lesson)
    return await serialize_lesson(lesson)


@app.patch("/lessons/{lesson_id}", response_model=LessonOut)
async def update_lesson(lesson_id: int, data: LessonUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Lesson).where(Lesson.id == lesson_id))
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(lesson, k, v)
    await db.commit()
    await db.refresh(lesson)
    return await serialize_lesson(lesson)


@app.delete("/lessons/{lesson_id}", status_code=204)
async def delete_lesson(lesson_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Lesson).where(Lesson.id == lesson_id))
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    await db.delete(lesson)
    await db.commit()
