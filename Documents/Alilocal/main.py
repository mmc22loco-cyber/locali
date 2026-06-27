"""
AliLocal — FastAPI Backend
Servidor principal con endpoints /match, /inquiries y /health.
"""

import asyncio
import os
import re
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from matching_engine import run_matching_pipeline, save_manual_request, debug_scraper
from deal_agent import run_agent_cycle, run_agent_forever, _load_deals, DEALS_FILE
from inquiry_service import (
    create_inquiry,
    get_all_inquiries,
    get_inquiry,
    update_inquiry_response,
    delete_inquiry,
    mark_expired_inquiries,
    dispatch_inquiry,
)

load_dotenv()

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Locali API",
    description="Compara precios de מחו״ל con tiendas locales israelies",
    version="0.3.0",
)


@app.on_event("startup")
async def startup_event():
    """Run one quick agent cycle on boot, then keep it running hourly."""
    asyncio.create_task(run_agent_forever(interval_minutes=60))

ALLOWED_ORIGINS = [
    "chrome-extension://*",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    # Vercel deployments
    "https://alilocal.vercel.app",
    "https://*.vercel.app",
    # Custom domain (update once you have one)
    os.getenv("FRONTEND_URL", ""),
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in ALLOWED_ORIGINS if o],
    allow_origin_regex=r"(https://.*\.vercel\.app|http://localhost:\d+|chrome-extension://.*)",
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


# ── Modelos ───────────────────────────────────────────────────────────────────

class MatchRequest(BaseModel):
    item_id: str = Field(..., description="ID del producto en AliExpress")
    title: str = Field(..., description="Titulo del producto")
    price_usd: float = Field(..., ge=0, description="Precio en USD")
    specs: dict = Field(default_factory=dict)
    user_lat: Optional[float] = None
    user_lng: Optional[float] = None
    image_url: str = Field(default="", description="URL de la imagen del producto")


class ManualRequestBody(BaseModel):
    item_id: str
    title: str
    price_usd: float
    user_lat: Optional[float] = None
    user_lng: Optional[float] = None


class InquiryRequest(BaseModel):
    store_name: str
    store_phone: str = ""
    store_email: str = ""
    store_website: str = ""
    product_title: str
    price_usd: float = 0.0
    image_url: str = ""
    expires_minutes: int = Field(default=120, ge=30, le=1440)


class RespondRequest(BaseModel):
    response_text: str


# ── Endpoints principales ─────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.3.0"}


@app.get("/api/deals")
async def get_deals(verdict: Optional[str] = None, limit: int = 20):
    """
    Returns published deals from the agent.
    ?verdict=local_cheaper|close_price|abroad_cheaper|not_found
    """
    deals = _load_deals()
    if verdict:
        deals = [d for d in deals if d.get("verdict") == verdict]
    return {"deals": deals[:limit], "total": len(deals)}


@app.post("/api/deals/refresh")
async def refresh_deals():
    """Trigger an immediate agent scan (useful to seed data on first run)."""
    asyncio.create_task(run_agent_cycle())
    return {"status": "ok", "message": "Deal scan started in background"}


@app.get("/api/debug-scraper")
async def debug_scraper_endpoint(q: str = "אוזניות אלחוטיות"):
    """Run scrapers against all stores and return raw diagnostic info.
    Open in browser: http://localhost:8000/api/debug-scraper?q=your+search
    """
    try:
        result = await debug_scraper(q)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/extract")
async def extract_product(url: str):
    """
    Extrae título, precio (USD) e imagen de cualquier URL de producto.
    Usado por la app Android: el usuario pega el link y la app llama aquí.
    """
    import json as _json
    import httpx as _httpx

    if not url.startswith("http"):
        raise HTTPException(status_code=400, detail="URL inválida")

    headers = {
        "User-Agent": ("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 "
                       "(KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36"),
        "Accept-Language": "he-IL,he;q=0.9,en;q=0.8",
    }
    try:
        async with _httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
            resp = await client.get(url, headers=headers)
            html = resp.text
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"No se pudo cargar la página: {e}")

    title, price_usd, image_url, currency = "", 0.0, "", ""

    # 1. JSON-LD Product
    for m in re.finditer(r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
                         html, re.DOTALL):
        try:
            data = _json.loads(m.group(1).strip())
        except Exception:
            continue
        candidates = data if isinstance(data, list) else data.get("@graph", [data]) if isinstance(data, dict) else []
        for d in candidates:
            if isinstance(d, dict) and d.get("@type") == "Product":
                title = d.get("name") or title
                img = d.get("image")
                if isinstance(img, list) and img:
                    img = img[0]
                if isinstance(img, str) and img.startswith("http"):
                    image_url = img
                offers = d.get("offers")
                offer = offers[0] if isinstance(offers, list) and offers else offers
                if isinstance(offer, dict):
                    raw = offer.get("price") or offer.get("lowPrice")
                    currency = offer.get("priceCurrency") or ""
                    try:
                        price_usd = float(raw)
                    except (TypeError, ValueError):
                        pass
                break
        if title:
            break

    # 2. Open Graph fallback
    if not title:
        m = re.search(r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)', html)
        if m:
            title = m.group(1)
    if not image_url:
        m = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)', html)
        if m:
            image_url = m.group(1)
    if not price_usd:
        m = re.search(r'<meta[^>]+property=["\'](?:product|og):price:amount["\'][^>]+content=["\']([\d.]+)', html)
        if m:
            try:
                price_usd = float(m.group(1))
            except ValueError:
                pass
            mc = re.search(r'<meta[^>]+property=["\'](?:product|og):price:currency["\'][^>]+content=["\']([A-Z]{3})', html)
            currency = mc.group(1) if mc else currency

    # 3. <title> como último recurso
    if not title:
        m = re.search(r'<title[^>]*>(.*?)</title>', html, re.DOTALL)
        title = m.group(1).strip()[:120] if m else ""

    if currency == "ILS" and price_usd:
        price_usd = round(price_usd / 3.75, 2)

    if not title:
        raise HTTPException(status_code=422, detail="No se pudo extraer el producto de esta página")

    return {"title": title.strip()[:150], "price_usd": price_usd, "image_url": image_url}


