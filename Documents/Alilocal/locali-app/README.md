# Locali — App Android (Expo)

App nativa: el usuario copia el URL de un producto (AliExpress, Amazon, etc.),
la app lo detecta en el clipboard, extrae el producto vía el backend (`/api/extract`)
y muestra dónde comprarlo en Israel (mismo motor `/match` que la extensión).

## Correr en desarrollo

```bash
cd locali-app
npm install
npx expo start
```

- **Emulador Android**: el backend en `http://10.0.2.2:8000` (ya configurado en `src/config.js`).
- **Teléfono físico**: instala "Expo Go" desde Play Store, escanea el QR, y cambia
  `BACKEND_URL` en `src/config.js` a `http://<IP-de-tu-PC>:8000` (misma red WiFi).

## Publicar en Play Store

```bash
npm install -g eas-cli
eas login
eas build -p android --profile production   # genera el .aab
eas submit -p android                        # lo sube a Play Console
```

Antes de publicar: cambiar `BACKEND_URL` en `src/config.js` a la URL de Railway.
