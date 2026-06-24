/**
 * Locali — Content Script
 * Se inyecta en paginas de producto de AliExpress.
 * Extrae datos del DOM, obtiene geolocalizacion y muestra el panel.
 */

(function () {
  'use strict';

  if (window.__aliLocalLoaded) return;
  window.__aliLocalLoaded = true;

  // ── Config ────────────────────────────────────────────────────────────────
  // PROD: cambiar a la URL de Vercel después del deploy, ej. 'https://locali.vercel.app'
  const LOCALI_WEB_BASE = 'https://karovil.duckdns.org';


  // ── Extraccion del producto ───────────────────────────────────────────────

  function extractItemId() {
    const match = location.pathname.match(/\/item\/(\d+)\.html/);
    return match ? match[1] : null;
  }

  function extractTitle() {
    const selectors = [
      'h1[data-pl="product-title"]',
      'h1.product-title-text',
      '.product-title h1',
      '[class*="title--wrap"] h1',
      '[class*="product--title"]',
      'h1',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim().length > 5) return el.textContent.trim();
    }
    return document.title.replace('AliExpress', '').trim() || 'Producto desconocido';
  }

  // Tasa de conversión ILS→USD (AliExpress Israel muestra precios en ₪)
  const ILS_TO_USD = 1 / 3.75;

  function _parsePriceText(text) {
    // Detecta si el precio es en ILS (₪) o USD ($) y devuelve USD
    const ilsMatch = text.match(/₪\s*([\d,]+\.?\d*)/);
    if (ilsMatch) {
      const ils = parseFloat(ilsMatch[1].replace(',', ''));
      return ils > 0 ? +(ils * ILS_TO_USD).toFixed(2) : 0;
    }
    const usdMatch = text.match(/(?:US\s*)?\$\s*([\d,]+\.?\d*)/i);
    if (usdMatch) {
      const usd = parseFloat(usdMatch[1].replace(',', ''));
      return usd > 0 ? usd : 0;
    }
    return 0;
  }

  function extractPrice() {
    // 1. Selectores CSS específicos (USD y ILS)
    const selectors = [
      // He.aliexpress.com (versión hebrea) — clases obfuscadas
      '._3DRNh',
      // www.aliexpress.com — clases BEM
      '[class*="price--current"] [class*="price--amount"]',
      '[class*="uniform-banner-box-price"]',
      '[class*="product-price-current"]',
      '.product-price-value',
      '[data-pl="product-price"] [class*="price"]',
      '[class*="snow-price_SnowPrice"] [class*="main--"]',
      '[class*="Price_price"]',
      '[class*="price-container"] [class*="amount"]',
      '[class*="sale-price"]',
      '[class*="pdp-price"]',
      'div[class*="price"] span[class*="notranslate"]',
    ];

    // Para ._3DRNh: hay muchos en la página (productos recomendados también).
    // Tomamos el primero que esté dentro del área del producto principal (pdp-body)
    // excluyendo secciones de "también te puede gustar"
    const pdpBody = document.querySelector('.pdp-body, .pdp-wrap, [class*="product-main"]');
    const searchRoot = pdpBody || document;

    for (const sel of selectors) {
      const el = searchRoot.querySelector(sel);
      if (el) {
        const val = _parsePriceText(el.textContent);
        if (val > 0) return val;
      }
    }

    // 2. Buscar en el texto visible de la página (primer precio ₪ o $)
    const pageText = (pdpBody || document.body).innerText;
    const val = _parsePriceText(pageText);
    if (val > 0 && val < 10000) return val;

    // 3. Buscar en scripts JSON embebidos
    try {
      const scripts = document.querySelectorAll('script[type="application/json"], script#__NEXT_DATA__');
      for (const s of scripts) {
        const text = s.textContent;
        // Buscar patrones de precio numérico
        const pm = text.match(/"(?:salePrice|price|currentPrice)"\s*:\s*\{[^}]*"value"\s*:\s*"?([\d.]+)"?/);
        if (pm) {
          const v = parseFloat(pm[1]);
          if (v > 0 && v < 10000) return v; // asumimos USD si viene de JSON
        }
      }
    } catch(e) {}

    return 0;
  }

  function extractShipping() {
    const shippingSelectors = [
      '[class*="shipping"] [class*="price"]',
      '[class*="freight"] [class*="price"]',
      '[class*="delivery"] [class*="price"]',
      '[class*="shipping-price"]',
      '[class*="shippingFee"]',
      '[class*="freight-price"]',
    ];
    for (const sel of shippingSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.textContent;
        if (/free|חינם|gratis|0\.00/i.test(text)) return 0;
        const val = _parsePriceText(text);
        if (val > 0 && val < 100) return val;
      }
    }
    return 0;
  }

  function extractImageUrl() {
    const selectors = [
      '[class*="image--img"]',
      '[class*="product-image"] img',
      '.main-image img',
      '.pdp-image img',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.src && el.src.startsWith('http')) return el.src;
    }
    return '';
  }

  function extractSpecs() {
    const specs = {};
    document.querySelectorAll(
      '[class*="specification--list"] li, [class*="product-prop"] .item'
    ).forEach((row) => {
      const k = row.querySelector('[class*="specification--title"], .attr-name');
      const v = row.querySelector('[class*="specification--desc"], .attr-value');
      if (k && v) specs[k.textContent.trim()] = v.textContent.trim();
    });
    return specs;
  }

  // ── Generic extraction (any website) ─────────────────────────────────────

  function isAliExpressProductPage() {
    return /aliexpress\.com/.test(location.hostname) && /\/item\//.test(location.pathname);
  }

  /** Generates a stable ID from the current URL for non-AliExpress pages */
  function extractGenericItemId() {
    const h = location.hostname;
    if (/amazon/.test(h)) {
      const m = location.pathname.match(/\/dp\/([A-Z0-9]{10})/);
      if (m) return 'amz_' + m[1];
    }
    if (/ebay/.test(h)) {
      const m = location.pathname.match(/\/itm\/(\d+)/);
      if (m) return 'ebay_' + m[1];
    }
    // Generic: hash of origin + pathname
    const url = location.origin + location.pathname;
    let hash = 0;
    for (let i = 0; i < url.length; i++) { hash = ((hash << 5) - hash) + url.charCodeAt(i); hash |= 0; }
    return 'web_' + Math.abs(hash).toString(36);
  }

  function _getJsonLdProduct() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const s of scripts) {
      try {
        const data = JSON.parse(s.textContent);
        if (data?.['@type'] === 'Product') return data;
        if (Array.isArray(data)) { const p = data.find(d => d?.['@type'] === 'Product'); if (p) return p; }
        if (data?.['@graph']) { const p = data['@graph'].find(d => d?.['@type'] === 'Product'); if (p) return p; }
      } catch(e) {}
    }
    return null;
  }

  function extractGenericTitle() {
    const product = _getJsonLdProduct();
    if (product?.name) return product.name;
    const og = document.querySelector('meta[property="og:title"]')?.content;
    if (og) return og;
    return extractTitle();
  }

  function extractGenericPrice() {
    const product = _getJsonLdProduct();
    if (product) {
      const offers = product.offers;
      const offer = Array.isArray(offers) ? offers[0] : offers;
      const raw = offer?.price ?? offer?.lowPrice;
      if (raw) {
        const p = parseFloat(raw);
        const currency = offer?.priceCurrency || '';
        if (p > 0) return currency === 'ILS' ? +(p / 3.75).toFixed(2) : p;
      }
    }
    // Open Graph product price
    const ogAmt = document.querySelector('meta[property="product:price:amount"]')?.content
                || document.querySelector('meta[property="og:price:amount"]')?.content;
    if (ogAmt) {
      const currency = document.querySelector('meta[property="product:price:currency"]')?.content || '';
      const p = parseFloat(ogAmt);
      if (p > 0) return currency === 'ILS' ? +(p / 3.75).toFixed(2) : p;
    }
    return extractPrice();
  }

  function extractGenericImage() {
    const product = _getJsonLdProduct();
    const img = product?.image;
    if (typeof img === 'string' && img.startsWith('http')) return img;
    if (Array.isArray(img) && img[0]?.startsWith('http')) return img[0];
    const og = document.querySelector('meta[property="og:image"]')?.content;
    if (og) return og;
    return extractImageUrl();
  }

  // ── Geolocalizacion ───────────────────────────────────────────────────────

  function getLocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ lat: 32.0853, lng: 34.7818 });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve({ lat: 32.0853, lng: 34.7818 }),
        { timeout: 5000, maximumAge: 300000 }
      );
    });
  }

  // ── Proxy al background service worker ───────────────────────────────────

  function sendToBackground(type, payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, payload }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  async function fetchMatch(itemId, title, priceUsd, specs, lat, lng) {
    const response = await sendToBackground('FETCH_MATCH', {
      item_id: itemId,
      title,
      price_usd: priceUsd,
      specs,
      user_lat: lat,
      user_lng: lng,
    });
    if (!response?.ok) throw new Error(response?.error || 'Backend error');
    return response.data;
  }

  async function postManualRequest(itemId, title, priceUsd, lat, lng) {
    try {
      await sendToBackground('FETCH_MANUAL_REQUEST', {
        item_id: itemId, title, price_usd: priceUsd, user_lat: lat, user_lng: lng,
      });
    } catch (e) {
      console.warn('[Locali] Could not save manual request:', e);
    }
  }

  async function sendInquiry(store, title, priceUsd, imageUrl, expiresMinutes) {
    const response = await sendToBackground('SEND_INQUIRY', {
      store_name: store.name || store.store || '',
      store_phone: store.phone || '',
      store_email: '',
      store_website: store.website || store.url || '',
      product_title: title,
      price_usd: priceUsd,
      image_url: imageUrl,
      expires_minutes: expiresMinutes,
    });
    if (!response?.ok) throw new Error(response?.error || 'Error enviando consulta');
    return response.data;
  }

  // ── Logica principal ──────────────────────────────────────────────────────

  let _currentData = null;
  let _currentCtx = null;

  async function init() {
    const itemId = extractItemId();
    if (!itemId) return;

    const panel = createPanel();
    document.body.appendChild(panel);
    showLoading(panel);

    try {
      const title = extractGenericTitle();
      const basePrice = extractGenericPrice();
      const shipping = extractShipping();
      const priceUsd = basePrice > 0 ? +(basePrice + shipping).toFixed(2) : 0;
      const specs = extractSpecs();
      const imageUrl = extractImageUrl();
      const { lat, lng } = await getLocation();
      const data = await fetchMatch(itemId, title, priceUsd, specs, lat, lng);
      _currentData = data;
      _currentCtx = { itemId, title, priceUsd, basePrice, shipping, imageUrl, lat, lng };
      showResult(panel, data, _currentCtx);
    } catch (err) {
      console.error('[Locali] Error:', err);
      showError(panel, err.message);
    }
  }

  // ── Panel DOM ─────────────────────────────────────────────────────────────

  function createPanel() {
    const panel = document.createElement('div');
    panel.id = 'locali-panel';
    const closeBtn = document.createElement('button');
    closeBtn.id = 'locali-close';
    closeBtn.innerHTML = '✕';
    closeBtn.addEventListener('click', () => panel.classList.add('locali-hidden'));
    panel.appendChild(closeBtn);

    // Posición guardada (drag & drop)
    try {
      const saved = JSON.parse(localStorage.getItem('locali_panel_pos') || 'null');
      if (saved && saved.top && saved.left) {
        panel.style.top = saved.top;
        panel.style.left = saved.left;
        panel.style.right = 'auto';
      }
    } catch (e) {}

    // Estado minimizado guardado
    if (localStorage.getItem('locali_panel_min') === '1') panel.classList.add('locali-min');

    // Minimizar/expandir (delegación: el header se re-renderiza)
    panel.addEventListener('click', (e) => {
      if (e.target.closest('#locali-minimize')) {
        panel.classList.toggle('locali-min');
        localStorage.setItem('locali_panel_min', panel.classList.contains('locali-min') ? '1' : '0');
      }
    });

    enableDrag(panel);

    // Animación de entrada (slide-in desde la derecha)
    requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('locali-in')));
    return panel;
  }

  function enableDrag(panel) {
    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
    panel.addEventListener('mousedown', (e) => {
      if (!e.target.closest('.locali-header') || e.target.closest('button')) return;
      dragging = true;
      const rect = panel.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; ox = rect.left; oy = rect.top;
      panel.classList.add('locali-dragging');
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      let nl = ox + e.clientX - sx;
      let nt = oy + e.clientY - sy;
      nl = Math.max(0, Math.min(nl, window.innerWidth - panel.offsetWidth));
      nt = Math.max(0, Math.min(nt, window.innerHeight - 48));
      panel.style.left = nl + 'px';
      panel.style.top = nt + 'px';
      panel.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      panel.classList.remove('locali-dragging');
      localStorage.setItem('locali_panel_pos', JSON.stringify({ top: panel.style.top, left: panel.style.left }));
    });
  }

  function headerHtml() {
    return `<div class="locali-header">
      <span class="locali-logo"><span style="font-weight:900;color:#fff">Loca</span><span style="font-weight:900;color:#93b4ff">li</span></span>
      <button id="locali-minimize" title="מזער / הרחב">▁</button>
    </div>`;
  }

  function showSavingsToast(amount) {
    if (document.getElementById('locali-toast')) return;
    const t = document.createElement('div');
    t.id = 'locali-toast';
    t.innerHTML = `🎉 <strong>חוסכים ₪${amount}</strong> בקנייה בישראל — וקבלה היום!`;
    document.body.appendChild(t);
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('locali-toast-in')));
    setTimeout(() => {
      t.classList.remove('locali-toast-in');
      setTimeout(() => t.remove(), 450);
    }, 5500);
  }

  function getOrCreateBody(panel) {
    let body = panel.querySelector('.locali-body');
    if (!body) {
      body = document.createElement('div');
      body.className = 'locali-body';
      panel.appendChild(body);
    }
    return body;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Estados del panel ─────────────────────────────────────────────────────

  function showLoading(panel) {
    const skeletonCard = `
      <div class="locali-skel-card">
        <div class="locali-skel locali-skel-line" style="width:55%"></div>
        <div class="locali-skel locali-skel-line" style="width:85%"></div>
        <div class="locali-skel locali-skel-line" style="width:40%"></div>
      </div>`;
    getOrCreateBody(panel).innerHTML = `
      ${headerHtml()}
      <div class="locali-loading">
        <span class="locali-loading-label">מחפש מחירים מקומיים...</span>
      </div>
      ${skeletonCard}${skeletonCard}${skeletonCard}`;
  }

  function showError(panel) {
    getOrCreateBody(panel).innerHTML = `
      ${headerHtml()}
      <div class="locali-error">
        <p>⚠️ השרת לא זמין</p>
        <p class="locali-hint">הפעל את השרת המקומי:<br><code>uvicorn main:app</code></p>
      </div>`;
  }

  function showResult(panel, data, ctx) {
    const body = getOrCreateBody(panel);
    const { identity, cost_analysis: cost, online, physical } = data;
    const { itemId, title, priceUsd, basePrice, shipping, imageUrl, lat, lng } = ctx;

    const bestOnline = online?.length
      ? Math.min(...online.map((s) => s.price_ils || Infinity))
      : null;
    const diff = bestOnline !== null && bestOnline < Infinity && cost?.total_cost_ils
      ? Math.round(bestOnline - cost.total_cost_ils)
      : null;

    let summaryHtml = '';
    if (diff !== null) {
      if (diff > 0)
        summaryHtml = `<div class="locali-summary locali-summary-save">💡 AliExpress זול ב-₪${diff} אבל תחכה ${cost.shipping_days_estimate} ימים</div>`;
      else if (diff < 0)
        summaryHtml = `<div class="locali-summary locali-summary-local">💡 חנות מקומית זולה ב-₪${Math.abs(diff)} — קבל היום!</div>`;
      else
        summaryHtml = `<div class="locali-summary">💡 מחיר זהה — עדיף לקנות מקומי</div>`;
    }

    const vatBadge = cost?.vat_applies
      ? `<span class="locali-vat locali-vat-yes">⚠️ +₪${cost.vat_amount_ils} מע"מ יבוא</span>`
      : `<span class="locali-vat locali-vat-no">✅ פטור מע"מ (מתחת $75)</span>`;

    const onlineHtml = online?.length
      ? online.map((s) => storeOnlineHtml(s, title, priceUsd, imageUrl)).join('')
      : `<p class="locali-empty">לא נמצאו חנויות אונליין</p>`;

    const physicalHtml = physical?.length
      ? physical.map((s) => storePhysicalHtml(s, title, priceUsd, imageUrl)).join('')
      : `<p class="locali-empty">לא נמצאו חנויות פיזיות</p>`;

    const hasResults = (online?.length || 0) + (physical?.length || 0) > 0;
    const noResultsHtml = !hasResults ? `
      <div class="locali-no-results">
        <p>לא נמצאו חנויות מקומיות</p>
        <button class="locali-btn locali-btn-secondary" id="locali-manual-btn">בקש חיפוש ידני</button>
      </div>` : '';

    body.innerHTML = `
      ${headerHtml()}
      <div class="locali-product">
        <div class="locali-product-name">${escapeHtml((identity?.model || title).slice(0, 50))}</div>
      </div>
      <div class="locali-section">
        <div class="locali-section-title">AliExpress</div>
        <div class="locali-price-row">
          <span class="locali-price-ali">$${basePrice || priceUsd}${cost?.aliexpress_price_ils ? ` = ₪${cost.aliexpress_price_ils}` : ''}</span>
          ${cost ? (shipping > 0 ? `<span class="locali-shipping-fee">+ $${shipping} משלוח</span>` : '<span class="locali-shipping-free">✈ משלוח חינם</span>') : ''}
        </div>
        ${cost ? vatBadge : ''}
        ${cost ? `<div class="locali-shipping">📦 ~${cost.shipping_days_estimate} ימי משלוח</div>` : ''}
        ${cost?.vat_applies ? `<div class="locali-total">סה"כ עם מע"מ: <strong>₪${cost.total_cost_ils}</strong></div>` : ''}
      </div>
      <div class="locali-section">
        <div class="locali-section-title-row">
          <span class="locali-section-title">🏪 חנויות מקומיות</span>
          ${physical?.length ? `<button class="locali-radar-btn" id="locali-radar-btn">🛰 מכ"מ</button>` : ''}
        </div>
        <div class="locali-section-sub">לחץ "שאל" כדי לשלוח שאילתה לחנות</div>
        ${onlineHtml}
        ${physicalHtml}
        ${noResultsHtml}
      </div>
      ${summaryHtml}
      <div class="locali-cta-wrap">
        <a id="locali-web-btn" href="#" target="_blank" rel="noopener" class="locali-cta-btn">
          <span class="locali-cta-icon">🚀</span>
          <span class="locali-cta-text">
            <span class="locali-cta-main">פתח השוואה מלאה</span>
            <span class="locali-cta-sub">כל החנויות הישראליות · מחירים חיים</span>
          </span>
          <span class="locali-cta-arrow">‹</span>
        </a>
      </div>`;

    // Badge en el ícono de la extensión con el número de tiendas encontradas
    const storeCount = (online?.length || 0) + (physical?.length || 0);
    sendToBackground('SET_BADGE', { count: storeCount }).catch(() => {});

    // Toast de ahorro si la tienda local es más barata que AliExpress
    if (diff !== null && diff < 0) showSavingsToast(Math.abs(diff));

    // Build web URL and bind the open-in-browser button
    const webUrl = `${LOCALI_WEB_BASE}/compare?` + new URLSearchParams({
      title:    title,
      price:    String(priceUsd),
      item_id:  itemId,
      image:    imageUrl || '',
    }).toString();
    body.querySelector('#locali-web-btn')?.setAttribute('href', webUrl);

    // Bind manual request button
    body.querySelector('#locali-manual-btn')?.addEventListener('click', async function() {
      this.disabled = true; this.textContent = 'שולח...';
      await postManualRequest(itemId, title, priceUsd, lat, lng);
      this.textContent = '✅ הבקשה נשלחה';
    });

    // Bind radar button
    body.querySelector('#locali-radar-btn')?.addEventListener('click', () => {
      showRadarOverlay(panel, physical || [], lat, lng);
    });

    // Bind inquiry buttons
    body.querySelectorAll('[data-inquiry-store]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const storeKey = btn.dataset.inquiryStore;
        const storeData = JSON.parse(decodeURIComponent(btn.dataset.storeJson));
        showTimePicker(panel, storeData, title, priceUsd, imageUrl);
      });
    });
  }

  // ── Time Picker ───────────────────────────────────────────────────────────

  function showTimePicker(panel, store, title, priceUsd, imageUrl) {
    const overlay = document.createElement('div');
    overlay.className = 'locali-overlay';
    overlay.innerHTML = `
      <div class="locali-picker">
        <button class="locali-picker-close">✕</button>
        <div class="locali-picker-title">שאל את החנות</div>
        <div class="locali-picker-store">${escapeHtml(store.name || store.store || '')}</div>
        <div class="locali-picker-label">כמה זמן לחכות לתשובה?</div>
        <div class="locali-time-options">
          <button class="locali-time-btn" data-minutes="60">1 שעה</button>
          <button class="locali-time-btn locali-time-btn-active" data-minutes="120">2 שעות</button>
          <button class="locali-time-btn" data-minutes="240">4 שעות</button>
          <button class="locali-time-btn" data-minutes="1440">יום שלם</button>
        </div>
        <div class="locali-picker-msg">
          <div class="locali-msg-preview">מחפש מחיר...</div>
        </div>
        <button class="locali-send-btn">📤 שלח שאילתה</button>
        <div class="locali-send-status"></div>
      </div>`;

    panel.appendChild(overlay);

    let selectedMinutes = 120;

    // Time option buttons
    overlay.querySelectorAll('.locali-time-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        overlay.querySelectorAll('.locali-time-btn').forEach((b) => b.classList.remove('locali-time-btn-active'));
        btn.classList.add('locali-time-btn-active');
        selectedMinutes = parseInt(btn.dataset.minutes, 10);
      });
    });

    overlay.querySelector('.locali-picker-close').addEventListener('click', () => overlay.remove());

    const sendBtn = overlay.querySelector('.locali-send-btn');
    const statusEl = overlay.querySelector('.locali-send-status');

    sendBtn.addEventListener('click', async () => {
      sendBtn.disabled = true;
      sendBtn.textContent = 'שולח...';
      statusEl.textContent = '';

      try {
        const result = await sendInquiry(store, title, priceUsd, imageUrl, selectedMinutes);

        // If mock mode: open WhatsApp link
        if (result.wa_link && !result.sent_automatically) {
          window.open(result.wa_link, '_blank', 'noopener');
        }

        overlay.remove();
        showInquirySent(panel, store, result, selectedMinutes);
      } catch (err) {
        statusEl.textContent = '⚠️ שגיאה: ' + err.message;
        sendBtn.disabled = false;
        sendBtn.textContent = '📤 שלח שאילתה';
      }
    });
  }

  function showInquirySent(panel, store, result, expiresMinutes) {
    // Add a sent-confirmation card above the store card
    const confirmDiv = document.createElement('div');
    confirmDiv.className = 'locali-inquiry-sent';
    confirmDiv.innerHTML = `
      <span class="locali-inquiry-sent-icon">✅</span>
      <span>שאילתה נשלחה ל-${escapeHtml(store.name || store.store || '')} #${result.inquiry_id}</span>
      <div class="locali-inquiry-timer" data-expires="${Date.now() + expiresMinutes * 60000}" data-id="${result.inquiry_id}">
        <div class="locali-timer-bar"><div class="locali-timer-fill"></div></div>
        <span class="locali-timer-label"></span>
      </div>`;
    getOrCreateBody(panel).appendChild(confirmDiv);
    startTimerUpdate(confirmDiv.querySelector('.locali-inquiry-timer'), expiresMinutes * 60000);
  }

  function startTimerUpdate(timerEl, totalMs) {
    const fill = timerEl.querySelector('.locali-timer-fill');
    const label = timerEl.querySelector('.locali-timer-label');
    const expiresAt = parseInt(timerEl.dataset.expires, 10);

    function update() {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        fill.style.width = '0%';
        fill.className = 'locali-timer-fill locali-timer-expired';
        label.textContent = 'פג תוקף';
        return;
      }
      const pct = Math.max(0, (remaining / totalMs) * 100);
      fill.style.width = pct + '%';
      fill.className = 'locali-timer-fill ' + (pct > 50 ? 'locali-timer-green' : pct > 20 ? 'locali-timer-yellow' : 'locali-timer-red');

      const h = Math.floor(remaining / 3600000);
      const m = Math.floor((remaining % 3600000) / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      label.textContent = h > 0 ? `${h}:${String(m).padStart(2,'0')} נותרו` : `${m}:${String(s).padStart(2,'0')} נותרו`;
      setTimeout(update, 1000);
    }
    update();
  }


  // ── Store HTML helpers ────────────────────────────────────────────────────

  function storeOnlineHtml(s, title, priceUsd, imageUrl) {
    const icons  = { exact: '✅', likely: '🔵', possible: '🟡', unknown: '⬜' };
    const labels = { exact: 'מדויק', likely: 'דומה', possible: 'אפשרי', unknown: '' };
    const icon   = icons[s.tier]  || '⬜';
    const label  = labels[s.tier] || '';
    const price  = s.price_ils ? `₪${s.price_ils}` : '';
    const storeJson = encodeURIComponent(JSON.stringify(s));
    return `
      <div class="locali-store">
        <div class="locali-store-row">
          <span class="locali-store-name">${(s.store || '').toUpperCase()}</span>
          ${label ? `<span class="locali-store-tier">${icon} ${label}</span>` : ''}
          ${price ? `<span class="locali-store-price">${price}</span>` : ''}
        </div>
        ${s.title && s.title !== title ? `<div class="locali-store-sub">${escapeHtml(s.title.slice(0, 60))}</div>` : ''}
        <div class="locali-store-actions">
          <a class="locali-link" href="${escapeHtml(s.url)}" target="_blank" rel="noopener">ראה בחנות ↗</a>
          <button class="locali-ask-btn"
            data-inquiry-store="${escapeHtml(s.store)}"
            data-store-json="${storeJson}">💬 שאל</button>
        </div>
      </div>`;
  }

  function storePhysicalHtml(s, title, priceUsd, imageUrl) {
    const storeJson = encodeURIComponent(JSON.stringify(s));
    const msg = encodeURIComponent(`שלום, יש לכם "${title}"? מצאתי אותו מחו״ל ב-$${priceUsd}`);
    const waHref = s.phone
      ? `https://wa.me/${s.phone.replace(/\D/g, '')}?text=${msg}`
      : null;
    const openBadge = s.open_now === true
      ? `<span class="locali-open">פתוח</span>`
      : s.open_now === false
      ? `<span class="locali-closed">סגור</span>`
      : '';
    return `
      <div class="locali-store locali-store-physical">
        <div class="locali-store-row">
          <span class="locali-store-name">${escapeHtml(s.name)}</span>
          ${openBadge}
        </div>
        <div class="locali-store-sub">${escapeHtml(s.address || '')}${s.distance_km ? ' · ' + s.distance_km + ' ק"מ' : ''}</div>
        <div class="locali-store-actions">
          ${s.website ? `<a class="locali-link" href="${escapeHtml(s.website)}" target="_blank" rel="noopener">🌐 אתר</a>` : ''}
          ${s.google_maps_url ? `<a class="locali-link" href="${escapeHtml(s.google_maps_url)}" target="_blank" rel="noopener">📍 מפה</a>` : ''}
          ${waHref ? `<a class="locali-link locali-link-wa" href="${escapeHtml(waHref)}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}
          <button class="locali-ask-btn"
            data-inquiry-store="${escapeHtml(s.name)}"
            data-store-json="${storeJson}">📤 שאל</button>
        </div>
      </div>`;
  }

  // ── Radar overlay ─────────────────────────────────────────────────────────

  function showRadarOverlay(panel, stores, userLat, userLng) {
    const existing = panel.querySelector('.locali-radar-overlay');
    if (existing) { existing.remove(); return; }

    const overlay = document.createElement('div');
    overlay.className = 'locali-overlay locali-radar-overlay';
    const SIZE = 260;
    const MAX_KM = Math.max(3, ...stores.map((s) => s.distance_km || 0)) + 1;

    const dots = stores.map((s, i) => {
      const angle = (i / stores.length) * 2 * Math.PI - Math.PI / 2;
      const r = Math.min((s.distance_km / MAX_KM) * (SIZE / 2 - 18), SIZE / 2 - 14);
      return {
        x: SIZE / 2 + r * Math.cos(angle),
        y: SIZE / 2 + r * Math.sin(angle),
        name: s.name, dist: s.distance_km,
        color: `hsl(${(i * 47) % 360},80%,60%)`,
      };
    });

    const legendHtml = stores.map((s, i) => `
      <div class="locali-radar-legend-item">
        <div class="ar-dot" style="background:${dots[i].color}"></div>
        <span class="ar-lname">${escapeHtml(s.name)}</span>
        <span class="ar-ldist">${s.distance_km} ק"מ</span>
      </div>`).join('');

    overlay.innerHTML = `
      <div class="locali-radar-hud">
        <div class="locali-radar-title">
          <span>🛰 RADAR — חנויות סמוכות</span>
          <button class="locali-picker-close" id="locali-radar-close">✕</button>
        </div>
        <div class="locali-radar-wrap">
          <canvas id="ar-canvas" width="${SIZE}" height="${SIZE}"></canvas>
        </div>
        <div class="locali-radar-legend">${legendHtml}</div>
      </div>`;

    panel.appendChild(overlay);
    overlay.querySelector('#locali-radar-close').addEventListener('click', () => overlay.remove());

    const canvas = overlay.querySelector('#ar-canvas');
    const ctx = canvas.getContext('2d');
    const cx = SIZE / 2, cy = SIZE / 2;

    let angle = 0, rafId;
    function draw() {
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.fillStyle = '#02050c';
      ctx.beginPath(); ctx.arc(cx, cy, SIZE / 2, 0, Math.PI * 2); ctx.fill();
      for (let ring = 1; ring <= 3; ring++) {
        const rr = (ring / 3) * (SIZE / 2 - 8);
        ctx.strokeStyle = '#00ffe722'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.strokeStyle = '#00ffe711'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, 4); ctx.lineTo(cx, SIZE - 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(4, cy); ctx.lineTo(SIZE - 4, cy); ctx.stroke();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      const sg = ctx.createLinearGradient(0, 0, SIZE / 2, 0);
      sg.addColorStop(0, '#00ffe744'); sg.addColorStop(1, '#00ffe700');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, SIZE / 2 - 4, -0.4, 0.4); ctx.closePath(); ctx.fill();
      ctx.restore();
      dots.forEach((d) => {
        ctx.beginPath(); ctx.arc(d.x, d.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = d.color; ctx.shadowColor = d.color; ctx.shadowBlur = 8;
        ctx.fill(); ctx.shadowBlur = 0;
      });
      ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ff4747'; ctx.fill();
    }
    function animate() { angle += 0.03; draw(); rafId = requestAnimationFrame(animate); }
    animate();
    const obs = new MutationObserver(() => {
      if (!document.contains(overlay)) { cancelAnimationFrame(rafId); obs.disconnect(); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  // ── Floating button (non-AliExpress pages) ───────────────────────────────

  function createFloatingButton() {
    if (document.getElementById('locali-fab')) return;
    const fab = document.createElement('button');
    fab.id = 'locali-fab';
    fab.innerHTML = `<span style="font-weight:900;color:#fff;font-size:15px">Loca</span><span style="font-weight:900;color:#93b4ff;font-size:15px">li</span>`;
    fab.title = 'השווה מחיר עם חנויות בישראל';
    fab.style.cssText = [
      'position:fixed', 'bottom:24px', 'right:16px', 'z-index:2147483646',
      'background:linear-gradient(135deg,#0038b8,#1d5fe8)',
      'border:none', 'border-radius:22px', 'padding:10px 18px',
      'font-family:-apple-system,sans-serif', 'cursor:pointer',
      'box-shadow:0 4px 18px #0038b860',
      'display:flex', 'align-items:center', 'gap:0',
      'transition:transform 0.15s,box-shadow 0.15s',
    ].join(';');
    fab.onmouseenter = () => {
      fab.style.transform = 'translateY(-2px)';
      fab.style.boxShadow = '0 8px 24px #0038b880';
    };
    fab.onmouseleave = () => {
      fab.style.transform = '';
      fab.style.boxShadow = '0 4px 18px #0038b860';
    };
    fab.addEventListener('click', () => { fab.remove(); initGeneric(); });
    document.body.appendChild(fab);
  }

  async function initGeneric() {
    const panel = document.getElementById('locali-panel') || createPanel();
    if (!document.contains(panel)) document.body.appendChild(panel);
    panel.classList.remove('locali-hidden');
    showLoading(panel);
    try {
      const itemId  = extractGenericItemId();
      const title   = extractGenericTitle();
      const imageUrl = extractGenericImage();
      const basePrice = extractGenericPrice();
      const shipping  = extractShipping();
      const priceUsd  = basePrice > 0 ? +(basePrice + shipping).toFixed(2) : 0;
      const specs = extractSpecs();
      const { lat, lng } = await getLocation();
      const data = await fetchMatch(itemId, title, priceUsd, specs, lat, lng);
      _currentData = data;
      _currentCtx = { itemId, title, priceUsd, basePrice, shipping, imageUrl, lat, lng };
      showResult(panel, data, _currentCtx);
    } catch (err) {
      console.error('[Locali] Error:', err);
      showError(panel, err.message);
    }
  }

  // ── Entry point ───────────────────────────────────────────────────────────

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  if (isAliExpressProductPage()) {
    onReady(init);
  } else {
    onReady(createFloatingButton);
  }

})(); // Locali v0.3.0
