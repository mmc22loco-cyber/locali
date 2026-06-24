# LOCALI — Prompt de continuación de proyecto

## ¿Qué es Locali?

Locali es un producto de tres capas que ayuda a consumidores israelíes a encontrar alternativas locales a productos que ven en AliExpress u otras tiendas internacionales:

1. **Extensión de Chrome** — se activa automáticamente en cualquier página de producto (AliExpress, Amazon, eBay, etc.), extrae el nombre y precio del producto, consulta el backend, y muestra un panel flotante con tiendas israelíes donde se puede comprar el mismo producto o uno similar, tanto online como físicas cercanas.

2. **Web app (React + Vite, puerto 5173)** — landing page con deals publicados + página `/compare` donde se puede buscar cualquier producto y ver resultados de KSP, Bug, Ivory, Zap y tiendas físicas cercanas con mapa, WhatsApp y precio.

3. **Backend (FastAPI, puerto 8000)** — motor de matching que usa Claude Haiku para identificar el producto, scrapers paralelos para KSP/Bug/Ivory/Zap, Google Places API para tiendas físicas, y un agente de deals que corre cada hora.

## Stack técnico

```
C:\Users\Administrator\Documents\Alilocal\
├── main.py                  # FastAPI — endpoints /match /api/deals /manual-request
├── matching_engine.py       # Motor principal: scrapers + Google Places + pipeline
├── deal_agent.py            # Agente que publica deals en deals.json cada hora
├── inquiry_service.py       # Sistema de consultas a tiendas vía WhatsApp/email
├── .env                     # ANTHROPIC_API_KEY, GOOGLE_PLACES_KEY configurados
├── extension/
│   ├── manifest.json        # Chrome MV3, permisos declarados
│   ├── background.js        # Service worker — proxy de fetches al backend
│   ├── content.js           # Panel flotante, extracción de título/precio, UI completa
│   ├── panel.css            # Estilos del panel
│   └── panel.js             # Helpers del panel
└── alilocal-web/
    └── src/
        ├── pages/Home.jsx   # Landing con deals, hero, feature cards
        └── pages/Compare.jsx # Página de comparación de precios
```

**Variables de entorno activas:**
- `ANTHROPIC_API_KEY` — Claude Haiku para identificación de producto
- `GOOGLE_PLACES_KEY` — Google Places API (New) para tiendas físicas cercanas

## Cómo funciona el flujo principal

1. Usuario está en AliExpress viendo un producto
2. La extensión (`content.js`) ejecuta `init()`:
   - Extrae título via `extractGenericTitle()` (JSON-LD → OG meta → CSS selectors)
   - Extrae precio via `extractGenericPrice()` (JSON-LD con conversión ILS→USD → OG → CSS)
   - Obtiene ubicación del usuario
   - Llama al backend `/match` via `background.js` (evita CORS)
3. El backend corre `run_matching_pipeline()`:
   - Claude Haiku extrae: brand, model, category_he, search_query
   - Scrapers paralelos: KSP (SSE stream), Bug (HTML+JSON), Ivory (HTML), Zap (HTML)
   - Google Places API busca tiendas físicas por categoría cerca del usuario
   - Fallback OSM → cadenas conocidas si Places falla
4. El panel muestra: tiendas online con precio + botón "קנה ב-KSP ↗", tiendas físicas con mapa/WhatsApp/web, botón grande "פתח השוואה מלאה" que abre `/compare` con params auto-search

## Lo que está funcionando hoy

