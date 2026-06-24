"""
AliLocal — Playwright Scraper
Extrae precios reales de KSP y BUG.
"""

import asyncio
import re
from typing import Optional
from urllib.parse import quote

try:
    from playwright.async_api import async_playwright
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False

_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"


async def scrape_ksp(query: str) -> list:
    if not PLAYWRIGHT_AVAILABLE:
        return []
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await (await browser.new_context(user_agent=_UA, locale="he-IL")).new_page()
            await page.goto(f"https://ksp.co.il/web/cat/?search={quote(query)}", timeout=25000, wait_until="networkidle")
            await asyncio.sleep(1)

            # Get product URLs from the card links we found
            products = await page.evaluate("""() => {
                const results = [];
                const cards = document.querySelectorAll('[class*="cardRoot"]');
                cards.forEach((card, i) => {
                    if (i >= 4) return;
                    const nameEl = card.querySelector('[class*="name"], [class*="Name"]');
                    const name = nameEl ? nameEl.textContent.trim() : '';
                    // KSP price: look for element with class containing 'price' or 'Price'
                    const priceEl = card.querySelector('[class*="price"], [class*="Price"], [class*="cost"]');
                    const priceText = priceEl ? priceEl.textContent.trim() : '';
                    // fallback: scan all text for number followed by shekel sign
                    const fullText = card.innerText || '';
                    const link = card.querySelector('a') ? card.querySelector('a').href : '';
                    if (name.length > 2) {
                        results.push({ name, priceText, fullText: fullText.slice(0, 200), url: link });
                    }
                });
                return results;
            }""")

            await browser.close()

            out = []
            for item in products[:3]:
                name = item.get("name", "").strip()
                if not name:
                    continue
                # Try priceEl first, then scan full card text
                price = _parse_ils(item.get("priceText", ""))
                if not price:
                    price = _extract_price_from_text(item.get("fullText", ""))
                url = item.get("url") or f"https://ksp.co.il/web/cat/?search={quote(query)}"
                out.append({"store": "ksp", "title": name, "price_ils": price,
                            "url": url, "tier": "possible", "score": 0.6 if price else 0.4})
            print(f"[ksp-playwright] {len(out)} products")
            return out
    except Exception as e:
        print(f"[ksp-playwright] Error: {e}")
        return []


async def scrape_bug(query: str) -> list:
    if not PLAYWRIGHT_AVAILABLE:
        return []
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await (await browser.new_context(user_agent=_UA, locale="he-IL")).new_page()
            await page.goto(f"https://www.bug.co.il/search?q={quote(query)}", timeout=25000, wait_until="networkidle")
            await asyncio.sleep(3)

            # Dump all text to see what's on the page
            products = await page.evaluate("""() => {
                const results = [];
                // BUG is a Next.js app — try __NEXT_DATA__ first
                const nextData = document.getElementById('__NEXT_DATA__');
                if (nextData) {
                    try {
                        const data = JSON.parse(nextData.textContent);
                        const props = data.props?.pageProps;
                        const items = props?.searchResult?.products ||
                                      props?.products ||
                                      props?.items || [];
                        items.slice(0, 4).forEach(item => {
                            const name = item.name || item.title || item.productName || '';
                            const price = item.price || item.salePrice || item.regularPrice || 0;
                            const slug = item.slug || item.url || item.id || '';
                            results.push({
                                name,
                                priceText: String(price),
                                url: slug ? 'https://www.bug.co.il/product/' + slug : ''
                            });
                        });
                    } catch(e) {}
                }
                // DOM fallback
                if (results.length === 0) {
                    const sels = ['[class*="ProductCard"]','[class*="product-card"]','[class*="ProductItem"]','article[class]'];
                    for (const sel of sels) {
                        const els = document.querySelectorAll(sel);
                        if (els.length >= 2) {
                            els.forEach((el, i) => {
                                if (i >= 4) return;
                                const name = el.querySelector('h1,h2,h3,h4,[class*="name"],[class*="title"]')?.textContent?.trim() || '';
                                const fullText = el.innerText || '';
                                const link = el.querySelector('a')?.href || '';
                                if (name.length > 2) results.push({ name, priceText: '', fullText: fullText.slice(0,200), url: link });
                            });
                            if (results.length > 0) break;
                        }
                    }
                }
                return results;
            }""")

            await browser.close()

            out = []
            for item in products[:3]:
                name = (item.get("name") or "").strip()
                if not name:
                    continue
                price = _parse_ils(item.get("priceText", ""))
                if not price:
                    price = _extract_price_from_text(item.get("fullText", ""))
                url = item.get("url") or f"https://www.bug.co.il/search?q={quote(query)}"
                if url and not url.startswith("http"):
                    url = "https://www.bug.co.il" + url
                out.append({"store": "bug", "title": name, "price_ils": price,
                            "url": url, "tier": "possible", "score": 0.6 if price else 0.4})
            print(f"[bug-playwright] {len(out)} products")
            return out
    except Exception as e:
        print(f"[bug-playwright] Error: {e}")
        return []


def _extract_price_from_text(text: str) -> Optional[float]:
    """Extrae el precio más plausible de un bloque de texto."""
    if not text:
        return None
    # Match patterns like "1,299" or "299" near shekel signs
    matches = re.findall(r'(\d[\d,]{1,5})\s*(?:₪|ש"ח|שח)', text)
    if not matches:
        # fallback: any 3-5 digit number
        matches = re.findall(r'\b(\d{3,5})\b', text)
    for m in matches:
        val = _parse_ils(m)
        if val:
            return val
    return None


def _parse_ils(text: str) -> Optional[float]:
    if not text:
        return None
    cleaned = re.sub(r"[^\d]", "", str(text))
    try:
        val = float(cleaned)
        return val if 10 < val < 50000 else None
    except Exception:
        return None


async def scrape_all(query: str) -> list:
    ksp, bug = await asyncio.gather(scrape_ksp(query), scrape_bug(query))
    return ksp + bug


if __name__ == "__main__":
    import sys
    q = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "מקדחה אלחוטית"
    results = asyncio.run(scrape_all(q))
    print(f"\n=== {len(results)} resultados para '{q}' ===")
    for r in results:
        p = f"ILS{r['price_ils']}" if r['price_ils'] else "sin precio"
        print(f"  [{r['store'].upper()}] {r['title'][:60]}")
        print(f"         {p} | {r['url'][:70]}")
