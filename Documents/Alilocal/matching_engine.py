"""
AliLocal — Matching Engine
"""

import os
import re
import json
import math
import asyncio
import httpx
from typing import Optional
from urllib.parse import quote
from anthropic import AsyncAnthropic


def _haversine_km(lat1, lon1, lat2, lon2):
    """Distancia en km entre dos puntos GPS."""
    R = 6371
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

# ─── Constantes ────────────────────────────────────────────────────────────────

USD_TO_ILS = 3.75
VAT_THRESHOLD_LOW = 75
VAT_THRESHOLD_HIGH = 500
VAT_RATE = 0.18


# ─── Cálculo de costo real ─────────────────────────────────────────────────────

def calculate_real_cost(price_usd: float) -> dict:
    price_ils = round(price_usd * USD_TO_ILS, 2)
    if price_usd <= VAT_THRESHOLD_LOW:
        vat = 0.0
        vat_applies = False
    elif price_usd <= VAT_THRESHOLD_HIGH:
        vat = round(price_ils * VAT_RATE, 2)
        vat_applies = True
    else:
        vat = round(price_ils * VAT_RATE, 2)
        vat_applies = True
    return {
        "aliexpress_price_usd": price_usd,
        "aliexpress_price_ils": price_ils,
        "vat_applies": vat_applies,
        "vat_amount_ils": vat,
        "total_cost_ils": round(price_ils + vat, 2),
        "shipping_days_estimate": 18,
    }


# ─── Extracción de identidad con Claude Haiku ──────────────────────────────────

async def extract_product_identity(title: str, specs: dict, client: AsyncAnthropic, image_url: str = "") -> dict:
    prompt = f"""You are a product search expert for Israeli stores.
Analyze this AliExpress product and return a JSON with search strategy for Israeli stores.

IMPORTANT: If a product image is provided, treat it as the PRIMARY signal — AliExpress titles
are often SEO keyword spam and unreliable. Read any visible brand logos, model codes or text in
the image to identify the real product. Use the title only to confirm or fill gaps.

Return ONLY a JSON object with these exact fields:
{{
  "brand": "brand name or empty string",
  "model": "model name or empty string",
  "model_code": "alphanumeric model code or empty string",
  "category_he": "product category in Hebrew (2-3 words max)",
  "category_type": "electronics|computers|phones|tools|automotive|clothing|home|toys|collectibles|sports|health|other",
  "is_branded": true/false,
  "confidence": 0.0 to 1.0,
  "search_query": "best single search query",
  "search_queries": ["query1", "query2", "query3"],
  "relevant_stores": ["ksp","bug","ivory","zap"]
}}

Product title: {title}
Specs: {json.dumps(specs, ensure_ascii=False)}

Rules for search_queries (specific → generic → adapt to category):
- query1: most specific (brand + model code if known): "Sony WH-1000XM5", "Samsung Galaxy S24"
- query2: brand + Hebrew category: "אוזניות Sony", "מקדחה Bosch"
- query3: Hebrew category only, stripped of brand/model: "אוזניות מבטלות רעש", "מקדחה אלחוטית"
  → If category_type is NOT electronics/computers/phones/tools, query3 = most generic Hebrew term for the category
  → ALWAYS translate to Hebrew by query3, NEVER use English words in query3

Rules for relevant_stores (return ALL that could plausibly carry the product — be generous,
list 4-6 stores; ALWAYS include "zap" because it is a price-comparison aggregator covering
nearly every category in Israel; NEVER return an empty list):
- electronics/computers/phones: ["ksp","bug","ivory","zap"]
- tools/hardware: ["ace","home_center","ksp","zap"]
- home/kitchen/furniture/garden: ["ace","home_center","ikea","zap"]
- toys/baby/kids/action figures: ["toys_r_us","megatoy","zap","ace"]
- collectibles/figurines/models/anime: ["toys_r_us","megatoy","zap"]
- sports/outdoor/fitness: ["decathlon","zap","ace"]
- health/beauty/pharmacy: ["super_pharm","zap"]
- clothing/fashion/textile: ["termoshop","zap"]
- automotive/car accessories: ["zap","ace","ksp"]
- other/unknown: ["zap","ace","home_center","ksp"] (broad coverage — let the user choose)

Additional rules:
- NEVER include in queries: year, color, quantity words, "New", "2024", seller spam
- search_query = query1
- Return ONLY the JSON, no explanation

Examples:
title: "Short Plush White Zebra Car Seat Covers" →
  category_type: "automotive", relevant_stores: ["zap","ace","ksp"],
  queries: ["כיסויי מושבים זברה", "כיסויי מושבים לרכב", "אביזרי רכב"]
title: "Colorful 6 Styles Glitter Dumpling Squishy Stress Relief Toy" →
  category_type: "toys", relevant_stores: ["toys_r_us","megatoy","zap","ace"],
  queries: ["כדור לחיצה נצנצים", "צעצוע לחיצה סקוויש", "צעצועי לחץ"]
title: "Sony WH-1000XM5 Wireless Noise Canceling Headphones" →
  category_type: "electronics", relevant_stores: ["ksp","bug","ivory","zap"],
  queries: ["Sony WH-1000XM5", "אוזניות Sony", "אוזניות מבטלות רעש"]
title: "Xiaomi Redmi Note 13 Pro 5G 256GB NFC" →
  category_type: "phones", relevant_stores: ["ksp","bug","ivory","zap"],
  queries: ["Xiaomi Redmi Note 13 Pro", "סמארטפון Xiaomi", "סמארטפון 5G"]
title: "RGB Gaming Mouse 7200DPI Wired USB" →
  category_type: "computers", relevant_stores: ["ksp","bug","ivory","zap"],
  queries: ["עכבר גיימינג RGB", "עכבר גיימינג", "עכבר מחשב"]
title: "Women Summer Casual Floral Dress" →
  category_type: "clothing", relevant_stores: ["termoshop","zap"],
  queries: ["שמלת קיץ פרחונית", "שמלה קז'ואל", "שמלת נשים"]
title: "Comics Avengers Iron Man Spider-Man Desktop Decoration Model Children Toys Birthday" →
  category_type: "toys", relevant_stores: ["toys_r_us","megatoy","zap","ace"],
  queries: ["דמויות אוונג'רס איירון מן", "דמויות גיבורי על", "צעצועי גיבורי על"]
title: "Yoga Mat Non Slip Fitness Exercise" →
  category_type: "sports", relevant_stores: ["decathlon","zap","ace"],
  queries: ["מזרן יוגה", "מזרן כושר", "ציוד כושר"]
title: "Stainless Steel Kitchen Knife Set with Block" →
  category_type: "home", relevant_stores: ["ace","home_center","ikea","zap"],
  queries: ["סט סכינים למטבח", "סכיני מטבח", "כלי מטבח"]"""

    # Build content blocks: image first (primary signal), then the text prompt.
    user_content = []
    if image_url:
        user_content.append({
            "type": "image",
            "source": {"type": "url", "url": image_url},
        })
    user_content.append({"type": "text", "text": prompt})

    async def _call(content):
        return await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=700,
            messages=[{"role": "user", "content": content}],
        )

    err_msg = ""
    try:
        try:
            message = await _call(user_content)
        except Exception as img_err:
            # Image URL unreachable/invalid → retry text-only so we never lose the match.
            if image_url:
                print(f"[identity] Image failed ({img_err}); retrying text-only")
                message = await _call([{"type": "text", "text": prompt}])
            else:
                raise
        text = message.content[0].text.strip()
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            result = json.loads(match.group())
            if not result.get("search_queries"):
                sq = result.get("search_query", title[:60])
                result["search_queries"] = [sq]
            if not result.get("search_query") and result["search_queries"]:
                result["search_query"] = result["search_queries"][0]
            # Default relevant_stores if missing
            if "relevant_stores" not in result:
                result["relevant_stores"] = ["ksp","bug","ivory","zap"]
            return result
    except Exception as e:
        err_msg = str(e)
        print(f"[identity] Error: {e}")

    # Smart keyword fallback: classify by English keywords so the right Israeli
    # stores show even when the AI classifier is unavailable.
    brand = _extract_brand_fallback(title)
    cat_type, cat_he, stores = _keyword_category(title)
    if cat_type == "electronics" and brand and len(title.split()) > 1:
        fallback_query = brand + " " + title.split()[1]
    else:
        fallback_query = cat_he
    return {
        "brand": brand,
        "model": "",
        "model_code": "",
        "category_he": cat_he,
        "category_type": cat_type,
        "is_branded": bool(brand),
        "confidence": 0.35,
        "search_query": fallback_query,
        "search_queries": [fallback_query, cat_he, title[:40]],
        "relevant_stores": stores,
        "_debug_error": err_msg,
    }


