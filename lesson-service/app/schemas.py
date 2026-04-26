from pydantic import BaseModel, ConfigDict
from typing import Literal


LessonCategory = Literal["snowboard", "ski", "freestyle", "safety"]


class LessonOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    category: str | None
    lesson_url: str
    instructor_id: int | None
    preview_url: str | None = None


class LessonCreate(BaseModel):
    title: str
    category: str | None = None
    lesson_url: str
    instructor_id: int | None = None


class LessonUpdate(BaseModel):
    title: str | None = None
    category: str | None = None
    lesson_url: str | None = None
    instructor_id: int | None = None
