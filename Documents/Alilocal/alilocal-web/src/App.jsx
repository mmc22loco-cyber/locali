import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import Compare from './pages/Compare.jsx'
import Mailbox from './pages/Mailbox.jsx'
import Home from './pages/Home.jsx'
import Privacy from './pages/Privacy.jsx'

const darkCss = `
  html.locali-dark { filter: invert(0.93) hue-rotate(180deg); background: #0b0f17; }
  html.locali-dark img, html.locali-dark video, html.locali-dark iframe, html.locali-dark canvas {
    filter: invert(1) hue-rotate(180deg);
  }
`

function Nav({ dark, onToggleDark }) {
  const loc = useLocation()
  return (
    <header style={{
      background: 'rgba(16, 24, 48, 0.88)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      boxShadow: '0 4px 24px rgba(0,16,64,0.25)',
      padding: '0 28px',
      display: 'flex', alignItems: 'center', gap: '24px',
      height: '58px', position: 'sticky', top: 0, zIndex: 100,
    }}>
      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 0, direction: 'ltr' }}>
          <span style={{
            fontWeight: 900, fontSize: 22, letterSpacing: '-0.5px',
            background: 'linear-gradient(135deg, #4d8eff, #93b4ff)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            filter: 'drop-shadow(0 0 12px rgba(77,142,255,0.45))',
          }}>Loca</span>
          <span style={{ fontWeight: 900, fontSize: 22, letterSpacing: '-0.5px', color: '#ffffff' }}>li</span>
        </div>
      </Link>
      <nav style={{ display: 'flex', gap: '4px', marginRight: 'auto', alignItems: 'center' }}>
        <NavLink to="/compare" active={loc.pathname.startsWith('/compare')}>🔍 השוואה</NavLink>
        <NavLink to="/mailbox" active={loc.pathname === '/mailbox'}>📬 בוזן</NavLink>
        <button onClick={onToggleDark} title={dark ? 'מצב בהיר' : 'מצב כהה'} style={{
          background: '#ffffff14', border: 'none', borderRadius: '7px',
          padding: '6px 10px', fontSize: '14px', cursor: 'pointer', marginRight: '6px',
        }}>{dark ? '☀️' : '🌙'}</button>
      </nav>
    </header>
  )
}

function NavLink({ to, active, children }) {
  return (
    <Link to={to} style={{
      padding: '6px 14px', borderRadius: '7px', fontSize: '13px', fontWeight: 600,
      textDecoration: 'none',
      background: active ? '#ffffff18' : 'transparent',
      color: active ? '#fff' : '#94a3b8',
    }}>{children}</Link>
  )
}

function Footer() {
  return (
    <footer style={{
      background: '#1a2332', padding: '18px 28px', textAlign: 'center',
      display: 'flex', justifyContent: 'center', gap: '18px', alignItems: 'center',
    }}>
      <span style={{ color: '#64748b', fontSize: 12 }}>© 2026 Locali</span>
      <Link to="/privacy" style={{ color: '#94a3b8', fontSize: 12, textDecoration: 'none' }}>
        מדיניות פרטיות · Privacy Policy
      </Link>
    </footer>
  )
}

export default function App() {
  const [dark, setDark] = useState(() => localStorage.getItem('locali_dark') === '1')

  useEffect(() => {
    document.documentElement.classList.toggle('locali-dark', dark)
    localStorage.setItem('locali_dark', dark ? '1' : '0')
  }, [dark])

  return (
    <BrowserRouter>
      <style>{darkCss}</style>
      <Nav dark={dark} onToggleDark={() => setDark(d => !d)} />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/mailbox" element={<Mailbox />} />
        <Route path="/privacy" element={<Privacy />} />
      </Routes>
      <Footer />
    </BrowserRouter>
  )
}