def _keyword_category(title: str):
    """Heuristic (category_type, category_he, relevant_stores) from English keywords,
    used when the AI classifier fails. Keeps products flowing to the right stores."""
    t = (title or "").lower()
    def has(*words): return any(w in t for w in words)
    if has("squish", "plush", "toy", "doll", "figure", "lego", "puzzle", "stuffed",
           "stress relief", "fidget", "kids", "children", "anime", "collectible", "dumpling"):
        return ("toys", "צעצוע", ["toys_r_us", "megatoy", "zap", "ace"])
    if has("dress", "shirt", "hoodie", "jacket", "pants", "jeans", "skirt", "clothing",
           "fashion", "sock", "underwear", "blouse", "sweater", "coat", "shoe", "sneaker", "boot"):
        return ("clothing", "ביגוד", ["termoshop", "zap"])
    if has("kitchen", "knife", "pan", "pot", "cookware", "plate", "cup", "mug",
           "cutlery", "utensil", "bowl"):
        return ("home", "כלי מטבח", ["ace", "home_center", "ikea", "zap"])
    if has("furniture", "chair", "table", "desk", "sofa", "shelf", "lamp", "curtain",
           "rug", "carpet", "pillow", "bedding", "mattress", "storage", "decor", "home"):
        return ("home", "מוצר לבית", ["ace", "home_center", "ikea", "zap"])
    if has("yoga", "fitness", "gym", "dumbbell", "sport", "bike", "bicycle", "running",
           "camping", "hiking", "workout"):
        return ("sports", "ספורט", ["decathlon", "zap", "ace"])
    if has("makeup", "cosmetic", "skincare", "cream", "lipstick", "shampoo", "perfume",
           "beauty", "nail"):
        return ("health", "קוסמטיקה", ["super_pharm", "zap"])
    if has("drill", "screwdriver", "wrench", "hammer", "tool", "saw", "plier", "hardware",
           "garden", "paint"):
        return ("tools", "כלי עבודה", ["ace", "home_center", "ksp", "zap"])
    if has("car ", "auto", "vehicle", "seat cover", "steering", "tire", "motorcycle"):
        return ("automotive", "אביזרי רכב", ["zap", "ace", "ksp"])
    if has("headphone", "earphone", "earbud", "speaker", "mouse", "keyboard", "monitor",
           "laptop", "phone", "tablet", "camera", "charger", "cable", "usb", "ssd",
           "gaming", "console", "watch", "led", "bluetooth", "router"):
        return ("electronics", "מוצר חשמל", ["ksp", "bug", "ivory", "zap"])
    return ("other", "מוצר", ["zap", "ace", "home_center", "ksp"])


def _extract_brand_fallback(title: str) -> str:
    words = title.strip().split()
    return words[0] if words else ""


# ─── Búsqueda directa en tiendas israelíes ───────────────────────────────────

_STORE_SEARCH_URLS = {
    # Electronics
    "ksp":          "https://ksp.co.il/web/cat/?search={q}",
    "bug":          "https://www.bug.co.il/search?q={q}",
    "ivory":        "https://www.ivory.co.il/catalog.php?act=search&q={q}",
    "zap":          "https://www.zap.co.il/search.aspx?keyword={q}",
    # Home & tools
    "ace":          "https://www.ace.co.il/search?q={q}",
    "home_center":  "https://www.homecenter.co.il/homecenter/search.do?q={q}",
    "ikea":         "https://www.ikea.com/il/he/search/?q={q}",
    # Toys & baby
    "toys_r_us":    "https://www.toysrus.co.il/search#q={q}&t=All",
    "megatoy":      "https://www.megatoy.co.il/search?q={q}",
    # Sports & outdoor
    "decathlon":    "https://www.decathlon.co.il/search?Ntt={q}",
    # Health & beauty
    "super_pharm":  "https://www.super-pharm.co.il/search?q={q}",
    # Fashion/general
    "termoshop":    "https://termoshop.co.il/search?q={q}",
}

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "he-IL,he;q=0.9,en;q=0.8",
    # Explicitly exclude brotli — BUG.co.il sends br-compressed responses
    # that httpx can't decompress without the optional brotli package.
    "Accept-Encoding": "gzip, deflate",
}

_STORE_BASES = {
    "ksp":         "https://ksp.co.il",
    "bug":         "https://www.bug.co.il",
    "ivory":       "https://www.ivory.co.il",
    "zap":         "https://www.zap.co.il",
    "ace":         "https://www.ace.co.il",
    "home_center": "https://www.homecenter.co.il",
    "ikea":        "https://www.ikea.com/il/he",
    "toys_r_us":   "https://www.toysrus.co.il",
    "megatoy":     "https://www.megatoy.co.il",
    "decathlon":   "https://www.decathlon.co.il",
    "super_pharm": "https://www.super-pharm.co.il",
    "termoshop":   "https://termoshop.co.il",
}


async def search_online_stores_direct(search_query: str) -> list:
    encoded = quote(search_query)
    results = []
    async with httpx.AsyncClient(headers=_HEADERS, timeout=12.0, follow_redirects=True) as http:
        # Run all scrapers concurrently
        ksp_task   = asyncio.create_task(_try_ksp(search_query, encoded, http))
        bug_task   = asyncio.create_task(_try_bug(search_query, encoded, http))
        ivory_task = asyncio.create_task(_try_ivory(search_query, encoded, http))
        zap_task   = asyncio.create_task(_try_zap(search_query, encoded, http))

        ksp_prods, bug_prods, ivory_prods, zap_prods = await asyncio.gather(
            ksp_task, bug_task, ivory_task, zap_task, return_exceptions=True
        )

        for store, prods in [("ksp", ksp_prods), ("bug", bug_prods), ("ivory", ivory_prods), ("zap", zap_prods)]:
            if isinstance(prods, list) and prods:
                results.extend(prods)
            else:
                results.append(_search_link(store, search_query, encoded))

    return results


def _search_link(store: str, title: str, encoded: str) -> dict:
    url = _STORE_SEARCH_URLS[store].format(q=encoded)
    return {"store": store, "title": title, "price_ils": None, "url": url, "tier": "possible", "score": 0.4}


# ── Generic helpers ──────────────────────────────────────────────────────────

def _parse_price(val) -> Optional[float]:
    if val is None:
        return None
    try:
        s = str(val).replace(",", "").replace("₪", "").replace(" ", "").strip()
        return float(s) if s else None
    except (ValueError, TypeError):
        return None


_PRICE_RE = re.compile(r'[₪]\s*([\d,]+(?:\.\d{1,2})?)|(\d[\d,]+(?:\.\d{1,2})?)\s*[₪]|(\d[\d,]+)\s*ש"ח')

def _extract_price_from_text(text: str) -> Optional[float]:
    for m in _PRICE_RE.finditer(text):
        raw = m.group(1) or m.group(2) or m.group(3)
        try:
            v = float(raw.replace(",", ""))
            if 10 < v < 100000:
                return v
        except ValueError:
            pass
    return None


def _find_products_in_json(obj, depth: int = 0) -> list:
    """Recursively dig into any JSON blob to find a product list."""
    if depth > 10 or not obj:
        return []
    _PRODUCT_KEYS = {"price", "Price", "salePrice", "SalePrice", "regularPrice",
                     "ProdName", "prodName", "productName"}
    _LIST_KEYS    = ("products", "items", "results", "catalogItems", "searchResults",
                     "data", "Products", "Items", "Hits", "hits", "Documents", "documents",
                     "productList", "product_list")
    if isinstance(obj, list) and len(obj) >= 1:
        sample = obj[0] if isinstance(obj[0], dict) else {}
        if _PRODUCT_KEYS & set(sample.keys()):
            return obj          # found a list of products
        for item in obj[:5]:   # recurse into first few list items
            found = _find_products_in_json(item, depth + 1)
            if found:
                return found
    elif isinstance(obj, dict):
        for key in _LIST_KEYS:
            if key in obj:
                found = _find_products_in_json(obj[key], depth + 1)
                if found:
                    return found
        for val in obj.values():
            if isinstance(val, (dict, list)):
                found = _find_products_in_json(val, depth + 1)
                if found:
                    return found
    return []


