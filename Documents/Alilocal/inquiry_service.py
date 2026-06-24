"""
AliLocal — Inquiry Service
Envia consultas a tiendas locales via WhatsApp/Email y gestiona respuestas.
"""

import os
import json
import uuid
import urllib.parse
import asyncio
import httpx
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

INQUIRIES_FILE = Path(__file__).parent / "inquiries.json"


# ── Persistencia local ────────────────────────────────────────────────────────

def _load_inquiries() -> list[dict]:
    try:
        return json.loads(INQUIRIES_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def _save_inquiries(data: list[dict]) -> None:
    INQUIRIES_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def get_all_inquiries() -> list[dict]:
    return _load_inquiries()


def get_inquiry(inquiry_id: str) -> Optional[dict]:
    for inq in _load_inquiries():
        if inq["id"] == inquiry_id:
            return inq
    return None


def create_inquiry(
    store_name: str,
    store_phone: str,
    store_email: str,
    store_website: str,
    product_title: str,
    price_usd: float,
    image_url: str,
    expires_minutes: int,
) -> dict:
    inquiry_id = str(uuid.uuid4())[:8].upper()
    now = datetime.now(timezone.utc)
    expires_at = now.timestamp() + expires_minutes * 60

    # Determinar canal preferido
    if store_phone:
        contact_type = "whatsapp"
        store_contact = store_phone
    elif store_email:
        contact_type = "email"
        store_contact = store_email
    else:
        contact_type = "web"
        store_contact = store_website

    message = build_hebrew_message(
        product_title, price_usd, image_url, inquiry_id, expires_minutes
    )

    # Generar link de WhatsApp (siempre, como fallback para modo mock)
    wa_link = None
    if store_phone:
        phone_clean = store_phone.replace("+", "").replace("-", "").replace(" ", "")
        wa_link = f"https://wa.me/{phone_clean}?text={urllib.parse.quote(message)}"

    inquiry = {
        "id": inquiry_id,
        "store_name": store_name,
        "store_contact": store_contact,
        "contact_type": contact_type,
        "product_title": product_title,
        "price_usd": price_usd,
        "image_url": image_url,
        "created_at": now.isoformat(),
        "expires_at": expires_at,
        "expires_minutes": expires_minutes,
        "status": "pending",
        "response_text": None,
        "wa_link": wa_link,
        "message": message,
    }

    inquiries = _load_inquiries()
    inquiries.append(inquiry)
    _save_inquiries(inquiries)
    return inquiry


def update_inquiry_response(inquiry_id: str, response_text: str) -> bool:
    inquiries = _load_inquiries()
    for inq in inquiries:
        if inq["id"] == inquiry_id:
            inq["status"] = "answered"
            inq["response_text"] = response_text
            inq["answered_at"] = datetime.now(timezone.utc).isoformat()
            _save_inquiries(inquiries)
            return True
    return False


def mark_expired_inquiries() -> int:
    """Marca como expiradas las inquiries cuyo timer vencio. Devuelve cuantas."""
    now = datetime.now(timezone.utc).timestamp()
    inquiries = _load_inquiries()
    count = 0
    for inq in inquiries:
        if inq["status"] == "pending" and inq.get("expires_at", 0) < now:
            inq["status"] = "expired"
            count += 1
    if count:
        _save_inquiries(inquiries)
    return count


def delete_inquiry(inquiry_id: str) -> bool:
    inquiries = _load_inquiries()
    new_list = [i for i in inquiries if i["id"] != inquiry_id]
    if len(new_list) < len(inquiries):
        _save_inquiries(new_list)
        return True
    return False


# ── Mensaje en hebreo ─────────────────────────────────────────────────────────

def build_hebrew_message(
    product_title: str,
    price_usd: float,
    image_url: str,
    inquiry_id: str,
    expires_minutes: int,
) -> str:
    hours = expires_minutes // 60
    if hours >= 24:
        time_str = f"{hours // 24} ימים"
    elif hours >= 1:
        time_str = f"{hours} שעות"
    else:
        time_str = f"{expires_minutes} דקות"

    lines = [
        "שלום,",
        "",
        "מצאתי מוצר ב-AliExpress ורוצה לדעת אם יש לכם מוצר זהה או דומה:",
        "",
        f"📦 {product_title}",
        f"💰 מחיר AliExpress: ${price_usd:.2f}",
    ]
    if image_url:
        lines.append(f"🖼 {image_url}")
    lines += [
        "",
        f"אנא ענו תוך {time_str} עם מחיר וזמינות.",
        "",
        "תודה רבה! 🙏",
        f"(AliLocal #{inquiry_id})",
    ]
    return "\n".join(lines)


# ── Envio via Twilio (WhatsApp) ───────────────────────────────────────────────

async def send_via_twilio(
    to_phone: str,
    message: str,
    twilio_sid: str,
    twilio_auth: str,
    from_phone: str,
) -> bool:
    url = f"https://api.twilio.com/2010-04-01/Accounts/{twilio_sid}/Messages.json"
    phone = "+" + to_phone.lstrip("+").replace("-", "").replace(" ", "")
    data = {
        "From": f"whatsapp:{from_phone}",
        "To": f"whatsapp:{phone}",
        "Body": message,
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            resp = await http.post(url, data=data, auth=(twilio_sid, twilio_auth))
            resp.raise_for_status()
        return True
    except Exception as e:
        print(f"[twilio] Error enviando a {to_phone}: {e}")
        return False


# ── Envio via SendGrid (Email) ────────────────────────────────────────────────

async def send_via_sendgrid(
    to_email: str,
    product_title: str,
    message: str,
    sendgrid_key: str,
    from_email: str,
) -> bool:
    url = "https://api.sendgrid.com/v3/mail/send"
    headers = {
        "Authorization": f"Bearer {sendgrid_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "personalizations": [{"to": [{"email": to_email}]}],
        "from": {"email": from_email, "name": "AliLocal"},
        "reply_to": {"email": from_email},
        "subject": f"שאילתת מוצר: {product_title[:60]}",
        "content": [{"type": "text/plain", "value": message}],
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            resp = await http.post(url, json=payload, headers=headers)
            resp.raise_for_status()
        return True
    except Exception as e:
        print(f"[sendgrid] Error enviando a {to_email}: {e}")
        return False


# ── Dispatcher principal ──────────────────────────────────────────────────────

async def dispatch_inquiry(inquiry: dict) -> dict:
    """
    Envia la inquiry via el canal configurado.
    Si no hay API keys, devuelve el wa_link para envio manual.
    """
    twilio_sid = os.getenv("TWILIO_ACCOUNT_SID", "")
    twilio_auth = os.getenv("TWILIO_AUTH_TOKEN", "")
    twilio_from = os.getenv("TWILIO_WHATSAPP_FROM", "")
    sendgrid_key = os.getenv("SENDGRID_API_KEY", "")
    sendgrid_from = os.getenv("SENDGRID_FROM_EMAIL", "")

    contact_type = inquiry["contact_type"]
    contact = inquiry["store_contact"]
    message = inquiry["message"]
    product_title = inquiry["product_title"]

    # Modo WhatsApp con Twilio
    if contact_type == "whatsapp" and twilio_sid and twilio_auth and twilio_from:
        sent = await send_via_twilio(contact, message, twilio_sid, twilio_auth, twilio_from)
        return {"sent": sent, "method": "twilio", "wa_link": inquiry.get("wa_link")}

    # Modo Email con SendGrid
    if contact_type == "email" and sendgrid_key and sendgrid_from:
        sent = await send_via_sendgrid(contact, product_title, message, sendgrid_key, sendgrid_from)
        return {"sent": sent, "method": "sendgrid", "wa_link": inquiry.get("wa_link")}

    # Modo mock: devolver wa_link para envio manual
    print(f"[inquiry] Modo mock — wa_link generado para {inquiry['store_name']}")
    return {
        "sent": False,
        "method": "mock",
        "wa_link": inquiry.get("wa_link"),
        "message": message,
    }
