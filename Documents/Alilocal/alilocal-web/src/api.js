const BASE = import.meta.env.VITE_API_URL || '/api'

export async function fetchMatch({ title, price_usd, item_id, user_lat, user_lng, specs = {} }) {
  const res = await fetch(`${BASE}/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item_id, title, price_usd, specs, user_lat, user_lng }),
  })
  if (!res.ok) throw new Error(`Backend error ${res.status}`)
  return res.json()
}

export async function fetchInquiries() {
  const res = await fetch(`${BASE}/inquiries`)
  if (!res.ok) throw new Error(`Backend error ${res.status}`)
  return res.json()
}

export async function createInquiry(payload) {
  const res = await fetch(`${BASE}/inquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`Backend error ${res.status}`)
  return res.json()
}

export async function dismissInquiry(id) {
  const res = await fetch(`${BASE}/inquiries/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Backend error ${res.status}`)
  return res.json()
}

export function buildWaLink(phone, productTitle, priceUsd) {
  const clean = phone.replace(/\D/g, '')
  const msg = encodeURIComponent(`שלום, יש לכם "${productTitle}"? מצאתי אותו ב-AliExpress ב-$${priceUsd}`)
  return `https://wa.me/${clean}?text=${msg}`
}
