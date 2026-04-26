from pydantic import BaseModel, ConfigDict


class EquipmentCategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str


class EquipmentCategoryCreate(BaseModel):
    name: str


class EquipmentItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: str | None
    category_id: int | None
    price: float | None
    owner_id: int | None
    image_url: str | None
    address: str | None
    price_per_day: float | None
    condition: str | None
    equipment_type: str | None


class EquipmentItemCreate(BaseModel):
    name: str
    description: str | None = None
    category_id: int | None = None
    price: float | None = None
    image_url: str | None = None
    address: str | None = None
    price_per_day: float | None = None
    condition: str | None = None
    equipment_type: str | None = None


class EquipmentItemUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    category_id: int | None = None
    price: float | None = None
    image_url: str | None = None
    address: str | None = None
    price_per_day: float | None = None
    condition: str | None = None
    equipment_type: str | None = None