# ── Afiliados ────────────────────────────────────────────────────────────────
# AliExpress Tracking ID: "locali" (creado 2026-06-25, portals.aliexpress.com)
# App Key pendiente de aprobación (1-3 días hábiles desde 2026-06-25).
#
# IDs de tiendas israelíes (LOCALI = placeholder hasta aprobar):
#   KSP:   https://ksp.co.il (programa de partners) — reemplazar "LOCALI" con partner ID real
#   Zap:   https://www.zap.co.il/affiliate           — reemplazar "LOCALI" con affid real
#   Bug:   contactar a bug.co.il para partnership
#   Ivory: contactar a ivory.co.il
ALIEXPRESS_TRACKING_ID = "locali"

AFFILIATE_PARAMS = {
    "ksp":   "utm_source=locali&utm_medium=extension&partner=LOCALI",
    "bug":   "utm_source=locali&utm_medium=extension&ref=locali",
    "ivory": "utm_source=locali&utm_medium=extension&ref=locali",
    "zap":   "utm_source=locali&utm_medium=extension&affid=LOCALI",
}


def add_affiliate(store: str, url: str) -> str:
    """Añade el parámetro de afiliado de la tienda al URL del producto."""
    params = AFFILIATE_PARAMS.get(store)
    if not params or not url or not url.startswith("http"):
        return url
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}{params}"


def aliexpress_affiliate_url(item_id: str) -> str:
    """Construye el URL de producto AliExpress con tracking de afiliado."""
    if not item_id:
        return ""
    # Limpia el item_id (puede venir con parámetros extra)
    clean_id = item_id.split("?")[0].split("#")[0].strip()
    return (
        f"https://www.aliexpress.com/item/{clean_id}.html"
        f"?aff_trace_key={ALIEXPRESS_TRACKING_ID}"
        f"&utm_source=locali&utm_medium=extension"
    )


def _normalize_product(store: str, p: dict, encoded: str) -> dict:
    name = (p.get("name") or p.get("title") or p.get("ProdName") or
            p.get("prodName") or p.get("productName") or p.get("label") or
            p.get("Name") or p.get("Title") or "")
    price_raw = (p.get("price") or p.get("Price") or p.get("salePrice") or
                 p.get("SalePrice") or p.get("regularPrice") or p.get("finalPrice") or
                 p.get("priceForDisplay"))
    url_path = (p.get("url") or p.get("URL") or p.get("link") or
                p.get("href") or p.get("productUrl") or p.get("pageUrl") or "")
    # Image URL — try many common field names
    image_raw = (p.get("image") or p.get("Image") or p.get("imageUrl") or
                 p.get("image_url") or p.get("img") or p.get("thumbnail") or
                 p.get("imgUrl") or p.get("imgSrc") or p.get("picture") or
                 p.get("photo") or p.get("mainImage") or p.get("primaryImage") or
                 p.get("catalogImage") or p.get("images") or "")
    # images field might be a list
    if isinstance(image_raw, list):
        image_raw = image_raw[0] if image_raw else ""
    if isinstance(image_raw, dict):
        image_raw = image_raw.get("url") or image_raw.get("src") or ""
    image_url = str(image_raw) if image_raw else ""
    if image_url and not image_url.startswith("http"):
        image_url = "https:" + image_url if image_url.startswith("//") else ""
    base = _STORE_BASES.get(store, "")
    if url_path and not url_path.startswith("http"):
        full_url = base + url_path
    elif url_path:
        full_url = url_path
    else:
        full_url = _STORE_SEARCH_URLS[store].format(q=encoded) if store in _STORE_SEARCH_URLS else ""
    price = _parse_price(price_raw)
    return {
        "store": store, "title": str(name)[:80], "price_ils": price,
        "url": add_affiliate(store, full_url), "image_url": image_url,
        "tier": "possible", "score": 0.6 if price else 0.4,
    }


def _extract_json_blobs(html: str) -> list:
    """Return all parseable JSON objects/arrays found in <script> tags."""
    blobs = []
    # __NEXT_DATA__
    m = re.search(r'<script[^>]*id=["\']__NEXT_DATA__["\'][^>]*>(.*?)</script>', html, re.DOTALL)
    if m:
        try:
            blobs.append(json.loads(m.group(1)))
        except Exception:
            pass
    # window.X = {...}
    for m in re.finditer(r'window\.(\w+)\s*=\s*(\{.*?\}|\[.*?\])\s*;', html, re.DOTALL):
        try:
            blobs.append(json.loads(m.group(2)))
        except Exception:
            pass
    # Any <script> with large JSON (> 500 chars starting with { or [)
    for m in re.finditer(r'<script[^>]*>\s*(\{|\[)(.{500,}?)(\}|\])\s*</script>', html, re.DOTALL):
        try:
            candidate = m.group(1) + m.group(2) + m.group(3)
            blobs.append(json.loads(candidate))
        except Exception:
            pass
    return blobs


# ── KSP ──────────────────────────────────────────────────────────────────────

async def _try_ksp(query: str, encoded: str, http: httpx.AsyncClient) -> list:
    """
    KSP is a React SPA — products are loaded via Server-Sent Events.
    POST to /m_action/sse/streams with component key cat.categoryListing.
    The response is a stream of SSE lines; each data: line is JSON.
    """
    import time, math, random
    tt = str(int(time.time() * 1000)) + str(int(random.random() * 10**16)).zfill(16)

    payload = {
        "components": [{
            "key": "cat.categoryListing",
            "params": {
                "categoryPath": "",
                "withSuggestion": 1,
                "sort": 5,
                "number": 8,
                "tags_size": 10,
                "tt": tt,
                "search": query,
            },
        }],
        "context": {"tt": tt},
    }

    try:
        r = await http.post(
            "https://ksp.co.il/m_action/sse/streams",
            json=payload,
            headers={
                **_HEADERS,
                "Content-Type": "application/json",
                "Accept": "text/event-stream,application/json,*/*",
                "Referer": f"https://ksp.co.il/web/cat/?search={encoded}",
                "Origin": "https://ksp.co.il",
            },
            timeout=12.0,
        )
        if r.status_code != 200:
            print(f"[ksp-sse] HTTP {r.status_code}")
            return []

        # Parse SSE stream — each line starting with "data:" contains JSON
        text = r.text
        products = []
        for line in text.splitlines():
            if not line.startswith("data:"):
                continue
            raw = line[5:].strip()
            if not raw or raw == "[DONE]":
                continue
            try:
                obj = json.loads(raw)
                # KSP SSE structure: {key, data: {result: {items: [...]}, seo, breadCrumbs}}
                # Also handle legacy {payload: {items: [...]}} just in case
                data_result = (
                    obj.get("data", {}).get("result") or
                    obj.get("payload") or
                    obj
                )
                items = (
                    data_result.get("items") or
                    data_result.get("products") or
                    data_result.get("catalogItems") or
                    []
                )
                if not items:
                    items = _find_products_in_json(data_result)
                for p in items[:8]:
                    if not isinstance(p, dict):
                        continue
                    name = (p.get("ProdName") or p.get("prodName") or p.get("name") or
                            p.get("title") or p.get("Name") or "")
                    price_raw = (p.get("ProdPrice") or p.get("price") or p.get("Price") or
                                 p.get("salePrice") or p.get("finalPrice") or p.get("priceForDisplay"))
                    url_path = (p.get("url") or p.get("URL") or p.get("link") or
                                p.get("href") or p.get("productUrl") or "")
                    prod_id = p.get("uin") or p.get("ProdId") or p.get("id") or p.get("Id") or ""
                    if not url_path:
                        url_path = f"/web/item/{prod_id}" if prod_id else ""
                    full_url = ("https://ksp.co.il" + url_path
                                if url_path and not url_path.startswith("http")
                                else url_path or f"https://ksp.co.il/web/cat/?search={encoded}")
                    # Image URL
                    img_raw = (p.get("img") or p.get("image") or p.get("Image") or
                               p.get("imageUrl") or p.get("imgUrl") or p.get("ProdImage") or
                               p.get("ProdFullImage") or p.get("thumbnail") or "")
                    if not img_raw and prod_id:
                        img_raw = f"https://ksp.co.il/web/images/products/{prod_id}.jpg"
                    if isinstance(img_raw, str) and img_raw.startswith("//"):
                        img_raw = "https:" + img_raw
                    price = _parse_price(price_raw)
                    if name:
                        products.append({
                            "store": "ksp",
                            "title": str(name)[:80],
                            "price_ils": price,
                            "url": full_url,
                            "image_url": str(img_raw) if img_raw else "",
                            "tier": "possible",
                            "score": 0.6 if price else 0.4,
                        })
            except Exception:
                continue

        if products:
            print(f"[ksp-sse] {len(products)} products")
            return products[:4]

        # Fallback: try to find any JSON blob in the SSE text
        for blob in _extract_json_blobs(text):
            prods = _find_products_in_json(blob)
            if prods:
                out = [_normalize_product("ksp", p, encoded) for p in prods[:4]]
                out = [p for p in out if p["title"]]
                if out:
                    print(f"[ksp-sse-fallback] {len(out)} products from blob")
                    return out

        print(f"[ksp-sse] No products parsed. Response len={len(text)}, lines={len(text.splitlines())}")
    except Exception as e:
        print(f"[ksp-sse] {e}")
    return []


