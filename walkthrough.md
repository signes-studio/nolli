# Walkthrough: Rediseño Integral de Fichas de Obra (Bottom Sheet) Neo-Bauhaus

Se ha completado el rediseño integral de las **Fichas de Obra (Bottom Sheets)** en móvil para **Nolli**, aplicando la ergonomía de una aplicación cartográfica moderna con la pureza formal y tipográfica de nuestra identidad **Neo-Bauhaus**.

---

## 1. 🔲 Estructura y Dimensiones del Bottom Sheet
- **Altura Ergonométrica**: Ocupa aprox. el 75% del viewport (`height: min(75vh, calc(100dvh - 60px)); max-height: 80vh; min-height: 55vh;`).
- **Geometría Bauhaus**: Borde superior 100% recto (`border-radius: 0 !important; border-top: 2px solid #141411;`) y fondo crema editorial `#F4F1EA`.
- **Tirador Táctil (Drag Handle)**: Barra sobria en la parte superior para cierre suave mediante gesto *swipe-down* acelerado por hardware a 60 FPS.

---

## 2. 🔤 Cabecera Limpia y Jerarquía Visual
- **Desaparición del Exceso de Iconos**: Eliminada la barra saturada de 7 botones amontonados.
- **Acciones Rápidas en Cabecera**: Botón directo de Favorito (`[ ♥ ]` con corazón en rojo vermillón al activarse) y botón geométrico de cierre ("X") con área táctil $\ge 44\times 44\text{px}$.
- **Nombre de la Obra**: Título rotundo en **`League Spartan`** (mayúsculas, bold 900).
- **Subtítulo de Metadatos**: Arquitecto enlazado en color vermillon (`#E84E1B`), año de construcción y ciudad en tipografía `Inter`.

---

## 3. 🎯 Botones de Acción Hero ($\ge 48\text{px}$)
Fila horizontal con desplazamiento táctil suave (`overflow-x: auto`) ubicada directamente bajo el título:
- **Botón Primario Destacado**: `[ ↗ CÓMO LLEGAR ]` en bloque sólido negro (`#141411`), que abre la ruta GPS directa en Google Maps con las coordenadas del edificio.
- **Botones Secundarios Táctiles**:
  - `[ ✓ VISITADO ]`: Toggle de visita con estado activo en verde oscuro (`#0d682f`).
  - `[ 🔖 GUARDAR ]`: Abre el modal organizador de listas y colecciones.
  - `[ ↗ COMPARTIR ]`: Despliega el panel de enlace y redes.
  - `[ 🏷️ ETIQUETA ]`: Gestión de etiquetas privadas.

---

## 4. 🖼️ Galería de Imágenes Inmersiva
- **Banner Panorámico**: Marco negro ortogonal con sombra dura Bauhaus (`box-shadow: 2px 2px 0px #141411`).
- **Badge Táctil de Zoom**: Indicador interactivo `[ ⤢ AMPLIAR ]` que despliega el visor a pantalla completa en alta definición.

---

## 5. 📐 Ficha Técnica Modular (Matriz Tipográfica Limpia)
Sustituidas las antiguas tablas rígidas por una matriz ortogonal de líneas negras Bauhaus:
- **`[ ARQUITECTO ]`**: Nombre enlazado en color vermillon con apertura inmediata del catálogo completo de obras del autor.
- **`[ AÑO / CATEGORÍA ]`**: Bloque modular de 2 columnas con badge cromático según la tipología arquitectónica.
- **`[ ACCESO ]`**: Indicador técnico claro del régimen de visita (`PÚBLICO`, `EXTERIOR VISIBLE`, `CON RESERVA`, `PRIVADO`).
- **`[ COORDENADAS ]`**: Lectura GPS en `JetBrains Mono`.
- **`[ ENLACE OFICIAL ]`**: Botón web oficial del proyecto.

---

## 6. 📝 Cuaderno Privado y Herramientas de Gestión
- **Valoración por 5 Estrellas y Notas Privadas**: Módulo dedicado para anotaciones personales y estado de conservación.
- **Módulo de Moderación / Admin**: Botones para editar o eliminar obra visibles únicamente para administradores o creadores de la ficha.
- **Reporte de Errores**: Enlace discreto para reportar incidencias técnicas.

---

## 7. ⚡ Scroll y Rendimiento
- `overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior-y: contain; padding-bottom: calc(75px + env(safe-area-inset-bottom));` garantizando que todo el contenido se lea por encima de la barra inferior fija.
- Aceleración por GPU a 60 FPS estables.
- Versión de escritorio (`> 768px`) 100% blindada e intacta.
