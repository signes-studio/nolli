# Walkthrough: Pantalla de Carga Móvil / Splash Screen (Neo-Bauhaus)

Se ha diseñado e implementado la nueva pantalla de carga móvil (*Splash Screen / Loading State*) para **Nolli**, ofreciendo una primera impresión inmersiva y acorde con los principios de diseño constructivista y Neo-Bauhaus.

---

## 1. 🎨 Estética Editorial e Identidad de Marca
- **Lienzo Editorial Absoluto**: Ocupa el 100% del viewport (`100dvh`, `z-index: 9999`) con fondo crema `#F4F1EA` (adaptable a `#141411` en tema oscuro).
- **Recuadro Central Bauhaus**: Tarjeta ortogonal con marco negro y sombra rígida (`border: 2px solid #141411; box-shadow: 4px 4px 0px #141411;`).
- **Jerarquía Tipográfica**:
  - Kicker técnico: `[ GUÍA DE ARQUITECTURA ]` en `JetBrains Mono` en color vermillón `#E84E1B`.
  - Logotipo central: `nolli.` en `League Spartan` (bold 900, 40px) con el característico punto vermillón.
  - Estado de carga: `[ CARGANDO MAPA Y DATOS ]` en tipografía `Inter` (bold, mayúsculas).

---

## 2. ⬛ Indicador Constructivista (Cero Spinners Circulares)
- **Barra de Bloques Segmentados**: Recuadro modular de 4 bloques que pulsan secuencialmente en tonos vermillón y negro, evocando la estética constructivista y prescindiendo de spinners circulares genéricos.

---

## 3. ⚡ Transición Fluida a 60 FPS y Sincronización
- **Aceleración por Hardware**: `transition: opacity 0.4s ease-in-out, visibility 0.4s ease-in-out; will-change: opacity;`.
- **Desvanecimiento Inmediato**: En cuanto el mapa y la primera carga de datos disparan `radar:data-ready`, el estado se actualiza a `[ DATOS SINCRONIZADOS ]` y se desvanece de manera suave revelando el mapa.
- **Protección Máxima de Escritorio**: En resoluciones superiores a 768px, el elemento permanece con `display: none !important;`.
