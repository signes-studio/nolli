# Walkthrough: Sincronización Integral de Splash Screen Nativa TWA / Android y Web

Se ha eliminado la duplicidad y el salto visual entre la Splash Screen del sistema operativo Android (generada por Bubblewrap / Android Studio / TWA) y la pantalla de carga web de **Nolli**, logrando una transición unificada, limpia e imperceptible a 60 FPS.

---

## 1. 🎯 Unificación Cromática y Cero FOUC
- **Color Base Sincronizado**: Tanto la ventana nativa de Android como el DOM web utilizan de forma estricta `#F4F1EA` (crema editorial) como color de fondo y de tema.
- **CSS Crítico en `<head>`**: Inyección inline inmediata de `html, body { background-color: #F4F1EA !important; }` para que el primer milisegundo de pintado (*First Contentful Paint*) en la WebView sea 100% indistinguible del lienzo nativo de Android.
- **Metaetiquetas Específicas**: `<meta name="theme-color" content="#F4F1EA">` y `<meta name="background-color" content="#F4F1EA">`.

---

## 2. 📱 Configuración de Empaquetado TWA (`twa-manifest.json` / `manifest.json`)
- **`manifest.webmanifest` & `manifest.json`**:
  - `"background_color": "#F4F1EA"`
  - `"theme_color": "#F4F1EA"`
  - `"display": "standalone"`
- **`twa-manifest.json` (Bubblewrap / PWABuilder)**:
  - `"backgroundColor": "#F4F1EA"`
  - `"themeColor": "#F4F1EA"`
  - `"navigationColor": "#F4F1EA"`
  - `"splashScreenFadeOutDuration": 300` (transición suave de salida al cargar la WebView).

---

## 3. ⚡ Flujo de Entrada Continuo
Al abrir la app instalada en Android:
1. Android muestra la ventana con fondo crema editorial `#F4F1EA` y el icono de Nolli.
2. La WebView se inicializa sobre el mismo fondo exacto sin ningún parpadeo en blanco ni en negro.
3. Se presenta el recuadro central Neo-Bauhaus con la barra constructivista y el estado de carga (`[ CARGANDO MAPA Y DATOS ]`).
4. Al cargarse los datos de Supabase, se desvanece suavemente a 60 FPS revelando el mapa.
