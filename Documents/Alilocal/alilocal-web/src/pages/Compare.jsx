import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchMatch, buildWaLink } from '../api.js'

const css = `
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
  body { background: #f4f5f7 !important; }
  .pcard { cursor:pointer; }
  .pcard:hover { box-shadow: 0 6px 24px #0002 !important; transform: translateY(-2px); }
  .pcard { transition: box-shadow 0.18s, transform 0.18s; }
  .pcard-btn:hover { background: #005b99 !important; }
  .pcard-btn { transition: background 0.15s; }
  .phy-row:hover { border-color: #c7d2fe !important; }
  .phy-row { transition: border-color 0.15s; }
  input:focus { border-color: #0078c8 !important; outline: none; }
`

const STORE_META = {
  ksp:   { label:'KSP',   color:'#1a56db', logo:'https://ksp.co.il/favicon.ico' },
  bug:   { label:'BUG',   color:'#c2410c', logo:'https://www.bug.co.il/favicon.ico' },
  ivory: { label:'Ivory', color:'#7c3aed', logo:'https://www.ivory.co.il/favicon.ico' },
  zap:   { label:'Zap',   color:'#0369a1', logo:'https://www.zap.co.il/favicon.ico' },
}

// ── Product card — Zap style ──────────────────────────────────────────────────

function ProductCard({ s, imageUrl, aliTotal, isBest, idx }) {
  const meta = STORE_META[s.store] || { label:(s.store||'').toUpperCase(), color:'#0369a1' }
  const savings = s.price_ils && aliTotal ? Math.round(aliTotal - s.price_ils) : null
  const displayTitle = s.title || `${meta.label} — ${s.store === 'zap' ? 'השוואת מחירים' : 'חיפוש מוצר'}`
  // Use product-specific image if available, fall back to the AliExpress image
  const cardImage = s.image_url || imageUrl

  return (
    <div className="pcard" onClick={()=>window.open(s.url,'_blank')} style={{
      background: '#fff',
      borderRadius: 12,
      border: isBest ? '2px solid #0078c8' : '1px solid #e0e4eb',
      boxShadow: '0 2px 8px #0001',
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      animation: `fadeUp 0.4s ease ${idx*60}ms both`,
      position: 'relative',
    }}>

      {/* Badge */}
      {isBest && (
        <div style={{
          position:'absolute', top:10, right:10, zIndex:2,
          background:'#0078c8', color:'#fff',
          fontSize:10, fontWeight:800, padding:'3px 10px',
          borderRadius:20, letterSpacing:'0.05em',
        }}>✦ המחיר הטוב ביותר</div>
      )}
      {!isBest && savings > 20 && (
        <div style={{
          position:'absolute', top:10, right:10, zIndex:2,
          background:'#16a34a', color:'#fff',
          fontSize:10, fontWeight:800, padding:'3px 10px',
          borderRadius:20,
        }}>↓ חסכון ₪{savings}</div>
      )}

      {/* Product image */}
      <div style={{
        background:'#f8f9fb', height:180,
        display:'flex', alignItems:'center', justifyContent:'center',
        borderBottom:'1px solid #f0f2f5', overflow:'hidden', position:'relative',
      }}>
        {cardImage ? (
          <img src={cardImage} alt="" style={{
            maxWidth:'100%', maxHeight:165,
            objectFit:'contain', padding:12,
          }} onError={e=>{e.target.style.display='none'}}/>
        ) : (
          <div style={{ fontSize:56, color:'#cbd5e1' }}>🛍️</div>
        )}
        {/* Store logo overlay */}
        <div style={{
          position:'absolute', bottom:8, left:8,
          background:'#fff', borderRadius:6, padding:'3px 8px',
          border:'1px solid #e0e4eb', fontSize:11, fontWeight:800,
          color:meta.color, display:'flex', alignItems:'center', gap:4,
        }}>
          <img src={meta.logo} width={13} height={13} alt=""
            onError={e=>{e.target.style.display='none'}}
          />
          {meta.label}
        </div>
      </div>

      {/* Card body */}
      <div style={{ padding:'14px 14px 12px', flex:1, display:'flex', flexDirection:'column', gap:10 }}>

        {/* Product name */}
        <div style={{
          fontSize:13, fontWeight:600, color:'#1a202c',
          lineHeight:1.5, minHeight:40,
          display:'-webkit-box', WebkitLineClamp:2,
          WebkitBoxOrient:'vertical', overflow:'hidden',
        }}>
          {displayTitle.slice(0,90)}
        </div>

        {/* Tier badge */}
        {s.tier && s.tier !== 'unknown' && (
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            <span style={{
              fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:12,
              background: s.tier==='exact'?'#f0fdf4':s.tier==='likely'?'#eff6ff':'#fffbeb',
              color: s.tier==='exact'?'#15803d':s.tier==='likely'?'#1d4ed8':'#b45309',
              border: `1px solid ${s.tier==='exact'?'#bbf7d0':s.tier==='likely'?'#bfdbfe':'#fde68a'}`,
            }}>
              {s.tier==='exact'?'✅ מדויק':s.tier==='likely'?'🔵 דומה':'🟡 אפשרי'}
            </span>
          </div>
        )}

        <div style={{ marginTop:'auto' }}>
          {/* Price */}
          {s.price_ils ? (
            <div style={{ marginBottom:12 }}>
              <div style={{ display:'flex', alignItems:'baseline', gap:6, justifyContent:'flex-end' }}>
                <span style={{ fontSize:12, color:'#64748b' }}>מחל מ-</span>
                <span style={{ fontSize:28, fontWeight:900, color:'#1a202c' }}>₪{s.price_ils}</span>
              </div>
              {savings !== null && savings < -10 && (
                <div style={{ fontSize:11, color:'#dc2626', textAlign:'left' }}>
                  יקר ב-₪{Math.abs(savings)} ממחו״ל
                </div>
              )}
            </div>
          ) : null}

          {/* CTA button — full price known → "קנה ב-KSP", unknown → "חפש ב-Bug" */}
          <a
            href={s.url} target="_blank" rel="noopener"
            onClick={e=>e.stopPropagation()}
            style={{
              display:'flex', alignItems:'center', justifyContent:'center', gap:6,
              padding:'11px 10px', borderRadius:8, textDecoration:'none',
              fontWeight:700, fontSize:14,
              ...(s.price_ils
                ? { background: isBest ? '#0078c8' : '#0078c8', color:'#fff' }
                : { background:'#f1f5f9', color:'#475569', border:'1px solid #cbd5e1' }
              ),
            }}
          >
            {s.price_ils
              ? <>🛒 קנה ב-{meta.label} ↗</>
              : <>🔍 חפש ב-{meta.label} ↗</>
            }
          </a>
        </div>
      </div>
    </div>
  )
}

