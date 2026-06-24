import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'

const css = `
  @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
  @keyframes float { 0%,100%{transform:translateY(0) rotate(-2deg)} 50%{transform:translateY(-8px) rotate(-2deg)} }
  @keyframes float2 { 0%,100%{transform:translateY(0) rotate(3deg)} 50%{transform:translateY(-6px) rotate(3deg)} }
  @keyframes float3 { 0%,100%{transform:translateY(0) rotate(-1deg)} 50%{transform:translateY(-10px) rotate(-1deg)} }
  @keyframes shimmer { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
  @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  body { background: #f0f4ff !important; }
  .search-input:focus { border-color: #0038b8 !important; box-shadow: 0 0 0 3px #0038b820; outline:none; }
  .search-input { transition: border-color 0.15s, box-shadow 0.15s; outline:none; }
  .cta-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 24px #0038b840 !important; }
  .cta-btn { transition: transform 0.18s, box-shadow 0.18s; }
  .fcard:hover { transform: translateY(-4px); box-shadow: 0 12px 40px #0038b815 !important; }
  .fcard { transition: transform 0.2s, box-shadow 0.2s; }
  @keyframes meshMove {
    0%,100% { transform: translate(0,0) scale(1); }
    50% { transform: translate(30px,-20px) scale(1.12); }
  }
  @keyframes meshMove2 {
    0%,100% { transform: translate(0,0) scale(1.05); }
    50% { transform: translate(-35px,18px) scale(0.95); }
  }
  @keyframes gradFlow {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  .hero-grad {
    background: linear-gradient(270deg, #0038b8, #1d5fe8, #4d8eff, #0038b8);
    background-size: 300% 300%;
    animation: gradFlow 7s ease infinite;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .mesh-blob { position: absolute; border-radius: 50%; filter: blur(70px); pointer-events: none; }
  .cta-btn {
    background: linear-gradient(135deg, #0038b8, #1d5fe8) !important;
    background-size: 150% 150% !important;
  }
  .cta-btn:active { transform: scale(0.97); }
`

const IL_BLUE = '#0038b8'
const IL_BLUE_LIGHT = '#e8f0ff'

// Sticker component - looks like a real sticker
function Sticker({ text, rotate = -2, delay = 0, style = {} }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      background: '#fff',
      border: `3px solid ${IL_BLUE}`,
      borderRadius: 14,
      padding: '10px 18px',
      fontWeight: 900,
      fontSize: 14,
      color: IL_BLUE,
      transform: `rotate(${rotate}deg)`,
      boxShadow: `4px 4px 0 ${IL_BLUE}`,
      direction: 'rtl',
      whiteSpace: 'nowrap',
      animation: `float${Math.abs(rotate) < 2 ? '3' : rotate < 0 ? '' : '2'} ${2.5 + delay * 0.3}s ease-in-out ${delay * 200}ms infinite`,
      ...style,
    }}>
      {text}
    </div>
  )
}

