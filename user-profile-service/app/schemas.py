from pydantic import BaseModel
from typing import Literal


Level = Literal["beginner", "intermediate", "advanced"]
EquipmentType = Literal["ski", "snowboard"]


class UserProfile(BaseModel):
    user_id: str
    nickname: str | None = None
    level: Level | None = None
    equipment_type: EquipmentType | None = None
    favorite_resorts: list[str] = []
    total_distance: float = 0.0
    total_descent: float = 0.0


class UserProfileUpdate(BaseModel):
    nickname: str | None = None
    level: Level | None = None
    equipment_type: EquipmentType | None = None
    favorite_resorts: list[str] | None = None
