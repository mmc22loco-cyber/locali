/**
 * Locali — Background Service Worker
 * Proxy entre content script y backend.
 * El content script corre en HTTPS y no puede hacer fetch a http://localhost
 * (mixed content). El service worker no tiene esa restriccion.
 */

// PROD: cambiar a la URL de Railway después del deploy, ej. 'https://locali-backend.up.railway.app'
const BACKEND_URL = 'https://locali-production.up.railway.app';

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Locali] Extension installed v0.2.0');
  chrome.storage.local.set({
    enabled: true,
    backendUrl: BACKEND_URL,
    lastSeenItemId: null,
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ status: 'ok', backendUrl: BACKEND_URL });
    return true;
  }

  if (message.type === 'GET_BACKEND_URL') {
    chrome.storage.local.get('backendUrl', (result) => {
      sendResponse({ backendUrl: result.backendUrl || BACKEND_URL });
    });
    return true;
  }

  if (message.type === 'SAVE_ITEM_SEEN') {
    chrome.storage.local.set({ lastSeenItemId: message.itemId });
    sendResponse({ ok: true });
    return true;
  }

  // ── Proxy: POST /match ────────────────────────────────────────────────────
  if (message.type === 'FETCH_MATCH') {
    fetch(`${BACKEND_URL}/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message.payload),
      signal: AbortSignal.timeout(30000),
    })
      .then(async (resp) => {
        if (!resp.ok) throw new Error(`Backend error: ${resp.status}`);
        const data = await resp.json();
        sendResponse({ ok: true, data });
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  // ── Proxy: POST /manual-request ───────────────────────────────────────────
  if (message.type === 'FETCH_MANUAL_REQUEST') {
    fetch(`${BACKEND_URL}/manual-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message.payload),
      signal: AbortSignal.timeout(10000),
    })
      .then((resp) => sendResponse({ ok: resp.ok }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  // ── Proxy: GET /health ────────────────────────────────────────────────────
  if (message.type === 'FETCH_HEALTH') {
    fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(2000) })
      .then((resp) => sendResponse({ ok: resp.ok }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  // ── Proxy: POST /inquiries ────────────────────────────────────────────────
  if (message.type === 'SEND_INQUIRY') {
    fetch(`${BACKEND_URL}/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message.payload),
      signal: AbortSignal.timeout(15000),
    })
      .then(async (resp) => {
        if (!resp.ok) throw new Error(`Backend error: ${resp.status}`);
        const data = await resp.json();
        sendResponse({ ok: true, data });
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  // ── Proxy: GET /inquiries ─────────────────────────────────────────────────
  if (message.type === 'GET_INQUIRIES') {
    fetch(`${BACKEND_URL}/inquiries`, { signal: AbortSignal.timeout(5000) })
      .then(async (resp) => {
        if (!resp.ok) throw new Error(`Backend error: ${resp.status}`);
        const data = await resp.json();
        sendResponse({ ok: true, data });
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  // ── Proxy: DELETE /inquiries/:id ──────────────────────────────────────────
  if (message.type === 'DELETE_INQUIRY') {
    fetch(`${BACKEND_URL}/inquiries/${message.inquiryId}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(5000),
    })
      .then((resp) => sendResponse({ ok: resp.ok }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  // ── Badge con número de tiendas encontradas ──────────────────────────────
  if (message.type === 'SET_BADGE') {
    const count = message.payload?.count || 0;
    const text = count > 0 ? String(count) : '';
    chrome.action.setBadgeBackgroundColor({ color: '#0038b8' });
    chrome.action.setBadgeTextColor?.({ color: '#ffffff' });
    const tabId = sender?.tab?.id;
    if (tabId != null) chrome.action.setBadgeText({ text, tabId });
    else chrome.action.setBadgeText({ text });
    sendResponse({ ok: true });
    return true;
  }

  // ── Notificacion push ─────────────────────────────────────────────────────
  if (message.type === 'NOTIFY_RESULT') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Locali',
      message: message.text || 'Tienda local encontrada para tu producto',
      priority: 1,
    });
    sendResponse({ ok: true });
    return true;
  }
});

// Interceptar navegacion a AliExpress
chrome.webNavigation?.onCompleted?.addListener(
  (details) => {
    if (details.frameId !== 0) return;
    console.log('[Locali] AliExpress product page detected:', details.url);
  },
  { url: [{ urlMatches: 'https://[^/]*\\.aliexpress\\.com/item/.*' }] }
);
