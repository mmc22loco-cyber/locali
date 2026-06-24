"""
Locali — Deal Publishing Agent
Runs periodically, finds competitive deals (Israeli price ≤ foreign price + margin),
stores them in deals.json, and exposes them via the /api/deals endpoint.
"""

import json
import os
import asyncio
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from matching_engine import (
    extract_product_identity,
    calculate_real_cost,
    search_online_stores_direct,
)
from anthropic import AsyncAnthropic

DEALS_FILE = Path(__file__).parent / "deals.json"
MAX_DEALS  = 40       # keep most recent N deals
MAX_AGE_H  = 24       # deals older than this are stale

# Products to scan — mix of popular categories
SEED_QUERIES = [
    # Electronics
    {"title": "Xiaomi אוזניות Redmi Buds 4", "price_usd": 18.0, "specs": {}},
    {"title": "USB-C רכזת 7 ב-1", "price_usd": 12.0, "specs": {}},
    {"title": "מטען אלחוטי 15W", "price_usd": 8.0, "specs": {}},
    {"title": "Xiaomi Smart Band 8 שעון ספורט", "price_usd": 28.0, "specs": {}},
    {"title": "מקלדת מכנית Bluetooth אלחוטית", "price_usd": 35.0, "specs": {}},
    {"title": "מצלמת אבטחה IP WiFi 4K", "price_usd": 22.0, "specs": {}},
    {"title": "תאורת LED RGB חכמה Tuya WiFi", "price_usd": 9.0, "specs": {}},
    {"title": "מדפסת תמונות נייד Bluetooth", "price_usd": 42.0, "specs": {}},
    # Tools & Home
    {"title": "מכונת קפה Nespresso תואם קפסולות", "price_usd": 45.0, "specs": {}},
    {"title": "מקדחה אלחוטית 12V", "price_usd": 25.0, "specs": {}},
    {"title": "מנקה קיטור ביתי", "price_usd": 30.0, "specs": {}},
    {"title": "שואב אבק רובוט WiFi", "price_usd": 60.0, "specs": {}},
    # Toys & Costume
    {"title": "תחפושת מתנפחת מבוגרים חג פורים", "price_usd": 24.0, "specs": {}},
    {"title": "מכונית RC שלט רחוק מהירה", "price_usd": 18.0, "specs": {}},
    {"title": "בלוקים Lego תואמים 500 חלקים", "price_usd": 15.0, "specs": {}},
]


def _load_deals() -> list:
    if DEALS_FILE.exists():
        try:
            return json.loads(DEALS_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return []


def _save_deals(deals: list):
    DEALS_FILE.write_text(
        json.dumps(deals, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )


def _is_fresh(deal: dict) -> bool:
    try:
        ts = datetime.fromisoformat(deal["published_at"])
        return datetime.now() - ts < timedelta(hours=MAX_AGE_H)
    except Exception:
        return False


async def _evaluate_one(seed: dict, client: AsyncAnthropic) -> Optional[dict]:
    """Run a single product through the matching pipeline and return a deal if worthwhile."""
    title     = seed["title"]
    price_usd = seed["price_usd"]
    specs     = seed.get("specs", {})

    try:
        identity = await extract_product_identity(title, specs, client)
        cost     = calculate_real_cost(price_usd)
        search_q = identity.get("search_query") or title[:40]
        online   = await search_online_stores_direct(search_q)

        priced_stores = [s for s in online if s.get("price_ils")]
        if not priced_stores:
            # Still publish as a "לא נמצא" deal — useful to show no local result
            return {
                "id": f"deal_{int(time.time())}_{hash(title) % 9999:04d}",
                "title": title,
                "search_query": search_q,
                "category_he": identity.get("category_he", ""),
                "brand": identity.get("brand", ""),
                "foreign_price_usd": price_usd,
                "foreign_total_ils": cost["total_cost_ils"],
                "best_local_price_ils": None,
                "best_local_store": None,
                "best_local_url": None,
                "savings_ils": None,
                "verdict": "not_found",
                "stores": online[:4],
                "published_at": datetime.now().isoformat(),
            }

        best = min(priced_stores, key=lambda s: s["price_ils"])
        diff = round(best["price_ils"] - cost["total_cost_ils"], 2)

        # Verdict
        if diff <= 0:
            verdict = "local_cheaper"      # Israeli store is cheaper than abroad!
        elif diff <= cost["total_cost_ils"] * 0.25:
            verdict = "close_price"        # within 25% — worth it to get it now
        else:
            verdict = "abroad_cheaper"     # abroad is significantly cheaper

        return {
            "id": f"deal_{int(time.time())}_{hash(title) % 9999:04d}",
            "title": title,
            "search_query": search_q,
            "category_he": identity.get("category_he", ""),
            "brand": identity.get("brand", ""),
            "foreign_price_usd": price_usd,
            "foreign_total_ils": cost["total_cost_ils"],
            "best_local_price_ils": best["price_ils"],
            "best_local_store": best["store"],
            "best_local_url": best["url"],
            "savings_ils": -diff if diff < 0 else None,
            "verdict": verdict,
            "stores": online[:6],
            "published_at": datetime.now().isoformat(),
        }
    except Exception as e:
        print(f"[agent] Error evaluating '{title}': {e}")
        return None


async def run_agent_cycle():
    """One full scan pass over all seed queries."""
    print(f"[agent] Starting deal scan at {datetime.now().isoformat()}")
    client  = AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))
    deals   = _load_deals()
    existing_titles = {d["title"] for d in deals}

    # Process seeds in small batches to avoid rate limits
    new_deals = []
    for i in range(0, len(SEED_QUERIES), 3):
        batch = SEED_QUERIES[i:i+3]
        results = await asyncio.gather(
            *[_evaluate_one(s, client) for s in batch],
            return_exceptions=True
        )
        for r in results:
            if isinstance(r, dict) and r.get("title") not in existing_titles:
                new_deals.append(r)
                existing_titles.add(r["title"])
        await asyncio.sleep(1)  # small pause between batches

    # Prepend new deals, drop stale ones, cap at MAX_DEALS
    all_deals = new_deals + [d for d in deals if _is_fresh(d)]
    all_deals = all_deals[:MAX_DEALS]
    _save_deals(all_deals)
    print(f"[agent] Done. {len(new_deals)} new deals, {len(all_deals)} total stored.")
    return all_deals


async def run_agent_forever(interval_minutes: int = 60):
    """Keep running the agent in a loop (for background task use)."""
    while True:
        try:
            await run_agent_cycle()
        except Exception as e:
            print(f"[agent] Cycle error: {e}")
        await asyncio.sleep(interval_minutes * 60)
