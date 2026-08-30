# Walkthrough: Rescate de Visibilidad de Marcadores, Controles Flotantes y Búsqueda Global en Móvil

Se han aplicado de forma precisa y modular todas las correcciones para garantizar la visibilidad total de los puntos del mapa, la accesibilidad de los controles flotantes y la búsqueda completa en la base de datos con visualización de ciudades en **Nolli**.

---

## 1. 🗺️ Jerarquía de Z-Index y Visibilidad de Marcadores
- **Lienzo Activo**: `#map`, `.mapboxgl-canvas-container` y los marcadores interactivos se fijan en `z-index: 1` con `position: fixed` a `100dvh`, eliminando cualquier solapamiento o pérdida de visibilidad en navegadores móviles.
- **Inactivación Segura del Backdrop**: `#panel-backdrop` inactivo cuenta con `display: none !important; opacity: 0; pointer-events: none; z-index: -1; visibility: hidden;`, impidiendo que cree un velo invisible que capture toques o bloquee marcadores del mapa.

---

## 2. 📍 Elevación de Controles Flotantes de la Derecha (`#map-tools`)
- **Posición Ergonómica**: Elevado a `bottom: calc(80px + env(safe-area-inset-bottom)); right: 14px; z-index: 41;` para despejar completamente la barra inferior de navegación (56px).
- **Transparencia Táctil**: Contenedor `#map-tools` con `pointer-events: none;` y botones hijos con `pointer-events: auto;`, permitiendo interactuar con los marcadores situados alrededor del bloque sin obstáculos invisibles.

---

## 3. 📐 Margen de Seguridad Inferior del Viewport (Padding de Cámara)
- **Padding Dinámico de Cámara**: En dispositivos móviles (`<= 768px`), el mapa aplica un padding compensatorio de `{ top: 10, bottom: 64, left: 0, right: 0 }`.
- **Encuadre Centrado**: Al volar a cualquier obra, ubicación GPS o búsqueda, la chincheta o marcador queda holgadamente visible sobre la barra inferior y nunca atrapado detrás de ella.
- **Redimensionamiento Reactivo**: Controladores de `resize` y `orientationchange` que disparan `map.resize()` automáticamente.

---

## 4. 🔍 Búsqueda Global en Toda la Base de Datos con Ciudades Visibles
- **Catálogo Completo**: El buscador móvil ahora precarga y consulta todas las obras públicas de la base de datos en Supabase (`fetchBuildings({ includeAllImportance: true })`).
- **Ciudades Destacadas**: Cada resultado incorpora su chip de ciudad en tipografía técnica `JetBrains Mono` (ej. `[ VALENCIA ]`, `[ MADRID ]`, `[ BARCELONA ]`).
- **Navegación Fluida**: Al pulsar una obra de otra región, se añade a la fuente del mapa, se vuela a sus coordenadas exactas y se abre su Ficha Técnica (*Bottom Sheet*) de inmediato.
