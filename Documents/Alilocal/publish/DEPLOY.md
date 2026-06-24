# Locali — Guía de publicación (paso a paso)

## 1. Backend → Railway (~10 min)

1. Crea cuenta en https://railway.app (login con GitHub).
2. Sube el proyecto a un repo de GitHub (carpeta raíz `Alilocal`, sin `node_modules` ni `locali-app`).
3. En Railway: **New Project → Deploy from GitHub repo** → selecciona el repo.
   Railway detecta el `Procfile`/`railway.toml` automáticamente.
4. En **Variables**, agrega:
   - `ANTHROPIC_API_KEY` = (la del archivo .env)
   - `GOOGLE_PLACES_KEY` = (la del archivo .env)
5. En **Settings → Networking → Generate Domain** → copia la URL
   (ej. `https://locali-backend.up.railway.app`).
6. Verifica: abre `https://<tu-url>/health` → debe responder `{"status":"ok"}`.

## 2. Frontend → Vercel (~5 min)

1. Crea cuenta en https://vercel.com (login con GitHub).
2. **Add New → Project** → importa el repo → **Root Directory: `alilocal-web`**.
3. Framework: Vite (auto-detectado). Deploy.
4. Copia la URL (ej. `https://locali.vercel.app`).
5. En Railway, agrega la variable `FRONTEND_URL` = la URL de Vercel (para CORS).

## 3. Actualizar URLs en el código (2 min)

| Archivo | Línea | Cambiar a |
|---|---|---|
| `extension/background.js` | `BACKEND_URL` | URL de Railway |
| `extension/content.js` | `LOCALI_WEB_BASE` | URL de Vercel |
| `alilocal-web/src/api.js` | URL del backend | URL de Railway |
| `locali-app/src/config.js` | `BACKEND_URL` | URL de Railway |

Después re-empaquetar la extensión (ver paso 4) y re-deployar el frontend (push a GitHub).

## 4. Chrome Web Store (~30 min + 3-7 días de review)

1. Cuenta de desarrollador: https://chrome.google.com/webstore/devconsole — pago único de $5.
2. Re-genera el ZIP tras cambiar las URLs:
   - comprimir el CONTENIDO de la carpeta `extension/` (manifest.json en la raíz del zip).
   - O usa el ya generado: `publish/locali-extension-v0.3.0.zip` (recuerda regenerarlo con URLs de producción).
3. **New Item** → sube el ZIP.
4. Store listing:
   - Textos listos en `publish/STORE_LISTING.md` (inglés y hebreo).
   - Screenshots 1280×800: abre AliExpress con la extensión activa y captura el panel
     (mínimo 1, ideal 3-5).
   - Ícono 128×128: ya está en `extension/icons/icon128.png`.
5. **Privacy**:
   - Privacy policy URL: `https://<tu-url-vercel>/privacy` (la página ya existe).
   - Justifica permisos: geolocation = "find nearby stores", storage = "user preferences",
     host permissions = "read product title/price on shopping sites".
6. Submit for review (3-7 días hábiles).

## 5. Afiliados (cuando haya tracción)

Los links ya salen con parámetros de afiliado (`matching_engine.py` → `AFFILIATE_PARAMS`).
Cuando te aprueben cada programa, reemplaza los IDs placeholder:
- **Zap**: https://www.zap.co.il/affiliate → reemplazar `affid=LOCALI`
- **KSP**: contactar programa de partners → reemplazar `partner=LOCALI`
- **Bug / Ivory**: contactar para partnership → ajustar `ref=locali`

## 6. App Android (opcional, después del lanzamiento web)

Ver `locali-app/README.md`. Para la Play Store: cuenta de desarrollador Google Play ($25 único),
`eas build -p android` y `eas submit`.

---

### Checklist final antes de publicar

- [ ] Backend deployado y `/health` responde
- [ ] Frontend deployado, `/compare` y `/privacy` funcionan
- [ ] URLs de producción actualizadas en los 4 archivos
- [ ] ZIP de la extensión regenerado con URLs de producción
- [ ] Probada la extensión empaquetada en una página real de AliExpress
- [ ] Store listing + screenshots + privacy URL en la Web Store