# ── BUG ──────────────────────────────────────────────────────────────────────

async def _try_bug(query: str, encoded: str, http: httpx.AsyncClient) -> list:
    # 1. Try BUG's internal API (Next.js / Nuxt patterns)
    api_urls = [
        f"https://www.bug.co.il/api/search?q={encoded}&limit=5",
        f"https://www.bug.co.il/api/products/search?q={encoded}",
        f"https://www.bug.co.il/_next/data/search.json?q={encoded}",
    ]
    for url in api_urls:
        try:
            r = await http.get(url)
            if r.status_code == 200 and "json" in r.headers.get("content-type", ""):
                prods = _find_products_in_json(r.json())
                if prods:
                    out = [_normalize_product("bug", p, encoded) for p in prods[:4]]
                    out = [p for p in out if p["title"]]
                    if out:
                        print(f"[bug-api] {len(out)} from {url}")
                        return out
        except Exception as e:
            print(f"[bug-api] {url}: {e}")

    # 2. Scrape HTML
    try:
        r = await http.get(f"https://www.bug.co.il/search?q={encoded}")
        if r.status_code != 200:
            print(f"[bug-html] HTTP {r.status_code}")
            return []
        html = r.text

        for blob in _extract_json_blobs(html):
            prods = _find_products_in_json(blob)
            if prods:
                out = [_normalize_product("bug", p, encoded) for p in prods[:4]]
                out = [p for p in out if p["title"]]
                if out:
                    print(f"[bug-html] {len(out)} from JSON blob")
                    return out

        # Regex fallback
        titles = re.findall(
            r'class="[^"]*(?:product|item)[^"]*name[^"]*"[^>]*>\s*<[^>]+>([^<]{5,80})</|'
            r'"productName"\s*:\s*"([^"]{5,80})"',
            html
        )
        prices = re.findall(r'[₪]\s*([\d,]+(?:\.\d{2})?)', html)
        if titles and prices:
            out = []
            for (t1, t2), price_str in zip(titles[:4], prices[:4]):
                name = (t1 or t2).strip()
                if name:
                    out.append({"store": "bug", "title": name, "price_ils": _parse_price(price_str),
                                "url": f"https://www.bug.co.il/search?q={encoded}",
                                "tier": "possible", "score": 0.5})
            if out:
                print(f"[bug-html] {len(out)} via regex")
                return out

        print(f"[bug] No products. page len={len(html)}")
    except Exception as e:
        print(f"[bug] {e}")
    return []


# ── IVORY ─────────────────────────────────────────────────────────────────────

async def _try_ivory(query: str, encoded: str, http: httpx.AsyncClient) -> list:
    # Ivory uses a PHP-based site — more scrapeable
    try:
        r = await http.get(f"https://www.ivory.co.il/catalog.php?act=search&q={encoded}")
        if r.status_code != 200:
            print(f"[ivory] HTTP {r.status_code}")
            return []
        html = r.text

        # Try JSON blobs first
        for blob in _extract_json_blobs(html):
            prods = _find_products_in_json(blob)
            if prods:
                out = [_normalize_product("ivory", p, encoded) for p in prods[:4]]
                out = [p for p in out if p["title"]]
                if out:
                    print(f"[ivory] {len(out)} from JSON")
                    return out

        # Ivory HTML: product cards have class="product-box" or similar
        name_matches = re.findall(
            r'<(?:div|h[23]|a)[^>]*class="[^"]*(?:product-name|prod-name|item-name)[^"]*"[^>]*>\s*<?[^>]*>?([^<]{5,80})',
            html
        )
        price_matches = re.findall(r'[₪]\s*([\d,]+)', html)

        if name_matches and price_matches:
            out = []
            for name, price in zip(name_matches[:4], price_matches[:4]):
                out.append({"store": "ivory", "title": name.strip()[:80],
                            "price_ils": _parse_price(price),
                            "url": f"https://www.ivory.co.il/catalog.php?act=search&q={encoded}",
                            "tier": "possible", "score": 0.5})
            if out:
                print(f"[ivory] {len(out)} via regex")
                return out

        print(f"[ivory] No products. page len={len(html)}")
    except Exception as e:
        print(f"[ivory] {e}")
    return []


# ── ZAP ──────────────────────────────────────────────────────────────────────

async def _try_zap(query: str, encoded: str, http: httpx.AsyncClient) -> list:
    """
    Zap.co.il is a price-comparison aggregator (server-side rendered HTML).
    Products are in <div class="BidInfo"> containers with .productName and .bidPrice.
    Aggregates KSP, BUG, Ivory, and 50+ other Israeli stores.
    """
    try:
        r = await http.get(
            f"https://www.zap.co.il/search.aspx?keyword={encoded}",
            headers={
                **_HEADERS,
                "Referer": "https://www.zap.co.il/",
            },
        )
        if r.status_code != 200:
            print(f"[zap] HTTP {r.status_code}")
            return []
        html = r.text

        # Parse BidInfo containers
        products = []
        # Find each BidInfo block
        for block in re.findall(r'<div[^>]+class="[^"]*BidInfo[^"]*"[^>]*>(.*?)</div>\s*</div>', html, re.DOTALL):
            name_m = re.search(r'class="[^"]*productName[^"]*"[^>]*>\s*([^<]{3,120})', block)
            price_m = re.search(r'class="[^"]*bidPrice[^"]*"[^>]*>\s*([\d,]+)\s*[₪]?', block)
            if not price_m:
                price_m = re.search(r'([\d,]+)\s*₪', block)
            if name_m and price_m:
                name = name_m.group(1).strip()
                price = _parse_price(price_m.group(1))
                if name and price and 10 < price < 100_000:
                    products.append({
                        "store": "zap",
                        "title": name[:80],
                        "price_ils": price,
                        "url": f"https://www.zap.co.il/search.aspx?keyword={encoded}",
                        "tier": "possible",
                        "score": 0.55,
                    })

        if products:
            # De-duplicate by name, keep lowest price per product
            seen: dict[str, dict] = {}
            for p in products:
                key = p["title"].lower()[:40]
                if key not in seen or (p["price_ils"] or 0) < (seen[key]["price_ils"] or 9e9):
                    seen[key] = p
            out = list(seen.values())[:4]
            print(f"[zap] {len(out)} products")
            return out

        # Fallback: try JSON blobs (Zap sometimes embeds structured data)
        for blob in _extract_json_blobs(html):
            prods = _find_products_in_json(blob)
            if prods:
                out = [_normalize_product("zap", p, encoded) for p in prods[:4]]
                out = [p for p in out if p["title"]]
                if out:
                    print(f"[zap-json] {len(out)} products")
                    return out

        # Last resort: at least check if the page has prices at all
        prices = re.findall(r'([\d,]+)\s*₪', html)
        print(f"[zap] No structured products. page len={len(html)}, price mentions={len(prices)}")
    except Exception as e:
        print(f"[zap] {e}")
    return []


