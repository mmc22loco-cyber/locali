import { useState, useEffect, useCallback } from 'react'
import { fetchInquiries, dismissInquiry } from '../api.js'

const STATUS_META = {
  pending:   { label: 'ממתין',   color: '#f59e0b', bg: '#78350f22' },
  responded: { label: 'נענה',    color: '#22c55e', bg: '#14532d22' },
  expired:   { label: 'פג תוקף', color: '#94a3b8', bg: '#1e293b'  },
}

function useNow(interval = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(t)
  }, [interval])
  return now
}

function TimerBar({ expiresAt, createdAt }) {
  const now = useNow()
  const total = expiresAt - createdAt
  const remaining = expiresAt - now
  const pct = Math.max(0, Math.min(100, (remaining / total) * 100))

  let color = '#22c55e'
  if (pct < 20) color = '#ef4444'
  else if (pct < 50) color = '#eab308'

  const h = Math.floor(Math.max(0, remaining) / 3600000)
  const m = Math.floor((Math.max(0, remaining) % 3600000) / 60000)
  const s = Math.floor((Math.max(0, remaining) % 60000) / 1000)
  const label = remaining <= 0
    ? 'פג תוקף'
    : h > 0 ? `${h}:${String(m).padStart(2, '0')} נותרו`
    : `${m}:${String(s).padStart(2, '0')} נותרו`

  return (
    <div>
      <div style={{ height: 5, background: '#1e293b', borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
        <div style={{
          height: '100%', width: `${pct}%`, background: color,
          borderRadius: 3, transition: 'width 1s linear',
        }} />
      </div>
      <span style={{ fontSize: 11, color: '#64748b' }}>{label}</span>
    </div>
  )
}

function InquiryCard({ inq, onDismiss }) {
  const [dismissing, setDismissing] = useState(false)
  const meta = STATUS_META[inq.status] || STATUS_META.pending
  const expiresAt = new Date(inq.expires_at).getTime()
  const createdAt = new Date(inq.created_at).getTime()
  const waLink = inq.store_contact && inq.store_contact.startsWith('+')
    ? `https://wa.me/${inq.store_contact.replace(/\D/g, '')}`
    : null

  async function handleDismiss() {
    setDismissing(true)
    try {
      await dismissInquiry(inq.id)
      onDismiss(inq.id)
    } catch (e) {
      console.error(e)
      setDismissing(false)
    }
  }

  return (
    <div style={{
      background: '#0f172a', border: `1px solid ${meta.color}33`,
      borderRadius: 12, padding: '16px 18px', marginBottom: 12,
      opacity: dismissing ? 0.4 : 1, transition: 'opacity 0.3s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{inq.store_name}</span>
            <span style={{
              padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              color: meta.color, background: meta.bg, border: `1px solid ${meta.color}44`,
            }}>{meta.label}</span>
          </div>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>
            {inq.product_title?.slice(0, 70)}
            {inq.price_usd > 0 && ` · $${inq.price_usd}`}
          </div>
        </div>
        <span style={{ fontSize: 11, color: '#475569' }}>
          #{inq.id?.slice(0, 8).toUpperCase()}
        </span>
      </div>

      {inq.status === 'pending' && (
        <div style={{ marginBottom: 12 }}>
          <TimerBar expiresAt={expiresAt} createdAt={createdAt} />
        </div>
      )}

      {inq.status === 'responded' && inq.response && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, background: '#14532d22',
          border: '1px solid #14532d44', marginBottom: 12,
        }}>
          <div style={{ fontSize: 11, color: '#4ade80', marginBottom: 4, fontWeight: 600 }}>תשובת החנות:</div>
          <div style={{ fontSize: 13, color: '#86efac' }}>{inq.response}</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {waLink && (
          <a href={waLink} target="_blank" rel="noopener" style={{
            padding: '6px 12px', borderRadius: 7, background: '#14532d22',
            border: '1px solid #14532d44', color: '#4ade80',
            fontSize: 12, textDecoration: 'none', fontWeight: 600,
          }}>💬 פתח WhatsApp</a>
        )}
        {inq.store_website && (
          <a href={inq.store_website} target="_blank" rel="noopener" style={{
            padding: '6px 12px', borderRadius: 7, background: '#1d4ed822',
            border: '1px solid #1d4ed844', color: '#60a5fa',
            fontSize: 12, textDecoration: 'none',
          }}>🌐 אתר</a>
        )}
        <button onClick={handleDismiss} disabled={dismissing} style={{
          padding: '6px 12px', borderRadius: 7, background: '#1e293b',
          border: '1px solid #334155', color: '#64748b',
          fontSize: 12, marginRight: 'auto',
        }}>🗑 הסר</button>
      </div>
    </div>
  )
}

export default function Mailbox() {
  const [inquiries, setInquiries] = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [filter, setFilter]       = useState('all')

  const load = useCallback(async () => {
    try {
      const data = await fetchInquiries()
      setInquiries(data)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Auto-refresh every 30s
  useEffect(() => {
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [load])

  function handleDismiss(id) {
    setInquiries((prev) => prev.filter((i) => i.id !== id))
  }

  const filtered = filter === 'all'
    ? inquiries
    : inquiries.filter((i) => i.status === filter)

  const counts = {
    pending:   inquiries.filter((i) => i.status === 'pending').length,
    responded: inquiries.filter((i) => i.status === 'responded').length,
    expired:   inquiries.filter((i) => i.status === 'expired').length,
  }

  return (
    <main style={{ maxWidth: 700, margin: '0 auto', padding: '32px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }}>📬 הבוזן</h1>
          <p style={{ fontSize: 13, color: '#64748b' }}>שאילתות שנשלחו לחנויות מקומיות</p>
        </div>
        <button onClick={load} style={{
          padding: '8px 16px', borderRadius: 8, background: '#1e293b',
          border: '1px solid #334155', color: '#94a3b8', fontSize: 13,
        }}>🔄 רענן</button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          ['all', `הכל (${inquiries.length})`],
          ['pending',   `ממתים (${counts.pending})`],
          ['responded', `נענו (${counts.responded})`],
          ['expired',   `פגו (${counts.expired})`],
        ].map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val)} style={{
            padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
            background: filter === val ? '#FF474722' : '#1e293b',
            border: `1px solid ${filter === val ? '#FF474744' : '#334155'}`,
            color: filter === val ? '#FF4747' : '#94a3b8', cursor: 'pointer',
          }}>{label}</button>
        ))}
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
          <div style={{
            width: 36, height: 36, border: '3px solid #1e293b',
            borderTopColor: '#FF4747', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p>טוען...</p>
        </div>
      )}

      {error && (
        <div style={{
          padding: 16, borderRadius: 10, background: '#7f1d1d22',
          border: '1px solid #7f1d1d44', color: '#fca5a5', marginBottom: 20,
        }}>
          ⚠️ {error} — ודא שהשרת פועל
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#475569' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
          <p style={{ fontSize: 16, marginBottom: 8 }}>
            {filter === 'all' ? 'אין שאילתות עדיין' : `אין שאילתות בסטטוס "${filter}"`}
          </p>
          <p style={{ fontSize: 13 }}>
            שלח שאילתה מתוך הסיומת כדי שתופיע כאן
          </p>
        </div>
      )}

      {filtered.map((inq) => (
        <InquiryCard key={inq.id} inq={inq} onDismiss={handleDismiss} />
      ))}
    </main>
  )
}
