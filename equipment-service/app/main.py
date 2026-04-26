import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user_id
from app.database import get_db, Base, engine
from app.models import EquipmentCategory, EquipmentItem
from app.schemas import (
    EquipmentCategoryOut, EquipmentCategoryCreate,
    EquipmentItemOut, EquipmentItemCreate, EquipmentItemUpdate,
)

STATIC_DIR = Path(__file__).resolve().parent.parent / "static" / "equipment"
STATIC_DIR.mkdir(parents=True, exist_ok=True)


async def _add_column(conn, table: str, column: str, col_type: str):
    try:
        await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
    except Exception:
        pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _add_column(conn, "equipment_items", "owner_id", "INTEGER")
        await _add_column(conn, "equipment_items", "image_url", "VARCHAR(500)")
        await _add_column(conn, "equipment_items", "address", "VARCHAR(500)")
        await _add_column(conn, "equipment_items", "price_per_day", "FLOAT")
        await _add_column(conn, "equipment_items", "condition", "VARCHAR(20)")
        await _add_column(conn, "equipment_items", "equipment_type", "VARCHAR(20)")
    yield


app = FastAPI(title="Equipment Service", version="1.0.0", lifespan=lifespan)

app.mount("/equipment-static", StaticFiles(directory=str(STATIC_DIR.parent)), name="equipment-static")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "equipment-service"}


@app.get("/equipment/categories", response_model=list[EquipmentCategoryOut])
async def list_categories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(EquipmentCategory))
    return [EquipmentCategoryOut.model_validate(c) for c in result.scalars().all()]


@app.get("/equipment/items", response_model=list[EquipmentItemOut])
async def list_items(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    category_id: int | None = None,
    owner_id: int | None = None,
    equipment_type: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(EquipmentItem)
    if category_id is not None:
        q = q.where(EquipmentItem.category_id == category_id)
    if owner_id is not None:
        q = q.where(EquipmentItem.owner_id == owner_id)
    if equipment_type is not None:
        q = q.where(EquipmentItem.equipment_type == equipment_type)
    q = q.order_by(EquipmentItem.id.desc()).offset(skip).limit(limit)
    result = await db.execute(q)
    return [EquipmentItemOut.model_validate(i) for i in result.scalars().all()]


@app.get("/equipment/items/{item_id}", response_model=EquipmentItemOut)
async def get_item(item_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(EquipmentItem).where(EquipmentItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return EquipmentItemOut.model_validate(item)


@app.post("/equipment/upload")
async def upload_image(
    file: UploadFile = File(...),
    _: int = Depends(get_current_user_id),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only images allowed")
    ext = Path(file.filename or "img").suffix or ".jpg"
    if ext.lower() not in (".jpg", ".jpeg", ".png", ".gif", ".webp"):
        ext = ".jpg"
    name = f"{uuid.uuid4().hex}{ext}"
    path = STATIC_DIR / name
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")
    path.write_bytes(content)
    return {"image_url": f"/equipment-static/equipment/{name}"}


@app.post("/equipment/categories", response_model=EquipmentCategoryOut)
async def create_category(data: EquipmentCategoryCreate, db: AsyncSession = Depends(get_db)):
    cat = EquipmentCategory(name=data.name)
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return EquipmentCategoryOut.model_validate(cat)


@app.post("/equipment/items", response_model=EquipmentItemOut)
async def create_item(
    data: EquipmentItemCreate,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    item = EquipmentItem(
        name=data.name,
        description=data.description,
        category_id=data.category_id,
        price=data.price,
        owner_id=user_id,
        image_url=data.image_url,
        address=data.address,
        price_per_day=data.price_per_day,
        condition=data.condition,
        equipment_type=data.equipment_type,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return EquipmentItemOut.model_validate(item)


@app.patch("/equipment/items/{item_id}", response_model=EquipmentItemOut)
async def update_item(
    item_id: int,
    data: EquipmentItemUpdate,
    request: Request,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(EquipmentItem).where(EquipmentItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    is_admin = request.headers.get("X-Is-Admin") == "true"
    if not is_admin and item.owner_id is not None and item.owner_id != user_id:
        raise HTTPException(status_code=403, detail="Not your listing")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    await db.commit()
    await db.refresh(item)
    return EquipmentItemOut.model_validate(item)


@app.delete("/equipment/items/{item_id}", status_code=204)
async def delete_item(
    item_id: int,
    request: Request,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(EquipmentItem).where(EquipmentItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    is_admin = request.headers.get("X-Is-Admin") == "true"
    if not is_admin and item.owner_id is not None and item.owner_id != user_id:
        raise HTTPException(status_code=403, detail="Not your listing")
    await db.delete(item)
    await db.commit()