# ── Debug helper (called from /api/debug-scraper endpoint) ───────────────────

async def debug_scraper(query: str) -> dict:
    """Returns raw diagnostic info for each store. Exposed via API."""
    encoded = quote(query)
    report = {}
    async with httpx.AsyncClient(headers=_HEADERS, timeout=12.0, follow_redirects=True) as http:
        for store, url in [
            ("ksp",   f"https://ksp.co.il/web/cat/?search={encoded}"),
            ("bug",   f"https://www.bug.co.il/search?q={encoded}"),
            ("ivory", f"https://www.ivory.co.il/catalog.php?act=search&q={encoded}"),
        ]:
            try:
                r = await http.get(url)
                html = r.text
                blobs = _extract_json_blobs(html)
                prices = re.findall(r'[₪]\s*([\d,]+)', html)[:10]
                report[store] = {
                    "status": r.status_code,
                    "html_len": len(html),
                    "json_blobs_found": len(blobs),
                    "price_mentions": prices,
                    "blob_top_keys": [list(b.keys())[:6] if isinstance(b, dict) else "list"
                                      for b in blobs[:3]],
                    "html_snippet": html[2000:3000],  # middle of page
                }
            except Exception as e:
                report[store] = {"error": str(e)}
    return report


def _extract_price_from_snippet(snippet: str) -> Optional[float]:
    return _extract_price_from_text(snippet)



# ─── Cadenas israelíes conocidas con coordenadas ─────────────────────────────

_IL_CHAINS = [
    # ── Electronics ──
    {"name": "KSP - ראשון לציון",       "lat": 31.9630, "lng": 34.8064, "phone": "+97239520444", "website": "https://ksp.co.il",             "address": "נחלת יהודה 2, ראשון לציון",   "categories": ["electronics","computers","gaming"]},
    {"name": "Bug - ראשון לציון",       "lat": 31.9541, "lng": 34.7987, "phone": "+97239517777", "website": "https://www.bug.co.il",          "address": "קניון הים, ראשון לציון",       "categories": ["electronics","computers","gaming"]},
    {"name": "iDigital - ראשון לציון",  "lat": 31.9630, "lng": 34.8040, "phone": "+97239520321", "website": "https://www.idigital.co.il",     "address": "ראשון לציון",                  "categories": ["electronics","apple"]},
    {"name": "KSP - רחובות",            "lat": 31.8982, "lng": 34.8098, "phone": "+97289470444", "website": "https://ksp.co.il",             "address": "הרצל 220, רחובות",             "categories": ["electronics","computers","gaming"]},
    {"name": "Bug - רחובות",            "lat": 31.8973, "lng": 34.8077, "phone": "+97289470777", "website": "https://www.bug.co.il",          "address": "הרצל, רחובות",                 "categories": ["electronics","computers","gaming"]},
    {"name": "KSP - דיזנגוף סנטר",     "lat": 32.0784, "lng": 34.7741, "phone": "+97236966262", "website": "https://ksp.co.il",             "address": "דיזנגוף סנטר, תל אביב",        "categories": ["electronics","computers","gaming"]},
    {"name": "Bug - אזרלי",             "lat": 32.0720, "lng": 34.7880, "phone": "+97237545555", "website": "https://www.bug.co.il",          "address": "מרכז אזרלי, תל אביב",          "categories": ["electronics","computers","gaming"]},
    {"name": "Ivory - גבעתיים",         "lat": 32.0680, "lng": 34.8120, "phone": "+97235775353", "website": "https://www.ivory.co.il",        "address": "הרואה 6, גבעתיים",             "categories": ["electronics","apple"]},
    {"name": "iDigital - תל אביב",      "lat": 32.0853, "lng": 34.7818, "phone": "+97236099999", "website": "https://www.idigital.co.il",     "address": "דיזנגוף, תל אביב",             "categories": ["electronics","apple"]},
    {"name": "KSP - חולון",             "lat": 32.0100, "lng": 34.7730, "phone": "+97235006262", "website": "https://ksp.co.il",             "address": "סוקולוב 77, חולון",            "categories": ["electronics","computers","gaming"]},
    {"name": "Bug - חולון",             "lat": 32.0130, "lng": 34.7750, "phone": "+97235007777", "website": "https://www.bug.co.il",          "address": "חולון",                        "categories": ["electronics","computers","gaming"]},
    {"name": "KSP - פתח תקווה",         "lat": 32.0847, "lng": 34.8879, "phone": "+97239306262", "website": "https://ksp.co.il",             "address": "ביאליק, פתח תקווה",            "categories": ["electronics","computers","gaming"]},
    {"name": "Bug - פתח תקווה",         "lat": 32.0860, "lng": 34.8840, "phone": "+97239307777", "website": "https://www.bug.co.il",          "address": "פתח תקווה",                    "categories": ["electronics","computers","gaming"]},
    {"name": "KSP - מודיעין",           "lat": 31.9003, "lng": 35.0095, "phone": "+97289446262", "website": "https://ksp.co.il",             "address": "קניון מודיעין",                "categories": ["electronics","computers","gaming"]},
    {"name": "Bug - מודיעין",           "lat": 31.9010, "lng": 35.0090, "phone": "+97289447777", "website": "https://www.bug.co.il",          "address": "קניון מודיעין",                "categories": ["electronics","computers","gaming"]},
    {"name": "KSP - ירושלים",           "lat": 31.7767, "lng": 35.2345, "phone": "+97225386262", "website": "https://ksp.co.il",             "address": "קניון הענן, ירושלים",          "categories": ["electronics","computers","gaming"]},
    {"name": "Bug - ירושלים",           "lat": 31.7770, "lng": 35.2350, "phone": "+97225387777", "website": "https://www.bug.co.il",          "address": "ירושלים",                      "categories": ["electronics","computers","gaming"]},
    # ── Toys & Games ──
    {"name": "Maxtoc - ראשון לציון",    "lat": 31.9600, "lng": 34.8010, "phone": "+97239515555", "website": "https://www.maxtoy.co.il",       "address": "קניון הים, ראשון לציון",       "categories": ["toys","games","kids"]},
    {"name": "Maxtoc - אשדוד",          "lat": 31.8044, "lng": 34.6553, "phone": "+97286888555", "website": "https://www.maxtoy.co.il",       "address": "קניון סיטי, אשדוד",            "categories": ["toys","games","kids"]},
    {"name": "Maxtoc - תל אביב",        "lat": 32.0740, "lng": 34.7900, "phone": "+97236091234", "website": "https://www.maxtoy.co.il",       "address": "דיזנגוף סנטר, תל אביב",        "categories": ["toys","games","kids"]},
    {"name": "Maxtoc - פתח תקווה",      "lat": 32.0840, "lng": 34.8820, "phone": "+97239301234", "website": "https://www.maxtoy.co.il",       "address": "קניון גן העיר, פתח תקווה",     "categories": ["toys","games","kids"]},
    {"name": "Maxtoc - ירושלים",        "lat": 31.7740, "lng": 35.2300, "phone": "+97225381234", "website": "https://www.maxtoy.co.il",       "address": "מלחה מול, ירושלים",            "categories": ["toys","games","kids"]},
    {"name": "Toys R Us - רמת גן",      "lat": 32.0800, "lng": 34.8200, "phone": "+97235001234", "website": "https://www.toysrus.co.il",       "address": "קניון איילון, רמת גן",          "categories": ["toys","games","kids"]},
    # ── Sports ──
    {"name": "Decathlon - ראשון לציון", "lat": 31.9520, "lng": 34.7950, "phone": "+97239661234", "website": "https://www.decathlon.co.il",    "address": "ראשון לציון",                  "categories": ["sports","outdoor","fitness"]},
    {"name": "Decathlon - נתניה",       "lat": 32.3200, "lng": 34.8600, "phone": "+97298611234", "website": "https://www.decathlon.co.il",    "address": "נתניה",                        "categories": ["sports","outdoor","fitness"]},
    {"name": "Golf & Co - ראשון לציון", "lat": 31.9610, "lng": 34.8000, "phone": "+97239519876", "website": "https://www.golf.co.il",          "address": "קניון הים, ראשון לציון",       "categories": ["sports","clothing"]},
    # ── Books ──
    {"name": "סטימצקי - תל אביב",       "lat": 32.0700, "lng": 34.7750, "phone": "+97236299999", "website": "https://www.steimatzky.co.il",   "address": "תל אביב",                      "categories": ["books","stationery"]},
    {"name": "צומת ספרים - גבעתיים",    "lat": 32.0690, "lng": 34.8090, "phone": "+97235555555", "website": "https://www.tzomet.co.il",        "address": "גבעתיים",                      "categories": ["books","stationery"]},
    # ── Hardware / DIY ──
    {"name": "ACE - ראשון לציון",       "lat": 31.9640, "lng": 34.8080, "phone": "+97239521234", "website": "https://www.ace.co.il",           "address": "ראשון לציון",                  "categories": ["tools","hardware","garden"]},
    {"name": "ACE - פתח תקווה",         "lat": 32.0870, "lng": 34.8900, "phone": "+97239311234", "website": "https://www.ace.co.il",           "address": "פתח תקווה",                    "categories": ["tools","hardware","garden","home"]},
    {"name": "ACE - תל אביב",           "lat": 32.0850, "lng": 34.7900, "phone": "", "website": "https://www.ace.co.il",           "address": "תל אביב",                      "categories": ["tools","hardware","garden","home"]},
    # ── Home, Kitchen & Furniture ──
    {"name": "Home Center - ראשון לציון","lat": 31.9700, "lng": 34.8000, "phone": "", "website": "https://www.homecenter.co.il",     "address": "ראשון לציון",                  "categories": ["home","furniture","kitchen","garden","tools"]},
    {"name": "Home Center - תל אביב",   "lat": 32.0900, "lng": 34.7950, "phone": "", "website": "https://www.homecenter.co.il",     "address": "תל אביב",                      "categories": ["home","furniture","kitchen","garden"]},
    {"name": "Home Center - פתח תקווה", "lat": 32.0880, "lng": 34.8850, "phone": "", "website": "https://www.homecenter.co.il",     "address": "פתח תקווה",                    "categories": ["home","furniture","kitchen","garden"]},
    {"name": "IKEA - ראשון לציון",      "lat": 31.9760, "lng": 34.7740, "phone": "", "website": "https://www.ikea.com/il/he/",      "address": "ראשון לציון",                  "categories": ["home","furniture","kitchen"]},
    {"name": "IKEA - נתניה",            "lat": 32.2870, "lng": 34.8540, "phone": "", "website": "https://www.ikea.com/il/he/",      "address": "נתניה",                        "categories": ["home","furniture","kitchen"]},
    # ── Health & Beauty ──
    {"name": "Super-Pharm - ראשון לציון","lat": 31.9620, "lng": 34.8050, "phone": "+97239523456", "website": "https://www.super-pharm.co.il", "address": "ראשון לציון",                  "categories": ["health","beauty","pharmacy"]},
    {"name": "Super-Pharm - תל אביב",   "lat": 32.0780, "lng": 34.7800, "phone": "+97236093456", "website": "https://www.super-pharm.co.il",  "address": "תל אביב",                      "categories": ["health","beauty","pharmacy"]},
]

