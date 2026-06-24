/**
 * Locali — Popup Script
 * Tab "Status": health check del servidor.
 * Tab "Inbox": buzon de inquiries con countdown timers animados.
 */

// ── Tabs ──────────────────────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'inbox') loadInbox();
  });
});

// ── Tab Status ────────────────────────────────────────────────────────────────

async function checkServer() {
  const dot = document.getElementById('server-dot');
  const statusEl = document.getElementById('server-status');
  const hintEl = document.getElementById('server-hint');
  try {
    const resp = await fetch('http://localhost:8000/health', {
      signal: AbortSignal.timeout(2000),
    });
    if (resp.ok) {
      const data = await resp.json();
      dot.classList.add('online');
      statusEl.textContent = 'השרת פעיל ✅';
      hintEl.textContent = 'גרסה ' + (data.version || '0.2.0');
    } else {
      throw new Error('non-ok');
    }
  } catch {
    dot.classList.add('offline');
    statusEl.textContent = 'השרת לא זמין ⚠️';
    hintEl.textContent = 'מצב Mock — הפעל את השרת';
  }
}

checkServer();

// ── Tab Inbox ─────────────────────────────────────────────────────────────────

const timers = {};

async function loadInbox() {
  const listEl = document.getElementById('inbox-list');
  const countEl = document.getElementById('inbox-count');
  listEl.innerHTML = '<div style="padding:20px;text-align:center;color:#475569;font-size:12px">טוען...</div>';

  let inquiries = [];
  try {
    const resp = await fetch('http://localhost:8000/inquiries', {
      signal: AbortSignal.timeout(3000),
    });
    if (resp.ok) inquiries = await resp.json();
  } catch {
    listEl.innerHTML = '<div class="inbox-empty"><div class="icon">⚠️</div><div>השרת לא זמין</div></div>';
    return;
  }

  // Clear old timers
  Object.keys(timers).forEach((k) => { clearInterval(timers[k]); delete timers[k]; });

  if (!inquiries.length) {
    listEl.innerHTML = '<div class="inbox-empty"><div class="icon">📬</div><div>אין שאילתות שנשלחו</div><div style="margin-top:4px;font-size:10px">לחץ "💬 שאל" ליד חנות בפאנל</div></div>';
    countEl.style.display = 'none';
    return;
  }

  // Show count of pending
  const pending = inquiries.filter((i) => i.status === 'pending').length;
  countEl.textContent = pending;
  countEl.style.display = pending > 0 ? 'inline' : 'none';

  // Sort: answered first, then pending by expiry, then expired
  const order = { answered: 0, pending: 1, expired: 2 };
  inquiries.sort((a, b) => (order[a.status] || 1) - (order[b.status] || 1));

  listEl.innerHTML = '';
  inquiries.forEach((inq) => {
    const card = buildCard(inq);
    listEl.appendChild(card);
    if (inq.status === 'pending') startCardTimer(card, inq);
  });
}

function buildCard(inq) {
  const card = document.createElement('div');
  card.className = 'inquiry-card ' + inq.status;
  card.dataset.id = inq.id;

  const chipClass = { pending: 'chip-pending', answered: 'chip-answered', expired: 'chip-expired' }[inq.status] || 'chip-pending';
  const chipText = { pending: 'ממתין', answered: 'ענה ✓', expired: 'פג תוקף' }[inq.status] || inq.status;

  const sentDate = new Date(inq.created_at).toLocaleString('he-IL', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  card.innerHTML = `
    <div class="inquiry-card-header">
      <div class="inquiry-store-name">${esc(inq.store_name)}</div>
      <span class="inquiry-status-chip ${chipClass}">${chipText}</span>
    </div>
    <div class="inquiry-product">${esc(inq.product_title)}</div>
    ${inq.status !== 'answered' ? `
    <div class="inquiry-timer" data-expires="${inq.expires_at * 1000}" data-total="${(inq.expires_minutes || 120) * 60000}">
      <div class="timer-bar-track"><div class="timer-bar-fill ${inq.status === 'expired' ? 'expired' : 'green'}"></div></div>
      <div class="timer-labels">
        <span class="timer-remaining">${inq.status === 'expired' ? 'פג תוקף' : ''}</span>
        <span class="timer-sent">נשלח ${sentDate}</span>
      </div>
    </div>` : `<div style="padding:0 12px 6px;font-size:10px;color:#475569">נשלח ${sentDate}</div>`}
    ${inq.status === 'answered' && inq.response_text ? `
    <div class="inquiry-response">
      <div class="inquiry-response-label">תשובת החנות:</div>
      ${esc(inq.response_text)}
    </div>` : ''}
    <div class="inquiry-card-footer">
      ${inq.wa_link ? `<a class="btn-wa" href="${esc(inq.wa_link)}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}
      <button class="btn-dismiss" data-id="${esc(inq.id)}">🗑 מחק</button>
    </div>`;

  card.querySelector('.btn-dismiss').addEventListener('click', () => dismissInquiry(inq.id, card));

  return card;
}

function startCardTimer(card, inq) {
  const timerEl = card.querySelector('.inquiry-timer');
  if (!timerEl) return;
  const fill = timerEl.querySelector('.timer-bar-fill');
  const label = timerEl.querySelector('.timer-remaining');
  const expiresAt = inq.expires_at * 1000;
  const totalMs = (inq.expires_minutes || 120) * 60000;

  function tick() {
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      fill.className = 'timer-bar-fill expired';
      fill.style.width = '0%';
      label.textContent = 'פג תוקף';
      clearInterval(timers[inq.id]);
      delete timers[inq.id];
      return;
    }
    const pct = Math.max(0, (remaining / totalMs) * 100);
    fill.style.width = pct + '%';
    fill.className = 'timer-bar-fill ' + (pct > 50 ? 'green' : pct > 20 ? 'yellow' : 'red');

    const h = Math.floor(remaining / 3600000);
    const m = Math.floor((remaining % 3600000) / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    label.textContent = h > 0
      ? `${h}ש' ${String(m).padStart(2, '0')}ד' נותרו`
      : `${m}:${String(s).padStart(2, '0')} נותרו`;
  }

  tick();
  timers[inq.id] = setInterval(tick, 1000);
}

async function dismissInquiry(id, card) {
  try {
    await fetch('http://localhost:8000/inquiries/' + id, {
      method: 'DELETE',
      signal: AbortSignal.timeout(3000),
    });
  } catch { /* ignore */ }
  card.style.transition = 'opacity 0.3s';
  card.style.opacity = '0';
  setTimeout(() => { card.remove(); loadInbox(); }, 300);
}

document.getElementById('refresh-btn').addEventListener('click', loadInbox);

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
