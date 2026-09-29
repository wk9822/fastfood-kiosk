import os
import random
import time
from datetime import datetime
from typing import List, Literal, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import firebase_admin
from firebase_admin import credentials, firestore


# ----- Test mode: Use Firestore Emulator (0 cloud reads, for development) -----
# Set FIRESTORE_EMULATOR_HOST=localhost:8080 before starting to use local emulator
# Start emulator: firebase emulators:start --only firestore
if os.getenv("FIRESTORE_EMULATOR_HOST"):
    print("[Test mode] Using Firestore Emulator (0 cloud reads)")


# Initialize Firebase / Firestore using a service account JSON path
service_account_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
if not service_account_path:
    raise RuntimeError(
        "FIREBASE_SERVICE_ACCOUNT_JSON environment variable is not set. "
        "Point it to your Firebase service account JSON file."
    )

if not firebase_admin._apps:
    cred = credentials.Certificate(service_account_path)
    firebase_admin.initialize_app(cred)

db = firestore.client()


app = FastAPI(title="Fastfood Kiosk API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ----- Models -----


class CustomizationOption(BaseModel):
    id: str
    name: str
    price: float = 0.0  # Additional price for this option


class Ingredient(BaseModel):
    name: str
    imageUrl: Optional[str] = None  # Optional photo for display


class MenuItem(BaseModel):
    id: str
    name: str
    price: float
    description: Optional[str] = None
    category: str
    imageUrl: str
    customizationOptions: Optional[List[CustomizationOption]] = []
    ingredients: Optional[List[Ingredient]] = []  # Display-only, staff can add name + optional photo


class OrderItem(BaseModel):
    menuItemId: str
    name: str
    selectedSize: str
    unitPrice: float
    quantity: int
    customizations: Optional[List[str]] = []  # List of selected customization option names


class Order(BaseModel):
    id: str
    items: List[OrderItem]
    status: Literal["preparing", "ready", "completed"]
    timestamp: str
    paymentMethod: str
    subtotal: float
    taxAmount: float
    total: float
    orderType: Optional[str] = "dine-in"  # "dine-in" or "take-away"
    readyTimestamp: Optional[str] = None


class OrderStatusUpdate(BaseModel):
    status: Literal["preparing", "ready", "completed"]
    readyTimestamp: Optional[str] = None


class CreateOrderRequest(BaseModel):
    """Order creation payload - id is generated server-side."""
    items: List[OrderItem]
    status: Literal["preparing", "ready", "completed"] = "preparing"
    timestamp: str
    paymentMethod: str
    subtotal: float
    taxAmount: float
    total: float
    orderType: Optional[str] = "dine-in"


class Settings(BaseModel):
    taxRate: float = 10.0
    logoUrl: Optional[str] = None


class SettingsUpdate(BaseModel):
    taxRate: Optional[float] = None
    logoUrl: Optional[str] = None


class CategoryAdd(BaseModel):
    name: str


class CategoryRename(BaseModel):
    oldName: str
    newName: str


# ----- Helpers -----


def _menu_collection():
    return db.collection("menu_item")


def _orders_collection():
    return db.collection("orders")


def _settings_doc():
    return db.collection("settings").document("global")


def _order_counters_collection():
    return db.collection("order_counters")


def _generate_next_order_id() -> str:
    """Generate order ID with random 0001-9999 per day, no repeats (resets at midnight)."""
    today_key = datetime.now().strftime("%Y%m%d")

    @firestore.transactional
    def _pick_random_unused(transaction):
        ref = _order_counters_collection().document(today_key)
        doc = ref.get(transaction=transaction)
        data = doc.to_dict() if doc.exists else {}
        used = data.get("used", {})  # {"1": True, "42": True, ...}

        if len(used) >= 9999:
            raise ValueError("Maximum orders per day (9999) reached")

        # Pick random until we find an unused number
        for _ in range(9999):
            n = random.randint(1, 9999)
            key = str(n)
            if key not in used:
                used[key] = True
                transaction.set(ref, {"used": used})
                return n
        raise ValueError("No available order number for today")

    transaction = db.transaction()
    seq = _pick_random_unused(transaction)
    return f"ORD-{today_key}-{seq:04d}"


def _categories_doc():
    return db.collection("categories").document("list")


# ----- In-memory cache (reduces Firestore reads; quota-friendly for Spark 50k/day) -----
_cache: dict = {}  # key -> (value, expiry_timestamp)
CACHE_MENU_TTL = 900      # 15 min - menu rarely changes
CACHE_SETTINGS_TTL = 900  # 15 min - settings rarely change
CACHE_CATEGORIES_TTL = 900  # 15 min - categories rarely change
CACHE_ORDERS_TTL = 60     # 1 min - kitchen needs relatively fresh data


def _cache_get(key: str, ttl: float, fetch_fn):
    """Return cached value if valid; else fetch, store, and return."""
    now = time.time()
    if key in _cache:
        val, expiry = _cache[key]
        if now < expiry:
            return val
    val = fetch_fn()
    _cache[key] = (val, now + ttl)
    return val


def _cache_invalidate(*keys: str) -> None:
    for k in keys:
        _cache.pop(k, None)


def _get_categories_list() -> List[str]:
    doc = _categories_doc().get()
    if not doc.exists:
        return []
    data = doc.to_dict() or {}
    return list(data.get("items") or [])


def _set_categories_list(items: List[str]) -> None:
    _categories_doc().set({"items": items})


# ----- Menu endpoints -----


def _parse_customization_options(data: dict) -> List[CustomizationOption]:
    raw = data.get("customizationOptions") or []
    opts: List[CustomizationOption] = []
    for opt in raw:
        if isinstance(opt, dict):
            opts.append(
                CustomizationOption(
                    id=str(opt.get("id", "")),
                    name=str(opt.get("name", "")),
                    price=float(opt.get("price", 0)),
                )
            )
    return opts


def _parse_ingredients(data: dict) -> List[Ingredient]:
    raw = data.get("ingredients") or []
    result: List[Ingredient] = []
    for x in raw:
        if isinstance(x, str) and x.strip():
            result.append(Ingredient(name=x.strip(), imageUrl=None))
        elif isinstance(x, dict) and x.get("name"):
            result.append(Ingredient(name=str(x["name"]), imageUrl=x.get("imageUrl")))
    return result


def _fetch_menu_from_db() -> List[dict]:
    docs = _menu_collection().stream()
    items: List[dict] = []
    for doc in docs:
        data = doc.to_dict() or {}
        data_id = data.get("id") or doc.id
        items.append(
            MenuItem(
                id=data_id,
                name=data["name"],
                price=float(data["price"]),
                description=data.get("description"),
                category=data["category"],
                imageUrl=data.get("imageUrl") or "",
                customizationOptions=_parse_customization_options(data),
                ingredients=_parse_ingredients(data),
            ).dict()
        )
    return items


@app.get("/menu", response_model=List[MenuItem])
def get_menu() -> List[MenuItem]:
    raw = _cache_get("menu", CACHE_MENU_TTL, _fetch_menu_from_db)
    return [MenuItem(**x) for x in raw]


@app.post("/admin/menu-items", response_model=MenuItem)
def create_menu_item(item: MenuItem) -> MenuItem:
    _menu_collection().document(item.id).set(item.dict())
    _cache_invalidate("menu", "categories")
    return item


@app.delete("/admin/menu-items/{item_id}")
def delete_menu_item(item_id: str):
    doc_ref = _menu_collection().document(item_id)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Menu item not found")
    doc_ref.delete()
    _cache_invalidate("menu", "categories")
    return {"detail": "Deleted"}


@app.put("/admin/menu-items/{item_id}", response_model=MenuItem)
def update_menu_item(item_id: str, item: MenuItem) -> MenuItem:
    if item_id != item.id:
        raise HTTPException(status_code=400, detail="Item ID mismatch")
    doc_ref = _menu_collection().document(item_id)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Menu item not found")
    doc_ref.set(item.dict())
    _cache_invalidate("menu", "categories")
    return item


# ----- Categories endpoints -----


def _fetch_categories_from_db() -> List[str]:
    return _get_categories_list()


@app.get("/categories", response_model=List[str])
def get_categories() -> List[str]:
    return _cache_get("categories", CACHE_CATEGORIES_TTL, _fetch_categories_from_db)


@app.post("/admin/categories", response_model=List[str])
def add_category(body: CategoryAdd) -> List[str]:
    name = body.name.strip().lower()
    if not name:
        raise HTTPException(status_code=400, detail="Category name is required")
    items = _get_categories_list()
    if name in items:
        raise HTTPException(status_code=400, detail="Category already exists")
    items.append(name)
    _set_categories_list(items)
    _cache_invalidate("menu", "categories")
    return items


@app.delete("/admin/categories/{category_name}", response_model=List[str])
def delete_category(category_name: str, delete_items: bool = True) -> List[str]:
    name = category_name.strip().lower()
    items = _get_categories_list()
    if name not in items:
        raise HTTPException(status_code=404, detail="Category not found")
    if delete_items:
        for doc in _menu_collection().stream():
            data = doc.to_dict() or {}
            if data.get("category") == name:
                doc.reference.delete()
    items = [c for c in items if c != name]
    _set_categories_list(items)
    _cache_invalidate("menu", "categories")
    return items


@app.patch("/admin/categories/rename", response_model=List[str])
def rename_category(body: CategoryRename) -> List[str]:
    old_name = body.oldName.strip().lower()
    new_name = body.newName.strip().lower()
    if not new_name:
        raise HTTPException(status_code=400, detail="New name is required")
    items = _get_categories_list()
    if old_name not in items:
        raise HTTPException(status_code=404, detail="Category not found")
    if new_name in items and new_name != old_name:
        raise HTTPException(status_code=400, detail="Target category name already exists")
    items = [new_name if c == old_name else c for c in items]
    _set_categories_list(items)
    for doc in _menu_collection().stream():
        data = doc.to_dict() or {}
        if data.get("category") == old_name:
            doc.reference.update({"category": new_name})
    _cache_invalidate("menu", "categories")
    return items


# ----- Settings endpoints -----


def _fetch_settings_from_db() -> dict:
    doc = _settings_doc().get()
    if not doc.exists:
        return Settings().dict()
    data = doc.to_dict() or {}
    return Settings(
        taxRate=float(data.get("taxRate", 10.0)),
        logoUrl=data.get("logoUrl"),
    ).dict()


@app.get("/settings", response_model=Settings)
def get_settings() -> Settings:
    raw = _cache_get("settings", CACHE_SETTINGS_TTL, _fetch_settings_from_db)
    return Settings(**raw)


@app.put("/settings", response_model=Settings)
def update_settings(settings: Settings) -> Settings:
    _settings_doc().set(settings.dict())
    _cache_invalidate("settings")
    return settings


@app.patch("/settings", response_model=Settings)
def patch_settings(update: SettingsUpdate) -> Settings:
    """Update only provided fields (e.g. logoUrl only)."""
    doc_ref = _settings_doc()
    doc = doc_ref.get()
    data = doc.to_dict() if doc.exists else {}
    if update.taxRate is not None:
        data["taxRate"] = update.taxRate
    if update.logoUrl is not None:
        data["logoUrl"] = update.logoUrl
    doc_ref.set(data)
    _cache_invalidate("settings")
    return Settings(
        taxRate=float(data.get("taxRate", 10.0)),
        logoUrl=data.get("logoUrl"),
    )


# ----- Orders endpoints -----


def _fetch_orders_from_db() -> List[dict]:
    docs = _orders_collection().stream()
    orders: List[dict] = []
    for doc in docs:
        data = doc.to_dict() or {}
        data_id = data.get("id") or doc.id
        orders.append(Order(**{**data, "id": data_id}).dict())
    return orders


@app.post("/orders", response_model=Order)
def create_order(req: CreateOrderRequest) -> Order:
    try:
        order_id = _generate_next_order_id()
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    order = Order(
        id=order_id,
        items=req.items,
        status=req.status,
        timestamp=req.timestamp,
        paymentMethod=req.paymentMethod,
        subtotal=req.subtotal,
        taxAmount=req.taxAmount,
        total=req.total,
        orderType=req.orderType,
        readyTimestamp=None,
    )
    _orders_collection().document(order.id).set(order.dict())
    _cache_invalidate("orders")
    return order


@app.get("/orders", response_model=List[Order])
def list_orders(status: Optional[str] = None) -> List[Order]:
    raw = _cache_get("orders", CACHE_ORDERS_TTL, _fetch_orders_from_db)
    orders = [Order(**x) for x in raw]
    if status:
        orders = [o for o in orders if o.status == status]
    return orders


@app.get("/orders/{order_id}", response_model=Order)
def get_order(order_id: str) -> Order:
    raw = _cache_get("orders", CACHE_ORDERS_TTL, _fetch_orders_from_db)
    for x in raw:
        if x.get("id") == order_id:
            return Order(**x)
    doc = _orders_collection().document(order_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Order not found")
    data = doc.to_dict() or {}
    data_id = data.get("id") or order_id
    return Order(**{**data, "id": data_id})


@app.patch("/orders/{order_id}/status", response_model=Order)
def update_order_status(order_id: str, body: OrderStatusUpdate) -> Order:
    doc_ref = _orders_collection().document(order_id)
    snapshot = doc_ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Order not found")

    updates = {"status": body.status}
    if body.readyTimestamp:
        updates["readyTimestamp"] = body.readyTimestamp

    doc_ref.update(updates)
    _cache_invalidate("orders")
    updated = doc_ref.get().to_dict() or {}
    updated_id = updated.get("id") or order_id
    return Order(**{**updated, "id": updated_id})


@app.get("/")
def root():
    return {"status": "ok", "message": "Fastfood kiosk API"}

