# Walkthrough: Rediseño Móvil Inspirado en Strava (Estética Neo-Bauhaus)

Se ha completado el rediseño integral de la experiencia de navegación móvil y controles cartográficos para **Nolli**, combinando la ergonomía de exploración de **Strava** con la estética constructivista **Neo-Bauhaus** (`League Spartan`, marcos negros `1.5px`, fondo crema `#F4F1EA`, acentos vermillón `#E84E1B` y `border-radius: 0`).

---

## 1. 🧭 Nueva Barra de Navegación Inferior (5 Pestañas)
1. **`[ MAPA ]`** (`i: map`): Cierra cualquier panel activo y devuelve el foco cartográfico a pantalla completa.
2. **`[ EXPLORA ]`** (`i: compass`): Despliega el buscador y feed vertical de obras por proximidad a 60 FPS.
3. **`[ MI RADAR ]`** (`.mobile-nav-radar-btn` con `i: crosshair`): Botón central protagonista con contenedor interior contrastado para rutas de autor, radar arquitectónico y actividad.
4. **`[ LISTAS ]`** (`i: bookmark`): Acceso directo a colecciones personales, listas temáticas con emojis, favoritos y notas.
5. **`[ TÚ ]`** (`i: user`): Perfil personal de usuario (`perfil.html`) con estadísticas de exploración, progreso y panel de ajustes.

---

## 2. 🎛️ Controles Flotantes Derechos Ergonomía Strava (`#mobile-map-controls`)
Apilados verticalmente en el lateral derecho por encima de la barra de navegación (`bottom: calc(76px + safe-area); right: 12px;`):
- **Botón de Capas (`#btn-float-layers`)**: Despliega la cuadrícula compacta de 2 columnas con previsualizaciones de mapa (Claro, Oscuro, Híbrido).
- **Botón de Filtros (`#btn-float-filters`)**: Despliega el panel de filtros avanzados (categorías, estado de acceso, décadas, arquitectos).
- **Botón de Geolocalización (`#btn-float-locate`)**: Centra la cámara instantáneamente en las coordenadas GPS del dispositivo con feedback visual activo.

---

## 3. 🛡️ Inviolabilidad de Escritorio y Calidad QA
- Los nuevos controles móviles quedan estrictamente ocultos en pantallas grandes (`@media (min-width: 769px)` con `display: none !important;`).
- Auditoría E2E superada al 100% (13/13 pruebas PASS).
