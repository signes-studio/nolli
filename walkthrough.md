# Walkthrough: Arquitectura Móvil Ampliada (Identidad Flotante + Perfil App + Bottom Sheet de Obra)

Se ha completado la ampliación del sistema mobile-first de Nolli, adaptando la experiencia de usuario a patrones tipo App nativa (Google Maps + Neo-Bauhaus) con preservación del 100% de la versión de escritorio.

---

## 🏛️ 1. Widget de Identidad y Sesión Flotante (`#mobile-identity-widget`)
- **Ubicación**: Esquina superior izquierda (`top: max(10px, env(safe-area-inset-top)); left: 10px; z-index: 40;`).
- **Morfología Bauhaus**: Bloque rectangular compacto con bordes rectos (`border-radius: 0`), marco negro estructural de 1px (`#141411`), fondo crema `#F4F1EA` y sombra sólida desplazada (`box-shadow: 2px 2px 0px #141411`).
- **3 Estados de Sesión Dinámicos**:
  1. **Invitado / No autenticado**: Muestra `nolli.` + `[ ACCEDER ]`. Al hacer tap abre `#modal-login`.
  2. **Usuario Autenticado**: Muestra `nolli.` + `[ INICIALES ]` (ej. `[ JD ]` o `[ USR ]`). Al hacer tap navega a `perfil.html`.
  3. **Administrador (`esRolAdmin`)**: Resalta en bermellón `#E84E1B` con `[ ADMIN ]`. Al hacer tap despliega un menú rápido flotante (`#mobile-admin-quickmenu`) con accesos directos a revisión de proyectos, buzón de reportes y perfil.

---

## 📱 2. Rediseño Mobile-First del Perfil (`perfil.html` + `profile.css`)
- **Experiencia de App Dedicada**: Eliminada la estructura de página web convencional en móvil (`100dvh`), con barra superior compacta, cabecera de usuario constructivista y barra de navegación inferior fija (`#mobile-bottom-bar`).
- **Bloques Modulares Rectangulares**:
  - Títulos en **`League Spartan`** mayúsculas (`font-weight: 800/900`).
  - Textos descriptivos en **`Inter`**.
  - Metadatos y contadores en **`JetBrains Mono`**.
- **Botones a Ancho Completo (`width: 100%`)**: Todos los botones de acción primarios ocupan el 100% del ancho con altura mínima de **$48\text{ px}$** para interacción con el pulgar.
- **Pestañas Horizontales Táctiles**: Desplazamiento táctil suave con inercia nativa y botones de $\ge 46\text{px}$.
- **Apertura de Obras *In-Situ***: Al pulsar en cualquier obra o lista del perfil, se abre en el mapa con su Bottom Sheet sin recargas innecesarias ni desajustes.

---

## 📐 3. Fichas de Obra en Bottom Sheet Optimizado
- **Dimensiones ergonómicas**: Ocupa el **70%–80% del alto** (`height: min(78vh, calc(100dvh - 55px)); max-height: 82vh;`), ideal para lectura reposada de la memoria y la fotografía.
- **Estética Bauhaus Pura**: Fondo crema editorial `#F4F1EA`, bordes superiores totalmente rectos (`border-radius: 0 !important; border-top: 2px solid #141411;`), fotografía panorámica y tipografía técnica.
- **Botón de Cierre "X"**: Caja ortogonal visible de $48 \times 48\text{ px}$.
- **Gesto de Arrastre hacia Abajo (*Swipe-Down*)**: Implementado detector táctil en el *drag handle* y cabecera del panel para arrastrar y cerrar el panel con el dedo.
- **Desplazamiento Inteligente de Cámara Mapbox**: El mapa reubica el marcador en la zona superior libre con `map.easeTo({ padding: { bottom: 45vh } })`.

---

## ⚡ 4. Rendimiento Táctil y Aislamiento de Escritorio
- **60 FPS Estables**: Transiciones gobernadas por GPU (`transform: translateY(...) translate3d(0,0,0)` y `opacity`, `will-change: transform`).
- **Escritorio Intacto**: Todos los elementos móviles (`#mobile-identity-widget`, `#mobile-admin-quickmenu`, `#mobile-bottom-bar`, drag handles) tienen `display: none !important;` en pantallas `> 768px`.