// ── AliExpress reference bar ──────────────────────────────────────────────────

function AliBar({ title, priceUsd, imageUrl, cost }) {
  return (
    <div style={{
      background:'#fff', border:'1px solid #e0e4eb',
      borderRadius:12, padding:'18px 22px', marginBottom:20,
      display:'flex', gap:18, alignItems:'center', flexWrap:'wrap',
      boxShadow:'0 1px 4px #0001',
    }}>
      {imageUrl && (
        <img src={imageUrl} alt="" style={{
          width:70, height:70, objectFit:'contain',
          borderRadius:8, border:'1px solid #f0f2f5',
          background:'#f8f9fb', flexShrink:0,
        }}/>
      )}
      <div style={{ flex:1, minWidth:200 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
          <div style={{
            background:'#64748b', color:'#fff', fontSize:10,
            fontWeight:800, padding:'2px 8px', borderRadius:5,
          }}>מחו״ל</div>
          <span style={{ fontSize:12, color:'#64748b' }}>מוצר מקור</span>
        </div>
        <div style={{ fontSize:14, fontWeight:600, color:'#1a202c', marginBottom:6 }}>
          {title?.slice(0,80)}{title?.length>80?'…':''}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <span style={{ fontSize:22, fontWeight:900, color:'#FF4747' }}>${priceUsd}</span>
          <span style={{ fontSize:14, color:'#94a3b8' }}>= ₪{cost?.aliexpress_price_ils||Math.round(priceUsd*3.75)} מחו״ל</span>
          {cost?.vat_applies
            ? <span style={{ fontSize:12, padding:'2px 8px', borderRadius:12, background:'#fef2f2', color:'#dc2626', border:'1px solid #fecaca', fontWeight:600 }}>⚠️ +₪{cost.vat_amount_ils} מע״מ → ₪{cost.total_cost_ils}</span>
            : <span style={{ fontSize:12, padding:'2px 8px', borderRadius:12, background:'#f0fdf4', color:'#15803d', border:'1px solid #bbf7d0', fontWeight:600 }}>✅ פטור מע״מ</span>
          }
          <span style={{ fontSize:12, color:'#94a3b8' }}>📦 ~{cost?.shipping_days_estimate||18} ימים</span>
        </div>
      </div>
    </div>
  )
}

// ── Summary ───────────────────────────────────────────────────────────────────

function Summary({ online, cost }) {
  if (!cost) return null
  const prices = (online||[]).map(s=>s.price_ils).filter(Boolean)
  const best = prices.length ? Math.min(...prices) : null
  const total = cost.total_cost_ils || cost.aliexpress_price_ils
  if (!best) return null
  const diff = Math.round(best - total)
  const [bg, border, color, text] = diff > 40
    ? ['#fff7ed','#fed7aa','#c2410c',`🚀 מחו״ל זול ב-₪${diff} — אבל חכה ${cost.shipping_days_estimate||18} ימים`]
    : diff < -40
    ? ['#f0fdf4','#bbf7d0','#15803d',`🏆 חנות ישראלית זולה ב-₪${Math.abs(diff)} — קבל היום!`]
    : ['#eff6ff','#bfdbfe','#1d4ed8','⚖️ מחיר דומה — עדיף לקנות מקומי ולקבל מיד']
  return (
    <div style={{
      padding:'13px 18px', borderRadius:10, marginBottom:20,
      background:bg, border:`1px solid ${border}`,
      color, fontWeight:700, fontSize:14,
    }}>{text}</div>
  )
}

// ── Physical stores ───────────────────────────────────────────────────────────

function PhysicalRow({ s, title, priceUsd }) {
  const waLink = s.phone ? buildWaLink(s.phone, title, priceUsd) : null
  const stars = s.rating ? '★'.repeat(Math.round(s.rating)) + '☆'.repeat(5 - Math.round(s.rating)) : null

  return (
    <div className="phy-row" style={{
      background:'#fff', border:'1px solid #e0e4eb', borderRadius:12,
      marginBottom:10, overflow:'hidden',
      display:'flex', alignItems:'stretch',
    }}>
      {/* Store photo from Google */}
      {s.photo_url && (
        <img src={s.photo_url} alt="" style={{
          width:90, height:90, objectFit:'cover', flexShrink:0,
        }} onError={e => e.target.style.display='none'} />
      )}
      {!s.photo_url && (
        <div style={{
          width:90, flexShrink:0, background:'#f4f5f7',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:28,
        }}>🏪</div>
      )}

      {/* Info */}
      <div style={{ flex:1, padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
            <span style={{ fontWeight:700, color:'#1a202c', fontSize:14 }}>{s.name}</span>
            {s.open_now===true  && <span style={{ fontSize:11, fontWeight:700, color:'#15803d', background:'#f0fdf4', border:'1px solid #bbf7d0', padding:'1px 7px', borderRadius:12 }}>פתוח</span>}
            {s.open_now===false && <span style={{ fontSize:11, fontWeight:700, color:'#dc2626', background:'#fef2f2', border:'1px solid #fecaca', padding:'1px 7px', borderRadius:12 }}>סגור</span>}
          </div>
          {stars && (
            <div style={{ fontSize:12, color:'#f59e0b', marginBottom:3 }}>
              {stars} <span style={{ color:'#94a3b8' }}>({s.rating_count || ''})</span>
            </div>
          )}
          <div style={{ fontSize:12, color:'#94a3b8' }}>
            📍 {s.address}{s.distance_km ? ` · ${s.distance_km} ק״מ` : ''}
          </div>
        </div>

        <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
          {s.google_maps_url && <a href={s.google_maps_url} target="_blank" rel="noopener" style={{ padding:'7px 12px', borderRadius:7, border:'1px solid #e0e4eb', background:'#f8f9fb', color:'#64748b', fontSize:12, fontWeight:600, textDecoration:'none' }}>📍 מפה</a>}
          {waLink && <a href={waLink} target="_blank" rel="noopener" style={{ padding:'7px 12px', borderRadius:7, background:'#22c55e', color:'#fff', fontSize:12, fontWeight:700, textDecoration:'none' }}>💬 WhatsApp</a>}
          {s.website && <a href={s.website} target="_blank" rel="noopener" style={{ padding:'7px 12px', borderRadius:7, background:'#eff6ff', border:'1px solid #bfdbfe', color:'#1d4ed8', fontSize:12, fontWeight:600, textDecoration:'none' }}>🌐 אתר</a>}
        </div>
      </div>
    </div>
  )
}

// ── Manual search ─────────────────────────────────────────────────────────────

function ManualSearch({ onSearch, loading, defaultTitle='' }) {
  const [t,setT]=useState(defaultTitle); const [p,setP]=useState('')
  return (
    <div style={{ maxWidth:560, margin:'80px auto', textAlign:'center' }}>
      <div style={{ fontSize:52, marginBottom:14 }}>🔍</div>
      <h2 style={{ fontSize:22, fontWeight:800, color:'#1a202c', marginBottom:6 }}>
        {defaultTitle ? 'כמה עולה המוצר בחו״ל?' : 'חפש מוצר להשוואה'}
      </h2>
      <p style={{ color:'#94a3b8', fontSize:13, marginBottom:24 }}>
        {defaultTitle
          ? 'לא הצלחנו לזהות את המחיר אוטומטית — הכנס אותו ידנית כדי להשוות'
          : 'הדבק שם מוצר מחו״ל וקבל תוצאות מחנויות ישראליות'}
      </p>
      <form onSubmit={e=>{e.preventDefault();if(t&&p)onSearch(t.trim(),parseFloat(p))}} style={{ display:'flex', flexDirection:'column', gap:10 }}>
        <input value={t} onChange={e=>setT(e.target.value)} placeholder="שם המוצר..." required
          style={{ padding:'13px 16px', borderRadius:10, border:'1.5px solid #e0e4eb', background:'#fff', color:'#1a202c', fontSize:14, direction:'rtl', width:'100%', boxSizing:'border-box' }}/>
        <input value={p} onChange={e=>setP(e.target.value)} placeholder="מחיר ב-USD" type="number" min="0.01" step="0.01" required
          style={{ padding:'13px 16px', borderRadius:10, border:'1.5px solid #e0e4eb', background:'#fff', color:'#1a202c', fontSize:14, direction:'ltr', width:'100%', boxSizing:'border-box' }}/>
        <button type="submit" disabled={loading} style={{ padding:'13px', borderRadius:10, background:'#0078c8', color:'#fff', fontWeight:800, fontSize:15, border:'none', cursor:loading?'not-allowed':'pointer', opacity:loading?0.6:1 }}>
          {loading?'⏳ מחפש...':'🔍 השווה מחירים'}
        </button>
      </form>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Compare() {
  const [params]=useSearchParams()
  const [data,setData]=useState(null)
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState(null)
  const [ctx,setCtx]=useState(null)
  const [updatedAt,setUpdatedAt]=useState(null)
  const [copied,setCopied]=useState(false)
  const [,forceTick]=useState(0)

  // Re-render every minute para "עודכן לפני X דקות"
  useEffect(()=>{
    const id=setInterval(()=>forceTick(t=>t+1),60000)
    return ()=>clearInterval(id)
  },[])

  function shareComparison(){
    const url=new URL(window.location.origin+'/compare')
    if(ctx?.title)url.searchParams.set('title',ctx.title)
    if(ctx?.priceUsd)url.searchParams.set('price',String(ctx.priceUsd))
    if(ctx?.imageUrl)url.searchParams.set('image',ctx.imageUrl)
    navigator.clipboard.writeText(url.toString()).then(()=>{
      setCopied(true);setTimeout(()=>setCopied(false),2000)
    })
  }

  const minsAgo=updatedAt?Math.floor((Date.now()-updatedAt)/60000):null

  const urlPrice = parseFloat(params.get('price')||'0')
  const urlTitle = params.get('title')||''

  useEffect(()=>{
    const title=urlTitle, price=urlPrice
    const item_id=params.get('item_id')||'web', imageUrl=params.get('image')||''
    if(title&&price>0){ setCtx({title,priceUsd:price,item_id,imageUrl}); doSearch(title,price,item_id,imageUrl) }
  },[])

  async function doSearch(title,price,item_id='web',imageUrl=''){
    setLoading(true);setError(null);setData(null)
    try{
      const loc=await getLocation()
      const result=await fetchMatch({title,price_usd:price,item_id,user_lat:loc.lat,user_lng:loc.lng})
      setData(result); setCtx(prev=>({...prev||{},title,priceUsd:price,imageUrl})); setUpdatedAt(Date.now())
    }catch(e){setError(e.message)}finally{setLoading(false)}
  }

  const showManual=!loading&&!data&&(!urlTitle||urlPrice<=0)
  const withPrice=(data?.online||[]).filter(s=>s.price_ils)
  const bestStore=withPrice.length?withPrice.reduce((a,b)=>a.price_ils<b.price_ils?a:b):null
  const aliTotal=data?.cost_analysis?.total_cost_ils||(ctx?.priceUsd*3.75)

  return (
    <main style={{ background:'#f4f5f7', minHeight:'100vh', padding:'24px 20px 80px' }}>
      <style>{css}</style>
      <div style={{ maxWidth:1000, margin:'0 auto' }}>

        {showManual&&<ManualSearch defaultTitle={urlTitle&&urlTitle!=='Producto desconocido'?urlTitle:''} onSearch={(t,p)=>{setCtx({title:t,priceUsd:p,item_id:params.get('item_id')||'web',imageUrl:params.get('image')||''});doSearch(t,p,params.get('item_id')||'web',params.get('image')||'')}} loading={loading}/>}

        {loading&&(
          <div style={{ textAlign:'center', padding:'80px 0' }}>
            <div style={{ width:44,height:44,border:'3px solid #e0e4eb',borderTopColor:'#0078c8',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 18px' }}/>
            <p style={{ fontSize:15,color:'#64748b' }}>מחפש מחירים...</p>
            <p style={{ fontSize:12,color:'#94a3b8',marginTop:6 }}>KSP · BUG · Ivory · Zap · חנויות פיזיות</p>
          </div>
        )}

        {error&&<div style={{ padding:18,borderRadius:10,background:'#fef2f2',border:'1px solid #fecaca',color:'#dc2626',marginBottom:20 }}>⚠️ {error}</div>}

        {data&&ctx&&(
          <>
            <AliBar title={ctx.title} priceUsd={ctx.priceUsd} imageUrl={ctx.imageUrl} cost={data.cost_analysis}/>
            <Summary online={data.online} cost={data.cost_analysis}/>

            {/* ── Physical stores FIRST — the whole point of Locali ── */}
            {data.physical?.length>0&&(
              <div style={{ marginBottom:32 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                  <h2 style={{ fontSize:16,fontWeight:800,color:'#1a202c', margin:0 }}>
                    🏪 חנויות פיזיות קרובות
                  </h2>
                  <span style={{ fontSize:13,fontWeight:600,color:'#fff', background:'#0078c8', padding:'2px 10px', borderRadius:20 }}>{data.physical.length}</span>
                </div>
                {data.physical.map((s,i)=><PhysicalRow key={i} s={s} title={ctx.title} priceUsd={ctx.priceUsd}/>)}
              </div>
            )}

            {/* ── Online stores ── */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <h2 style={{ fontSize:16,fontWeight:800,color:'#1a202c', margin:0 }}>
                  🛒 חנויות אונליין
                </h2>
                <span style={{ fontSize:13,fontWeight:600,color:'#64748b', background:'#f1f5f9', padding:'2px 10px', borderRadius:20 }}>{data.online?.length||0}</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                {minsAgo!==null&&(
                  <span style={{ fontSize:11,color:'#94a3b8' }}>
                    ⏱ {minsAgo===0?'עודכן עכשיו':`עודכן לפני ${minsAgo} דק׳`}
                  </span>
                )}
                <button onClick={shareComparison}
                  style={{ padding:'7px 14px',borderRadius:8,border:'1px solid #e0e4eb',background:copied?'#f0fdf4':'#fff',color:copied?'#15803d':'#64748b',fontSize:12,cursor:'pointer' }}>
                  {copied?'✅ הועתק!':'🔗 שתף השוואה'}
                </button>
                <button onClick={()=>doSearch(ctx.title,ctx.priceUsd,ctx.item_id,ctx.imageUrl)}
                  style={{ padding:'7px 14px',borderRadius:8,border:'1px solid #e0e4eb',background:'#fff',color:'#64748b',fontSize:12,cursor:'pointer' }}>
                  🔄 רענן
                </button>
              </div>
            </div>

            {data.online?.length?(
              <div style={{
                display:'grid',
                gridTemplateColumns:'repeat(auto-fill,minmax(210px,1fr))',
                gap:14, marginBottom:32,
              }}>
                {data.online.map((s,i)=>(
                  <ProductCard key={i} s={s} imageUrl={ctx.imageUrl}
                    aliTotal={aliTotal} idx={i}
                    isBest={!!(bestStore&&s.url===bestStore.url&&s.price_ils)}
                  />
                ))}
              </div>
            ):<p style={{ color:'#94a3b8',fontSize:14,marginBottom:32 }}>לא נמצאו חנויות</p>}
          </>
        )}
      </div>
    </main>
  )
}

function getLocation(){
  return new Promise(r=>{
    if(!navigator.geolocation)return r({lat:32.0853,lng:34.7818})
    navigator.geolocation.getCurrentPosition(p=>r({lat:p.coords.latitude,lng:p.coords.longitude}),()=>r({lat:32.0853,lng:34.7818}),{timeout:5000,maximumAge:300000})
  })
}
