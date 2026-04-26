from datetime import datetime
from pydantic import BaseModel, ConfigDict
from typing import Literal


ActivityType = Literal["photo", "video", "track"]


class ActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    type: str
    description: str | None
    created_at: datetime


class ActivityCreate(BaseModel):
    type: ActivityType
    description: str | None = None