function FeatureCard({ icon, title, desc, delay = 0 }) {
  return (
    <div className="fcard" style={{
      background: '#fff', borderRadius: 18,
      border: '1.5px solid #dce8ff',
      padding: '28px 24px', flex: 1, minWidth: 200,
      animation: `fadeUp 0.5s ease ${delay}ms both`,
      boxShadow: '0 2px 12px #0038b80a',
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: 14,
        background: `linear-gradient(135deg, ${IL_BLUE_LIGHT}, #c7d9ff)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 26, marginBottom: 16,
      }}>{icon}</div>
      <h3 style={{ fontSize: 15, fontWeight: 800, color: '#1a202c', marginBottom: 8 }}>{title}</h3>
      <p style={{ fontSize: 13, color: '#718096', lineHeight: 1.6, margin: 0 }}>{desc}</p>
    </div>
  )
}

export default function Home() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [p, setP] = useState('')

  function handleSearch(e) {
    e.preventDefault()
    if (q && p) navigate(`/compare?title=${encodeURIComponent(q)}&price=${p}&item_id=web`)
  }

  return (
    <main style={{ background: '#f0f4ff', minHeight: '100vh', padding: '0 0 80px' }}>
      <style>{css}</style>

      {/* Hero section — Israeli flag inspired */}
      <div style={{
        position: 'relative',
        overflow: 'hidden',
        background: '#fff',
        borderBottom: `4px solid ${IL_BLUE}`,
      }}>

        {/* Mesh gradient blobs — premium depth */}
        <div className="mesh-blob" style={{
          width: 380, height: 380, top: -120, left: -80,
          background: 'radial-gradient(circle, #4d8eff45, transparent 70%)',
          animation: 'meshMove 9s ease-in-out infinite',
        }} />
        <div className="mesh-blob" style={{
          width: 320, height: 320, bottom: -100, right: -60,
          background: 'radial-gradient(circle, #0038b835, transparent 70%)',
          animation: 'meshMove2 11s ease-in-out infinite',
        }} />

        {/* Israeli flag — blurred background */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', pointerEvents: 'none',
        }}>
          <svg
            viewBox="0 0 220 160"
            style={{
              width: '140%', height: '140%',
              filter: 'blur(6px)',
              opacity: 0.35,
              transform: 'scale(1.05)',
            }}
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* White background */}
            <rect width="220" height="160" fill="white" />
            {/* Top blue stripe */}
            <rect x="0" y="22" width="220" height="22" fill={IL_BLUE} />
            {/* Bottom blue stripe */}
            <rect x="0" y="116" width="220" height="22" fill={IL_BLUE} />
            {/* Star of David (מגן דוד) */}
            <g transform="translate(110,80)" fill="none" stroke={IL_BLUE} strokeWidth="4">
              {/* Triangle up */}
              <polygon points="0,-24 20.8,12 -20.8,12" />
              {/* Triangle down */}
              <polygon points="0,24 20.8,-12 -20.8,-12" />
            </g>
          </svg>
        </div>

        <div style={{ padding: '36px 24px 32px', textAlign: 'center', position: 'relative' }}>

          {/* Floating stickers */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
            gap: 14, marginBottom: 20,
            animation: 'fadeUp 0.4s ease both',
          }}>
            <Sticker text="🛑 מפסיקים לחכות לסחורה מסין" rotate={-2} delay={0} />
            <Sticker text="💪 מחזקים את הכלכלה הישראלית" rotate={2} delay={1} />
            <Sticker text="🏪 עוזרים לעסקים המקומיים" rotate={-1} delay={2} />
          </div>

          {/* Main headline */}
          <h1 style={{
            fontSize: 'clamp(30px,5vw,54px)', fontWeight: 900,
            color: '#0d1a3e', marginBottom: 16, lineHeight: 1.15,
            animation: 'fadeUp 0.4s ease 100ms both',
          }}>
            מצאת מוצר מחו״ל?
            <br />
            <span className="hero-grad">תקנה בישראל</span> 🇮🇱
          </h1>

          <p style={{
            fontSize: 17, color: '#4a5568', marginBottom: 36,
            maxWidth: 520, margin: '0 auto 20px', lineHeight: 1.6,
            animation: 'fadeUp 0.4s ease 180ms both',
            direction: 'rtl',
          }}>
            תן לנו את המוצר והמחיר מחו״ל — נמצא לך חנות ישראלית שמוכרת אותו,
            ותקבל אותו <strong style={{ color: '#0d1a3e' }}>השבוע</strong> במקום לחכות שבועות מסין.
          </p>

          {/* Search bar */}
          <form onSubmit={handleSearch} style={{
            display: 'flex', gap: 10, maxWidth: 620, margin: '0 auto',
            flexWrap: 'wrap', justifyContent: 'center',
            animation: 'fadeUp 0.4s ease 260ms both',
            background: 'rgba(255,255,255,0.92)',
            padding: '14px 18px', borderRadius: 18,
            backdropFilter: 'blur(4px)',
            boxShadow: '0 4px 24px #0038b820',
          }}>
            <input
              className="search-input"
              value={q} onChange={e => setQ(e.target.value)}
              placeholder="שם המוצר מחו״ל..."
              required
              style={{
                flex: 2, minWidth: 220, padding: '15px 18px',
                borderRadius: 13, border: `2px solid ${IL_BLUE}55`,
                background: '#fff', color: '#1a202c', fontSize: 15,
                direction: 'rtl', boxShadow: '0 2px 8px #0038b815',
              }}
            />
            <input
              className="search-input"
              value={p} onChange={e => setP(e.target.value)}
              placeholder="$ מחיר" type="number" min="0" step="0.01" required
              style={{
                flex: 1, minWidth: 110, padding: '15px 14px',
                borderRadius: 13, border: `2px solid ${IL_BLUE}55`,
                background: '#fff', color: '#1a202c', fontSize: 15,
                direction: 'ltr', boxShadow: '0 2px 8px #0038b815',
              }}
            />
            <button className="cta-btn" type="submit" style={{
              padding: '15px 30px', borderRadius: 13,
              background: IL_BLUE,
              color: '#fff', fontWeight: 900, fontSize: 15, border: 'none',
              boxShadow: `0 4px 18px ${IL_BLUE}40`, cursor: 'pointer',
            }}>
              🔍 השווה
            </button>
          </form>

          {/* Store badges */}
          <div style={{
            display: 'flex', gap: 10, justifyContent: 'center', marginTop: 26,
            flexWrap: 'wrap', animation: 'fadeUp 0.4s ease 340ms both',
          }}>
            {[
              { name: 'KSP', color: '#1a56db' },
              { name: 'BUG', color: '#d03801' },
              { name: 'Ivory', color: '#6b21a8' },
              { name: 'Zap', color: '#0e7490' },
              { name: '+חנויות שכונה', color: '#047857' },
            ].map(s => (
              <span key={s.name} style={{
                padding: '5px 14px', borderRadius: 20,
                border: `1.5px solid ${s.color}33`,
                background: `${s.color}0d`,
                color: s.color, fontSize: 13, fontWeight: 700,
              }}>{s.name}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Impact banner */}
      <div style={{
        background: `linear-gradient(135deg, ${IL_BLUE}, #1d5fe8)`,
        padding: '24px',
        display: 'flex', justifyContent: 'center', gap: 40,
        flexWrap: 'wrap',
        animation: 'fadeUp 0.5s ease 200ms both',
      }}>
        {[
          { emoji: '⏱️', stat: '3-5 שבועות', label: 'ממתינים לסין' },
          { emoji: '🚀', stat: 'השבוע', label: 'קונים מישראל' },
          { emoji: '💼', stat: 'אלפי עסקים', label: 'מקומיים תומכים' },
        ].map((item, i) => (
          <div key={item.stat} style={{
            textAlign: 'center', color: '#fff',
            background: 'rgba(255,255,255,0.10)',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 16, padding: '14px 26px',
            backdropFilter: 'blur(6px)',
            boxShadow: '0 4px 18px rgba(0,16,64,0.18)',
            animation: `fadeUp 0.5s ease ${250 + i * 120}ms both`,
          }}>
            <div style={{ fontSize: 24 }}>{item.emoji}</div>
            <div style={{ fontWeight: 900, fontSize: 19, lineHeight: 1.25 }}>{item.stat}</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>{item.label}</div>
          </div>
        ))}
      </div>

      {/* Live Deals Section — first thing after hero */}
      <DealsSection />

      {/* Features */}
      <div style={{ maxWidth: 880, margin: '48px auto 0', padding: '0 24px' }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <FeatureCard icon="⚡" title="השוואה מיידית"
            desc="השוואה אוטומטית מול KSP, BUG, Ivory, Zap וחנויות שכונה — בתוך שניות" delay={0} />
          <FeatureCard icon="📍" title="חנויות קרובות אליך"
            desc="מוצא חנויות פיזיות בסביבתך עם ניווט ישיר ו-WhatsApp לשאלות מחיר" delay={100} />
          <FeatureCard icon="🇮🇱" title="לקנות מקומי = לחזק ישראל"
            desc="כל קנייה מחנות ישראלית עוזרת לשמור מקומות עבודה ולחזק את הכלכלה" delay={200} />
        </div>
      </div>

    </main>
  )
}

// ── Deal verdict helpers ──────────────────────────────────────────────────────

const VERDICT_META = {
  local_cheaper:  { emoji: '🏆', label: 'ישראל זולה יותר!', bg: '#0b3d1f', border: '#22c55e44', color: '#4ade80' },
  close_price:    { emoji: '⚡', label: 'מחיר דומה — קבל עכשיו', bg: '#0c1f3d', border: '#3b82f644', color: '#60a5fa' },
  abroad_cheaper: { emoji: '🌍', label: 'מחו״ל זול יותר', bg: '#1a0f00', border: '#f59e0b44', color: '#fbbf24' },
  not_found:      { emoji: '🔍', label: 'לא נמצא מקומי', bg: '#111827', border: '#37415144', color: '#6b7280' },
}

function DealCard({ deal, onCompare }) {
  const meta = VERDICT_META[deal.verdict] || VERDICT_META.not_found
  const savings = deal.savings_ils ? `חיסכון ₪${Math.round(deal.savings_ils)}` : null
  const localPrice = deal.best_local_price_ils
    ? `₪${Math.round(deal.best_local_price_ils)} ב-${deal.best_local_store?.toUpperCase()}`
    : null

  return (
    <div
      className="fcard"
      style={{
        background: meta.bg,
        border: `1.5px solid ${meta.border}`,
        borderRadius: 16,
        padding: '18px 16px',
        minWidth: 200,
        flex: '1 1 220px',
        cursor: 'pointer',
        direction: 'rtl',
        animation: 'fadeUp 0.4s ease both',
      }}
      onClick={() => onCompare(deal)}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, color: meta.color,
          background: `${meta.border}`, padding: '2px 8px', borderRadius: 8,
        }}>
          {meta.emoji} {meta.label}
        </span>
        {savings && (
          <span style={{
            fontSize: 11, fontWeight: 900, color: '#4ade80',
            background: '#0b3d1f', padding: '2px 8px', borderRadius: 8,
          }}>{savings}</span>
        )}
      </div>

      {/* Product title */}
      <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 8, lineHeight: 1.4 }}>
        {deal.category_he && (
          <span style={{ fontSize: 10, color: '#64748b', marginLeft: 6 }}>[{deal.category_he}]</span>
        )}
        {deal.title.slice(0, 55)}{deal.title.length > 55 ? '…' : ''}
      </div>

      {/* Price comparison */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>
          מחו״ל: <strong style={{ color: '#fbbf24' }}>₪{Math.round(deal.foreign_total_ils)}</strong>
        </div>
        {localPrice && (
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            ישראל: <strong style={{ color: meta.color }}>{localPrice}</strong>
          </div>
        )}
      </div>

      {/* CTA */}
      <div style={{
        fontSize: 12, fontWeight: 700, color: IL_BLUE,
        textAlign: 'center', paddingTop: 8,
        borderTop: '1px solid #1e293b',
      }}>
        🔍 השווה עכשיו →
      </div>
    </div>
  )
}