# Category keywords → store categories mapping (for filtering _IL_CHAINS)
_CAT_TO_CHAIN_CATEGORIES = {
    "מחשב": ["electronics","computers"], "עכבר": ["electronics","computers"],
    "מקלדת": ["electronics","computers"], "טלפון": ["electronics"],
    "מצלמ": ["electronics"], "אוזניו": ["electronics"], "רמקול": ["electronics"],
    "גיימינג": ["electronics","gaming"], "קונסול": ["electronics","gaming"],
    "צעצו": ["toys","games","kids"], "משחק": ["toys","games","kids"],
    "לגו": ["toys","games","kids"], "בובה": ["toys","games","kids"],
    "לחיצ": ["toys","games","kids"], "סקוויש": ["toys","games","kids"],
    "פאזל": ["toys","games","kids"], "דמות": ["toys","games","kids"],
    "ספורט": ["sports","outdoor","fitness"], "אופניי": ["sports"],
    "כדור": ["sports"], "כושר": ["sports","fitness"], "יוגה": ["sports","fitness"],
    "ספר": ["books","stationery"],
    "כלי עבוד": ["tools","hardware"], "מקדח": ["tools","hardware"],
    "כלי": ["tools","hardware","home"], "ברגים": ["tools","hardware"],
    "גינה": ["tools","hardware","garden","home"], "גינון": ["garden","home","tools"],
    # ── Home, kitchen & furniture ──
    "רהיט": ["home","furniture"], "כורסא": ["home","furniture"], "כיסא": ["home","furniture"],
    "שולחן": ["home","furniture"], "מיטה": ["home","furniture"], "ארון": ["home","furniture"],
    "מטבח": ["home","kitchen"], "סיר": ["home","kitchen"], "מחבת": ["home","kitchen"],
    "סכין": ["home","kitchen"], "צלחת": ["home","kitchen"], "כוס": ["home","kitchen"],
    "מנורה": ["home","furniture"], "תאורה": ["home","furniture"], "שטיח": ["home","furniture"],
    "וילון": ["home","furniture"], "כרית": ["home","furniture"], "מצעים": ["home","furniture"],
    "מגבת": ["home"], "אחסון": ["home","furniture"], "בית": ["home"], "נוי": ["home","furniture"],
    "קוסמטיק": ["health","beauty"], "בריאות": ["health","pharmacy"],
    "טיפוח": ["health","beauty"], "איפור": ["health","beauty"],
}


def _nearest_chain_stores(user_lat: float, user_lng: float, max_km: float = 20.0, top_n: int = 5,
                          category_he: str = "") -> list:
    """Return nearby chain stores, filtered by category when possible."""
    # Determine which store categories are relevant for this product
    wanted_cats: set[str] = set()
    for kw, cats in _CAT_TO_CHAIN_CATEGORIES.items():
        if kw in (category_he or ""):
            wanted_cats.update(cats)

    results = []
    for s in _IL_CHAINS:
        d = _haversine_km(user_lat, user_lng, s["lat"], s["lng"])
        if d > max_km:
            continue
        store_cats = set(s.get("categories", []))
        # If we know what category we want, skip unrelated stores
        if wanted_cats and not (wanted_cats & store_cats):
            continue
        phone_clean = s["phone"].replace("-", "").replace(" ", "")
        results.append({
            "name": s["name"], "address": s["address"],
            "distance_km": round(d, 1), "open_now": None,
            "google_maps_url": f"https://maps.google.com/?q={s['lat']},{s['lng']}",
            "phone": phone_clean, "website": s["website"],
            "lat": s["lat"], "lng": s["lng"],
        })
    results.sort(key=lambda x: x["distance_km"])
    # If category filter returned nothing, fall back to all stores
    if not results:
        return _nearest_chain_stores(user_lat, user_lng, max_km, top_n, category_he="")
    return results[:top_n]



# ─── Búsqueda de tiendas físicas via OpenStreetMap ────────────────────────────

