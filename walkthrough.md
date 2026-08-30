# Walkthrough: Reactividad Optimista Instantánea ($0\text{ms}$) en Ficha de Obra

Se ha implementado el patrón de **Optimistic UI / Reactividad Local Instantánea** para todas las acciones de la ficha de obra en **Nolli** (❤️ Favorito, 🚩 Visitar, 📑 Guardar en Listas, 🏷️ Etiquetas y ⭐ Valoración).

---

## 1. ⚡ Interacción Instantánea a $0\text{ms}$ (Sin Esperas ni Recargas)
- **Función Reactiva `renderSheetStatusUI(building)`**:
  - **Favorito (Corazón)**: Conmuta inmediatamente a bloque sólido vermillón `#E84E1B`, texto en blanco e icono de corazón relleno con `fill="currentColor"`.
  - **Visitar**: Inversión cromática instantánea a bloque verde bosque `#0d682f` con texto `VISITADO`.
  - **Guardar / Listas**: Conmuta inmediatamente a bloque sólido negro `#141411` (o `#EFBC02` en modo oscuro) con texto `GUARDADO` e icono relleno.
  - **Etiquetas**: Refleja el estado `.active.tagged` en tiempo real.
  - **Estrellas de Valoración**: Rellenado reactivo e interactivo inmediato.

---

## 2. 🛡️ Sincronización en Segundo Plano y Persistencia Resiliente
- **Actualización Local**: Estado indexado por `buildingId` en `state.buildingStatuses` y respaldado en `localStorage`.
- **Actualización de Halos en el Mapa**: Se dispara `actualizarFuenteMapa()` al milisegundo para que los halos de favoritos y visitados en el mapa se enciendan o apaguen en vivo sin cerrar la Bottom Sheet.
- **Sincronización Silenciosa con Supabase**: Se envía la mutación a la base de datos en segundo plano; en caso de corte o lentitud de red, los datos permanecen seguros localmente sin revertir bruscamente ni bloquear al usuario.