const API_BASE = 'http://localhost:8000'

function DealsSection() {
  const navigate = useNavigate()
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    fetch(`${API_BASE}/api/deals?limit=12`)
      .then(r => r.json())
      .then(data => { setDeals(data.deals || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  function handleCompare(deal) {
    navigate(`/compare?title=${encodeURIComponent(deal.title)}&price=${deal.foreign_price_usd}&item_id=deal_${deal.id}`)
  }

  function handleRefresh() {
    setLoading(true)
    fetch(`${API_BASE}/api/deals/refresh`, { method: 'POST' })
      .then(() => setTimeout(() =>
        fetch(`${API_BASE}/api/deals?limit=12`)
          .then(r => r.json())
          .then(data => { setDeals(data.deals || []); setLoading(false) })
          .catch(() => setLoading(false))
      , 3000))
  }

  const FILTERS = [
    { key: 'all',           label: '📋 הכל' },
    { key: 'local_cheaper', label: '🏆 ישראל זולה' },
    { key: 'close_price',   label: '⚡ מחיר דומה' },
  ]

  const visible = filter === 'all' ? deals : deals.filter(d => d.verdict === filter)

  return (
    <div style={{ maxWidth: 880, margin: '56px auto 0', padding: '0 24px' }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: '#0d1a3e', margin: 0 }}>
            🛒 עסקאות השבוע
          </h2>
          <p style={{ fontSize: 13, color: '#718096', margin: '4px 0 0', direction: 'rtl' }}>
            הסוכן שלנו בדק {deals.length} מוצרים — הנה מה שמצא
          </p>
        </div>
        <button
          onClick={handleRefresh}
          style={{
            padding: '8px 16px', borderRadius: 10, border: `1.5px solid ${IL_BLUE}33`,
            background: IL_BLUE_LIGHT, color: IL_BLUE, fontWeight: 700, fontSize: 13,
            cursor: 'pointer',
          }}
        >
          ↻ רענן
        </button>
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: 12,
              background: filter === f.key ? IL_BLUE : '#e8f0ff',
              color: filter === f.key ? '#fff' : IL_BLUE,
            }}
          >{f.label}</button>
        ))}
      </div>

      {/* Cards grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
          <div>הסוכן סורק חנויות...</div>
        </div>
      ) : visible.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '40px', borderRadius: 16,
          background: '#f7f9ff', border: '1.5px dashed #dce8ff', color: '#718096',
          direction: 'rtl',
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🤖</div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>הסוכן עדיין סורק...</div>
          <div style={{ fontSize: 13 }}>לחץ ↻ רענן לאחר כמה שניות</div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {visible.map(deal => (
            <DealCard key={deal.id} deal={deal} onCompare={handleCompare} />
          ))}
        </div>
      )}
    </div>
  )
}
