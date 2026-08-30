# Walkthrough: Rediseño Integral de la Ficha de Arquitecto (Neo-Bauhaus)

Se ha implementado el rediseño completo de la **Ficha de Arquitecto** en formato *Bottom Sheet* para dispositivos móviles, transformando la lista de obras en un catálogo monográfico interactivo y modular con la estética estricta **Neo-Bauhaus**.

---

## 1. 📐 Estructura Bottom Sheet y Cabecera Bauhaus
- **Panel Deslizante Móvil**: Configurado para ocupar aprox. el 75-80% del viewport (`height: min(78vh, calc(100dvh - 55px))`) con bordes superiores rectos (`border-radius: 0 !important; border-top: 2px solid #141411;`) y fondo crema editorial `#F4F1EA`.
- **Tirador Táctil (*Drag Handle*)**: Barra superior para cierre por arrastre vertical (*swipe-down*).
- **Cabecera Tipográfica**:
  - Título de sección `[ FICHA DE AUTOR // ARQUITECTURA ]` en `League Spartan` (800).
  - Nombre del arquitecto en `League Spartan` mayúsculas (900) de 24-26px.
  - Contador de catálogo en formato técnico: `[ N OBRAS REGISTRADAS ]` en `JetBrains Mono` con acento vermillón `#E84E1B`.
  - Botón de cierre ("X") geométrico de $\ge 44\times 44\text{px}$.

---

## 2. 🗂️ Tarjetas Modulares de Obras (`.architect-work-card`)
Cada proyecto del autor se presenta en una tarjeta rectangular táctil e interactiva:
- **Bloque de Año**: Situado en el lateral izquierdo con recuadro Bauhaus y año en tipografía `League Spartan` (bold 900) en color vermillón `#E84E1B`.
- **Título de la Obra**: En tipografía `Inter` (bold 700) con excelente jerarquía y legibilidad.
- **Insignia de Categoría Cromática**: Píldora rectangular técnica con el color exacto de la categoría (`CATEGORY_COLORS`: residencial `#E95C0C`, dotacional `#4388C6`, etc.).
- **Contexto Geográfico / Ciudad (`place`)**: Extraído de la columna `place` (o `ciudad`) de Supabase (ej: `· Valencia`).
- **Miniatura Fotográfica**: En caso de disponer de imagen, miniatura cuadrada con marco negro a la derecha.

---

## 3. ⚡ Scroll Táctil a 60 FPS y Navegación
- **Desplazamiento Suave**: Contenedor con `overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior-y: contain;`.
- **Margen de Seguridad Inferior**: `padding-bottom: calc(85px + env(safe-area-inset-bottom))` para que ninguna tarjeta quede oculta detrás de la barra de navegación inferior fija.
- **Interacción Directa**: Al pulsar cualquier tarjeta, se cierra la ficha de autor, la cámara vuela al edificio con padding de seguridad y se abre de inmediato su Ficha Técnica (*Bottom Sheet*).
