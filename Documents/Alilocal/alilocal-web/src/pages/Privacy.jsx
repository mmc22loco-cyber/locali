const S = {
  page: { background: '#f4f5f7', minHeight: '100vh', padding: '40px 20px 80px' },
  card: { maxWidth: 760, margin: '0 auto', background: '#fff', borderRadius: 14, border: '1px solid #e0e4eb', padding: '36px 40px', boxShadow: '0 2px 10px #0001' },
  h1: { fontSize: 26, fontWeight: 900, color: '#1a202c', marginBottom: 4 },
  date: { fontSize: 12, color: '#94a3b8', marginBottom: 28 },
  h2: { fontSize: 16, fontWeight: 800, color: '#0038b8', marginTop: 26, marginBottom: 8 },
  p: { fontSize: 14, color: '#334155', lineHeight: 1.8, marginBottom: 10 },
  hr: { border: 'none', borderTop: '1px solid #e0e4eb', margin: '36px 0' },
}

export default function Privacy() {
  return (
    <main style={S.page}>
      <div style={S.card}>
        {/* ── עברית ── */}
        <div dir="rtl">
          <h1 style={S.h1}>מדיניות פרטיות — Locali</h1>
          <div style={S.date}>עודכן לאחרונה: 12 ביוני 2026</div>

          <h2 style={S.h2}>מה אנחנו אוספים</h2>
          <p style={S.p}>
            <strong>נתוני מוצר:</strong> כאשר אתם גולשים בדף מוצר (למשל ב-AliExpress), התוסף קורא את שם המוצר
            והמחיר מהדף — אך ורק כדי להשוות מחירים מול חנויות ישראליות. נתונים אלה נשלחים לשרת שלנו לצורך
            ביצוע ההשוואה בלבד ואינם נשמרים לאורך זמן.
          </p>
          <p style={S.p}>
            <strong>מיקום:</strong> אם אישרתם גישה למיקום, הוא משמש אך ורק לאיתור חנויות פיזיות קרובות אליכם.
            המיקום אינו נשמר בשרתים שלנו, אינו משויך לזהות שלכם ואינו משותף עם צדדים שלישיים.
          </p>

          <h2 style={S.h2}>מה אנחנו לא עושים</h2>
          <p style={S.p}>
            אנחנו לא אוספים שם, אימייל, סיסמאות או פרטי תשלום. אנחנו לא עוקבים אחרי היסטוריית הגלישה שלכם,
            לא מוכרים מידע לצדדים שלישיים ולא מציגים פרסומות.
          </p>

          <h2 style={S.h2}>קישורי שותפים (Affiliate)</h2>
          <p style={S.p}>
            חלק מהקישורים לחנויות כוללים מזהה שותף. אם תרכשו דרכם, Locali עשויה לקבל עמלה — ללא שום עלות
            נוספת עבורכם וללא השפעה על המחיר או על סדר התוצאות.
          </p>

          <h2 style={S.h2}>אחסון מקומי</h2>
          <p style={S.p}>
            העדפות תצוגה (מיקום הפאנל, מצב ממוזער) נשמרות מקומית בדפדפן שלכם בלבד (localStorage)
            ולעולם אינן נשלחות אלינו.
          </p>

          <h2 style={S.h2}>יצירת קשר</h2>
          <p style={S.p}>לשאלות בנושא פרטיות: mmc22loco@gmail.com</p>
        </div>

        <hr style={S.hr} />

        {/* ── English ── */}
        <div dir="ltr">
          <h1 style={S.h1}>Privacy Policy — Locali</h1>
          <div style={S.date}>Last updated: June 12, 2026</div>

          <h2 style={S.h2}>What we collect</h2>
          <p style={S.p}>
            <strong>Product data:</strong> when you visit a product page (e.g. on AliExpress), the extension
            reads the product title and price from the page — solely to compare prices against Israeli stores.
            This data is sent to our server only to perform the comparison and is not stored long-term.
          </p>
          <p style={S.p}>
            <strong>Location:</strong> if you grant location access, it is used only to find physical stores
            near you. Your location is never stored on our servers, never linked to your identity, and never
            shared with third parties.
          </p>

          <h2 style={S.h2}>What we don't do</h2>
          <p style={S.p}>
            We do not collect names, emails, passwords, or payment details. We do not track your browsing
            history, sell data to third parties, or show ads.
          </p>

          <h2 style={S.h2}>Affiliate links</h2>
          <p style={S.p}>
            Some store links include an affiliate identifier. If you purchase through them, Locali may earn a
            commission — at no extra cost to you and with no effect on prices or result ranking.
          </p>

          <h2 style={S.h2}>Local storage</h2>
          <p style={S.p}>
            Display preferences (panel position, minimized state) are stored only in your browser
            (localStorage) and are never sent to us.
          </p>

          <h2 style={S.h2}>Contact</h2>
          <p style={S.p}>Privacy questions: mmc22loco@gmail.com</p>
        </div>
      </div>
    </main>
  )
}