@app.post("/match")
async def match(req: MatchRequest):
    try:
        result = await run_matching_pipeline(
            item_id=req.item_id,
            title=req.title,
            price_usd=req.price_usd,
            specs=req.specs,
            user_lat=req.user_lat or 32.0853,
            user_lng=req.user_lng or 34.7818,
            image_url=req.image_url,
        )
        return result
    except Exception as e:
        print(f"[/match] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/manual-request")
async def manual_request(req: ManualRequestBody):
    supabase_url = os.getenv("SUPABASE_URL", "")
    supabase_key = os.getenv("SUPABASE_KEY", "")

    if not supabase_url or not supabase_key:
        print(f"[manual-request] Mock save: {req.title}")
        return {"status": "ok", "message": "Peticion guardada (mock)"}

    success = await save_manual_request(
        item_id=req.item_id,
        title=req.title,
        price_usd=req.price_usd,
        user_lat=req.user_lat or 0.0,
        user_lng=req.user_lng or 0.0,
        supabase_url=supabase_url,
        supabase_key=supabase_key,
    )
    if not success:
        raise HTTPException(status_code=503, detail="Error guardando peticion")
    return {"status": "ok", "message": "Peticion guardada"}


# ── Endpoints de Inquiries ────────────────────────────────────────────────────

@app.post("/inquiries")
async def create_inquiry_endpoint(req: InquiryRequest):
    """Crea una inquiry, la envia al negocio y la guarda."""
    mark_expired_inquiries()

    inquiry = create_inquiry(
        store_name=req.store_name,
        store_phone=req.store_phone,
        store_email=req.store_email,
        store_website=req.store_website,
        product_title=req.product_title,
        price_usd=req.price_usd,
        image_url=req.image_url,
        expires_minutes=req.expires_minutes,
    )

    # Intentar envio automatico (Twilio / SendGrid)
    dispatch_result = await dispatch_inquiry(inquiry)

    return {
        "status": "ok",
        "inquiry_id": inquiry["id"],
        "method": dispatch_result["method"],
        "wa_link": dispatch_result.get("wa_link"),
        "message": dispatch_result.get("message"),
        "sent_automatically": dispatch_result.get("sent", False),
    }


@app.get("/inquiries")
async def list_inquiries():
    """Lista todas las inquiries (para el buzon de la extension)."""
    mark_expired_inquiries()
    inquiries = get_all_inquiries()
    # No devolver el campo message completo para ahorrar bandwidth
    return [
        {k: v for k, v in inq.items() if k != "message"}
        for inq in inquiries
    ]


@app.post("/inquiries/{inquiry_id}/respond")
async def respond_to_inquiry(inquiry_id: str, req: RespondRequest):
    """Marca una inquiry como respondida (llamado manualmente o por webhook)."""
    ok = update_inquiry_response(inquiry_id, req.response_text)
    if not ok:
        raise HTTPException(status_code=404, detail="Inquiry no encontrada")
    return {"status": "ok"}


@app.delete("/inquiries/{inquiry_id}")
async def dismiss_inquiry(inquiry_id: str):
    """Elimina una inquiry del buzon."""
    ok = delete_inquiry(inquiry_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Inquiry no encontrada")
    return {"status": "ok"}


# ── Webhook Twilio (respuestas entrantes de negocios) ─────────────────────────

@app.post("/webhooks/twilio")
async def twilio_webhook(request: Request):
    """
    Recibe mensajes entrantes de WhatsApp via Twilio.
    Busca el ID de AliLocal en el mensaje y actualiza la inquiry.
    """
    form = await request.form()
    body = form.get("Body", "")
    from_number = form.get("From", "").replace("whatsapp:", "")

    print(f"[twilio-webhook] De {from_number}: {body[:100]}")

    # Buscar patron "#ID:XXXXXXXX" en la respuesta del negocio
    match = re.search(r"#(?:ID:)?([A-F0-9]{8})", body.upper())
    if match:
        inquiry_id = match.group(1)
        update_inquiry_response(inquiry_id, body.strip())
        print(f"[twilio-webhook] Respuesta registrada para inquiry {inquiry_id}")
    else:
        # Intentar por numero de telefono (ultima inquiry de ese negocio)
        inquiries = get_all_inquiries()
        for inq in reversed(inquiries):
            contact = inq.get("store_contact", "").replace("+", "").replace("-", "").replace(" ", "")
            from_clean = from_number.replace("+", "").replace("-", "").replace(" ", "")
            if contact and contact in from_clean and inq["status"] == "pending":
                update_inquiry_response(inq["id"], body.strip())
                print(f"[twilio-webhook] Respuesta por numero para inquiry {inq['id']}")
                break

    # Twilio espera respuesta TwiML vacia
    return {"status": "ok"}


# ── Entrypoint ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
