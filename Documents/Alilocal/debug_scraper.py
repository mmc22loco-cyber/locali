"""Debug: guarda HTML de KSP y BUG para analizar selectores."""
import asyncio
from playwright.async_api import async_playwright
from urllib.parse import quote

async def debug(query):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
            locale="he-IL",
        )

        # ── KSP ──
        page = await ctx.new_page()
        await page.goto(f"https://ksp.co.il/web/cat/?search={quote(query)}", timeout=25000, wait_until="networkidle")
        await asyncio.sleep(2)
        html = await page.content()
        with open("ksp_debug.html", "w", encoding="utf-8") as f:
            f.write(html)
        # Print all class names that appear more than 3 times (likely product containers)
        import re
        classes = re.findall(r'class="([^"]{3,40})"', html)
        from collections import Counter
        top = Counter(classes).most_common(20)
        print("=== KSP top classes ===")
        for cls, cnt in top:
            print(f"  {cnt}x  .{cls.split()[0]}")

        # ── BUG ──
        page2 = await ctx.new_page()
        await page2.goto(f"https://www.bug.co.il/search?q={quote(query)}", timeout=25000, wait_until="networkidle")
        await asyncio.sleep(2)
        html2 = await page2.content()
        with open("bug_debug.html", "w", encoding="utf-8") as f:
            f.write(html2)
        classes2 = re.findall(r'class="([^"]{3,40})"', html2)
        top2 = Counter(classes2).most_common(20)
        print("\n=== BUG top classes ===")
        for cls, cnt in top2:
            print(f"  {cnt}x  .{cls.split()[0]}")

        await browser.close()

asyncio.run(debug("מקדחה אלחוטית"))