- ✅ Extracción automática de título y precio en AliExpress
- ✅ Scrapers KSP, Bug, Ivory, Zap retornando productos con precio e imagen
- ✅ Tiendas físicas por categoría (electrónica, juguetes, deportes, libros, salud, etc.)
- ✅ Panel flotante con diseño completo en azul israelí (#0038b8)
- ✅ Web app con deals, compare page con imágenes de productos
- ✅ Tiendas físicas mostradas PRIMERO en la compare page (lo más local)
- ✅ Botones diferenciados: "🛒 קנה ב-KSP ↗" (con precio) vs "🔍 חפש ב-Bug ↗" (sin precio)
- ✅ Base de datos de cadenas israelíes por categoría: KSP, Bug, Ivory, iDigital, Maxtoc, Decathlon, ACE, Super-Pharm, Steimatzky, Toys R Us

## Lo que falta para publicar — PRIORIDAD

### 1. Deploy (crítico)
- Backend → Railway.app (ya tiene `railway.json` o Procfile)
- Frontend → Vercel (ya tiene `vercel.json`)
- Cambiar `WEB_BASE` en `content.js` de `http://localhost:5173` a la URL de Vercel
- Cambiar URLs del backend en `background.js` de `http://localhost:8000` a la URL de Railway

### 2. Chrome Web Store
- Subir la extensión a Chrome Web Store (proceso de review 3-7 días)
- Preparar: screenshots 1280x800, descripción en inglés/hebreo, ícono 128x128
- Privacy policy URL (requerida por Google)

### 3. Privacidad y legal
- Crear página `/privacy` simple en la web app (requerida por Chrome Web Store)
- La política debe mencionar: datos de ubicación (solo para buscar tiendas cercanas, no se almacenan), datos del producto (solo para comparar precios)

### 4. Cuentas de afiliados (monetización)
Integrar links de afiliado en los botones de "קנה ב-..." para ganar comisión por cada compra:
- **KSP**: programa de afiliados en https://ksp.co.il — agregar `?utm_source=locali&ref=LOCALI_ID` al URL
- **Bug**: contactar a bug.co.il para partnership / afiliados
- **Zap**: Zap tiene programa de afiliados — https://www.zap.co.il/affiliate
- **Amazon IL**: Amazon Associates Israel
- **Implementación**: en `_normalize_product()` y en los botones del panel/web, añadir el parámetro de afiliado al `url` del producto. Crear tabla de config `AFFILIATE_PARAMS` por store.

Ejemplo:
```python
AFFILIATE_PARAMS = {
    "ksp":   "?utm_source=locali&partner=LOCALI",
    "zap":   "?affid=LOCALI_ZAP_ID",
    "ivory": "?ref=locali",
}
```

## Mejoras de producto que deben implementarse (para versión premium)

### Extensión — UX polish
- **Panel arrastrable**: el panel flotante debe poder moverse por la pantalla (drag & drop). Implementar con mousedown/mousemove/mouseup en el header del panel. Guardar posición en `localStorage`.
- **Minimizar/expandir**: botón para colapsar el panel a solo el header (útil cuando interfiere con la página). Estado guardado en `localStorage`.
- **Animación de entrada**: el panel debe aparecer con slide-in desde la derecha (transform: translateX) en lugar de aparecer abruptamente.
- **Skeleton loading**: mientras carga, mostrar cards con shimmer animation en lugar del spinner simple.
- **Badge en el ícono**: cuando se encuentran resultados, mostrar el número de tiendas en el ícono de la extensión (chrome.action.setBadgeText).
- **Notificación de ahorro**: si el precio israelí es más barato que el precio de AliExpress, mostrar toast "¡Ahorras ₪X comprando en Israel!" con animación.

### Web app — UX polish
- **Animaciones de entrada**: los cards de productos deben hacer fadeUp con stagger (ya hay algo, mejorar).
- **Precio en tiempo real**: indicador de "precios actualizados hace X minutos".
- **Compartir comparación**: botón para copiar link de la comparación actual.
- **Modo oscuro**: toggle dark/light mode.
- **PWA**: agregar manifest.json + service worker para que funcione como app instalable en desktop/mobile.

## Aplicación Android — NUEVA FUNCIONALIDAD

Crear una app Android nativa (o React Native / Expo) con el mismo estilo visual de Locali.

**Flujo principal:**
1. Usuario ve un producto en AliExpress (u otra tienda internacional) en el navegador de su celular
2. Copia el URL del producto
3. Abre la app Locali → la app detecta automáticamente el URL en el clipboard
4. Muestra "Encontramos este producto: [imagen] [título] [$precio]" con botón "Buscar en Israel"
5. Llama al mismo backend `/match` con el título y precio extraídos
6. Muestra resultados: tiendas online con precio + tiendas físicas en mapa

**Implementación sugerida — Expo (React Native):**
```
locali-app/
├── app.json              # Expo config, nombre "Locali", íconos en azul #0038b8
├── App.js                # Navigator principal
└── screens/
    ├── HomeScreen.js     # Botón grande "Pega el link de AliExpress", últimas búsquedas
    ├── ScanScreen.js     # Detecta clipboard, extrae título/precio del URL
    ├── ResultsScreen.js  # Lista de tiendas (mismo diseño que web compare)
    └── StoreScreen.js    # Detalle de tienda física con mapa integrado
```

**Extracción de producto desde URL:**
- Para AliExpress: llamar `https://api.allorigins.win/raw?url=<product_url>` para obtener el HTML, luego extraer title/price del JSON-LD o meta tags (misma lógica que `extractGenericTitle/Price` de la extensión)
- O mejor: crear endpoint `/api/extract?url=...` en el backend FastAPI que haga el scraping server-side y devuelva `{title, price_usd, image_url}`

**Diseño:**
- Colores: azul #0038b8, blanco, gris claro
- Bandera israelí como elemento decorativo (ya existe en la web app)
- Cards de tiendas con imagen, precio, badge "המחיר הטוב ביותר"
- Mapa integrado para tiendas físicas (react-native-maps)
- Soporte RTL para hebreo

## Estilo de código y convenciones

- Backend: Python async/await, FastAPI, httpx para requests
- Frontend: React functional components + hooks, CSS-in-JS inline styles
- Colores: IL_BLUE = '#0038b8', fondo = '#f4f5f7', texto = '#1a202c'
- Sin TypeScript por ahora — JavaScript puro
- El backend usa `--reload` en desarrollo, no hace falta reiniciar manualmente

## Objetivo final

Locali debe ser la herramienta estándar para cualquier israelí que compra online. El modelo de negocio: comisión de afiliado por cada compra redirigida a tiendas israelíes + eventualmente partnerships con las cadenas para datos de inventario en tiempo real.

**Meta a 3 meses:** 1,000 usuarios activos de la extensión, 50 conversiones/día a tiendas israelíes.

---

*Termina el proyecto de forma profesional pero rápida. Prioriza: deploy → Chrome Web Store → afiliados → Android app. El código base es sólido, lo que falta es polish y distribución.*