async def search_physical_stores_osm(category_he: str, user_lat: float, user_lng: float, radius_meters: int = 5000) -> list:
    overpass_url = "https://overpass-api.de/api/interpreter"
    cat = category_he or ""
    # Pick OSM shop types based on product category
    if any(k in cat for k in ["צעצו","משחק","לגו","בובה","פאזל"]):
        shop_types = "toys|games|hobby"
        chain_names = "Maxtoc|Toys R Us|טויס|מקסטוק"
    elif any(k in cat for k in ["ספורט","אופניי","כדור","כושר"]):
        shop_types = "sports|outdoor|bicycle"
        chain_names = "Decathlon|Golf|ספורט"
    elif any(k in cat for k in ["ספר","ספרות"]):
        shop_types = "books|stationery"
        chain_names = "סטימצקי|צומת ספרים|Steimatzky"
    elif any(k in cat for k in ["כלי עבוד","מקדח","גינה","בנייה"]):
        shop_types = "hardware|doityourself|garden_centre"
        chain_names = "ACE|HOZ"
    elif any(k in cat for k in ["קוסמטיק","בריאות","תרופ"]):
        shop_types = "chemist|pharmacy|beauty"
        chain_names = "Super-Pharm|סופר-פארם|בית מרקחת"
    else:
        shop_types = "electronics|mobile_phone|computer|hardware|hifi|video_games|tools|doityourself"
        chain_names = "KSP|Bug|Ivory|iDigital|iStore"
    query = (
        "[out:json][timeout:15];\n(\n"
        "  node[\"shop\"~\"" + shop_types + "\"](around:" + str(radius_meters) + "," + str(user_lat) + "," + str(user_lng) + ");\n"
        "  way[\"shop\"~\"" + shop_types + "\"](around:" + str(radius_meters) + "," + str(user_lat) + "," + str(user_lng) + ");\n"
        "  node[\"shop\"][\"name\"~\"" + chain_names + "\",i](around:" + str(radius_meters) + "," + str(user_lat) + "," + str(user_lng) + ");\n"
        "  way[\"shop\"][\"name\"~\"" + chain_names + "\",i](around:" + str(radius_meters) + "," + str(user_lat) + "," + str(user_lng) + ");\n"
        ");\nout center tags;\n"
    )

    stores = []
    try:
        async with httpx.AsyncClient(timeout=12.0) as http:
            resp = await http.post(overpass_url, data={"data": query})
            resp.raise_for_status()
            data = resp.json()
        for element in data.get("elements", [])[:8]:
            tags = element.get("tags", {})
            name = tags.get("name:he") or tags.get("name") or tags.get("brand")
            if not name:
                continue
            if element["type"] == "way":
                lat2 = element.get("center", {}).get("lat", user_lat)
                lng2 = element.get("center", {}).get("lon", user_lng)
            else:
                lat2 = element.get("lat", user_lat)
                lng2 = element.get("lon", user_lng)
            distance = _haversine_km(user_lat, user_lng, lat2, lng2)
            street     = tags.get("addr:street", "")
            housenumber = tags.get("addr:housenumber", "")
            city       = tags.get("addr:city", "")
            address    = " ".join(filter(None, [street, housenumber, city]))
            phone      = tags.get("phone") or tags.get("contact:phone") or ""
            phone_clean = phone.replace("-", "").replace(" ", "").replace("(", "").replace(")", "")
            maps_url   = "https://maps.google.com/?q=" + str(lat2) + "," + str(lng2)
            wa_link    = "https://wa.me/" + phone_clean.lstrip("+") if phone_clean else None
            stores.append({
                "name": name, "address": address or city,
                "distance_km": round(distance, 1), "open_now": None,
                "google_maps_url": maps_url, "phone": phone_clean,
                "website": tags.get("website") or tags.get("contact:website") or "",
                "wa_link": wa_link, "lat": lat2, "lng": lng2,
            })
        stores.sort(key=lambda s: s["distance_km"])
        print(f"[osm] Found {len(stores)} stores in {radius_meters}m")
    except Exception as e:
        print(f"[osm] Error: {e}")

    if len(stores) < 3:
        chain_stores = _nearest_chain_stores(user_lat, user_lng, category_he=category_he)
        existing_names = {s["name"].lower() for s in stores}
        for cs in chain_stores:
            if cs["name"].lower() not in existing_names:
                stores.append(cs)
                existing_names.add(cs["name"].lower())
        stores.sort(key=lambda s: s["distance_km"])
        stores = stores[:6]
    return stores


# ─── Búsqueda de tiendas físicas (Google Places API New) ──────────────────────

_CATEGORY_QUERIES = {
    # Electronics
    "מצלמ":      ["חנות מצלמות", "צילום ציוד"],
    "טלפון":     ["חנות סלולר", "חנות טלפונים"],
    "מחשב":      ["חנות מחשבים", "מחשבים ואביזרים"],
    "אוזניו":    ["חנות אלקטרוניקה", "אוזניות ואודיו"],
    "רמקול":     ["חנות אודיו", "חנות אלקטרוניקה"],
    "תאורה":     ["חנות תאורה", "חנות חשמל"],
    "עכבר":      ["חנות מחשבים", "חנות אלקטרוניקה"],
    "מקלדת":     ["חנות מחשבים", "חנות אלקטרוניקה"],
    # Toys & games
    "צעצו":      ["חנות צעצועים", "maxtoc", "toys"],
    "משחק":      ["חנות צעצועים", "חנות משחקים", "maxtoc"],
    "לגו":       ["חנות צעצועים", "maxtoc"],
    "בובה":      ["חנות צעצועים", "maxtoc"],
    "פאזל":      ["חנות צעצועים", "חנות משחקים"],
    # Sports & outdoor
    "ספורט":     ["חנות ספורט", "golf & co", "decathlon"],
    "אופניי":    ["חנות אופניים", "חנות ספורט"],
    "כדור":      ["חנות ספורט"],
    "כושר":      ["חנות ספורט", "חנות כושר"],
    # Tools & hardware
    "כלי עבוד":  ["חנות כלי עבודה", "ACE חנות"],
    "מקדח":      ["חנות כלי עבודה", "ACE חנות"],
    "בנייה":     ["חנות חומרה", "ACE חנות"],
    # Garden
    "גינה":      ["חנות גינון", "חנות כלי גינה"],
    # Clothing & shoes
    "בגד":       ["חנות ביגוד", "זארה", "H&M"],
    "נעל":       ["חנות נעליים", "adidas", "nike"],
    "תיק":       ["חנות תיקים", "חנות אביזרים"],
    # Home & furniture
    "רהיט":      ["חנות רהיטים", "IKEA", "רהיטים"],
    "מטבח":      ["חנות מטבח", "כלי מטבח"],
    "מזרן":      ["חנות מזרנים"],
    # Health & beauty
    "קוסמטיק":   ["חנות קוסמטיקה", "super-pharm"],
    "בריאות":    ["super-pharm", "בית מרקחת"],
    # Watches & jewelry
    "שעון":      ["חנות שעונים", "חנות תכשיטים"],
    "תכשיט":     ["חנות תכשיטים", "זהב"],
    # Books & music
    "ספר":       ["חנות ספרים", "סטימצקי", "צומת ספרים"],
    # Pets
    "חיית מחמד": ["חנות חיות", "pet store"],
    "כלב":       ["חנות חיות", "pet store"],
    "חתול":      ["חנות חיות", "pet store"],
}

def _category_to_queries(category_he: str, brand: str) -> list[str]:
    """Maps Hebrew category to Google Places search queries."""
    cat = category_he or ""
    for key, queries in _CATEGORY_QUERIES.items():
        if key in cat:
            return queries
    # Default: use category as-is
    base = f"חנות {cat}" if cat else "חנות אלקטרוניקה"
    return [base]


async def search_physical_stores(brand: str, category_he: str, user_lat: float, user_lng: float, google_api_key: str, radius_meters: int = 10000) -> list:
    """Search nearby physical stores using Google Places API (New) Text Search."""
    queries = _category_to_queries(category_he, brand)
    stores = []
    seen_names = set()


    async with httpx.AsyncClient(timeout=15.0) as http:
        for query in queries[:2]:  # Max 2 queries to save quota
            try:
                resp = await http.post(
                    "https://places.googleapis.com/v1/places:searchText",
                    headers={
                        "X-Goog-Api-Key": google_api_key,
                        "X-Goog-FieldMask": (
                            "places.id,places.displayName,places.formattedAddress,"
                            "places.nationalPhoneNumber,places.websiteUri,"
                            "places.rating,places.userRatingCount,"
                            "places.regularOpeningHours,places.currentOpeningHours,"
                            "places.location,places.googleMapsUri,places.photos"
                        ),
                        "Content-Type": "application/json",
                    },
                    json={
                        "textQuery": query,
                        "locationBias": {
                            "circle": {
                                "center": {"latitude": user_lat, "longitude": user_lng},
                                "radius": float(radius_meters),
                            }
                        },
                        "languageCode": "he",
                        "maxResultCount": 5,
                    },
                )
                if resp.status_code != 200:
                    print(f"[places] HTTP {resp.status_code} for '{query}'")
                    continue
                data = resp.json()
                for place in data.get("places", []):
                    name = place.get("displayName", {}).get("text", "")
                    if not name or name.lower() in seen_names:
                        continue
                    seen_names.add(name.lower())
                    lat2 = place.get("location", {}).get("latitude", user_lat)
                    lng2 = place.get("location", {}).get("longitude", user_lng)
                    distance = _haversine_km(user_lat, user_lng, lat2, lng2)
                    phone = place.get("nationalPhoneNumber", "") or ""
                    phone_clean = phone.replace("-","").replace(" ","").replace("(","").replace(")","")
                    open_now = None
                    oh = place.get("currentOpeningHours") or place.get("regularOpeningHours")
                    if oh:
                        open_now = oh.get("openNow")
                    photo_url = None
                    photos = place.get("photos", [])
                    if photos:
                        photo_name = photos[0].get("name", "")
                        if photo_name:
                            photo_url = (
                                f"https://places.googleapis.com/v1/{photo_name}/media"
                                f"?maxWidthPx=200&key={google_api_key}"
                            )
                    stores.append({
                        "name": name,
                        "address": place.get("formattedAddress", ""),
                        "distance_km": round(distance, 1),
                        "open_now": open_now,
                        "google_maps_url": place.get("googleMapsUri", f"https://maps.google.com/?q={lat2},{lng2}"),
                        "phone": phone_clean,
                        "website": place.get("websiteUri", ""),
                        "photo_url": photo_url,
                        "rating": place.get("rating"),
                        "rating_count": place.get("userRatingCount"),
                        "lat": lat2, "lng": lng2,
                    })
            except Exception as e:
                print(f"[places] Error for '{query}': {e}")

    stores.sort(key=lambda s: s["distance_km"])
    print(f"[places] Found {len(stores)} stores")
    return stores[:6]


# ─── Main matching pipeline ────────────────────────────────────────────────────

async def run_matching_pipeline(
    item_id: str, title: str, price_usd: float,
    specs: dict = None, user_lat: float = 32.0853, user_lng: float = 34.7818,
    image_url: str = "",
) -> dict:
    import os
    anthropic_key  = os.getenv("ANTHROPIC_API_KEY", "")
    google_api_key = os.getenv("GOOGLE_PLACES_KEY", "")

    cost_analysis = calculate_real_cost(price_usd) if price_usd > 0 else None

    # Without Anthropic key: fast direct search
    if not anthropic_key:
        print("[pipeline] No Anthropic key — direct search")
        online = await search_online_stores_direct(title)
        encoded_q = quote(title)
        if not online:
            online = [_search_link(s, title, encoded_q) for s in ["ksp","bug","ivory","zap"]]
        osm_physical = await search_physical_stores_osm("מוצר", user_lat, user_lng)
        physical = osm_physical if osm_physical else _nearest_chain_stores(user_lat, user_lng)
        return {
            "item_id": item_id, "title": title, "price_usd": price_usd,
            "aliexpress_url": aliexpress_affiliate_url(item_id),
            "online": online, "physical": physical,
            "cost_analysis": cost_analysis,
            "identity": {"brand": "", "model_code": "", "category_he": "מוצר",
                         "is_branded": False, "search_query": title},
        }

    # With Anthropic: extract identity → targeted search
    try:
        client   = AsyncAnthropic(api_key=anthropic_key)
        identity = await extract_product_identity(title, specs or {}, client, image_url)
    except Exception as e:
        print(f"[pipeline] Identity extraction failed: {e}")
        identity = {"brand": "", "model_code": "", "category_he": "מוצר",
                    "is_branded": False, "search_query": title}

    category_he     = identity.get("category_he", "מוצר")
    brand           = identity.get("brand", "")
    search_queries  = identity.get("search_queries") or [identity.get("search_query") or title]
    # Deduplicate while preserving order
    seen = set()
    search_queries = [q for q in search_queries if q and not (q in seen or seen.add(q))]
    if not search_queries:
        search_queries = [title[:60]]

    # Determine which stores to search based on product category
    relevant_stores = identity.get("relevant_stores", ["ksp", "bug", "ivory", "zap"])
    category_type   = identity.get("category_type", "other")

    _store_scrapers = {
        "ksp":   _try_ksp,
        "bug":   _try_bug,
        "ivory": _try_ivory,
        "zap":   _try_zap,
    }

    # Online stores: try each query in order (specific → generic) until we get real prices
    online = []
    used_query = search_queries[0]

    if not relevant_stores:
        # Category not carried by any Israeli online store -> return informative message
        print(f"[pipeline] category_type={category_type!r} -> no relevant stores, skipping online search")
        online = [{
            "store": "locali",
            "name": f"המוצר ({category_he}) אינו נמכר בחנויות האלקטרוניקה הישראליות",
            "price_ils": None,
            "url": "",
            "match_score": 0,
            "note": f"קטגוריה: {category_he} | נסה לחפש בחנויות מקצועיות לקטגוריה זו",
        }]
    else:
        async with httpx.AsyncClient(headers=_HEADERS, timeout=12.0, follow_redirects=True) as http:
            for attempt_query in search_queries:
                encoded_q = quote(attempt_query)

                # Only search relevant stores for this category
                tasks = {
                    store: asyncio.create_task(_store_scrapers[store](attempt_query, encoded_q, http))
                    for store in relevant_stores if store in _store_scrapers
                }
                results = {}
                if tasks:
                    done = await asyncio.gather(*tasks.values(), return_exceptions=True)
                    results = dict(zip(tasks.keys(), done))

                attempt_online = []
                for store, prods in results.items():
                    if isinstance(prods, list) and prods:
                        attempt_online.extend(prods)
                    elif isinstance(prods, Exception):
                        print(f"[pipeline] {store} error ({attempt_query!r}): {prods}")

                priced = [r for r in attempt_online if r.get("price_ils")]
                print(f"[pipeline] query={attempt_query!r} stores={relevant_stores} -> {len(attempt_online)} results, {len(priced)} priced")

                if priced or attempt_query == search_queries[-1]:
                    used_query = attempt_query
                    online = attempt_online
                    stores_found = {r["store"] for r in attempt_online}
                    # Fill gaps with Hebrew-adapted search links
                    for store in relevant_stores:
                        if store not in stores_found:
                            online.append(_search_link(store, attempt_query, quote(attempt_query)))
                    break
                # No priced results — try next (more generic) query

    encoded_q = quote(used_query)

    # Physical stores: Google Places → OSM fallback → chain fallback
    physical: list = []
    if google_api_key:
        try:
            physical = await search_physical_stores(brand, category_he, user_lat, user_lng, google_api_key)
        except Exception as e:
            print(f"[pipeline] Google Places error: {e}")

    if len(physical) < 3:
        osm = await search_physical_stores_osm(category_he, user_lat, user_lng)
        existing = {s["name"].lower() for s in physical}
        for s in osm:
            if s["name"].lower() not in existing:
                physical.append(s)
                existing.add(s["name"].lower())

    if len(physical) < 3:
        chain = _nearest_chain_stores(user_lat, user_lng, category_he=category_he)
        existing = {s["name"].lower() for s in physical}
        for s in chain:
            if s["name"].lower() not in existing:
                physical.append(s)

    physical.sort(key=lambda s: s.get("distance_km", 999))

    return {
        "item_id": item_id, "title": title, "price_usd": price_usd,
        "aliexpress_url": aliexpress_affiliate_url(item_id),
        "online": online[:8], "physical": physical[:6],
        "cost_analysis": cost_analysis,
        "identity": identity,
    }


async def save_manual_request(item_id: str, title: str, price_usd: float,
                               user_lat: float, user_lng: float) -> None:
    try:
        import json, pathlib, datetime
        log_path = pathlib.Path("manual_requests.jsonl")
        entry = {
            "ts": datetime.datetime.utcnow().isoformat(),
            "item_id": item_id, "title": title, "price_usd": price_usd,
            "user_lat": user_lat, "user_lng": user_lng,
        }
        with log_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception as e:
        print(f"[save_manual_request] {e}")
        # Locali v0.3.0
