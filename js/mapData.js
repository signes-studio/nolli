/* =========================================================================
   MAPDATA.JS — Sincroniza OBRAS (state) con la fuente GeoJSON de Mapbox
   ========================================================================= */

import { state } from './state.js';

export function actualizarFuenteMapa() {
  const geojson = {
    type: 'FeatureCollection',
    features: state.OBRAS.map((o) => ({
      type: 'Feature',
      id: o.id, // Fundamental para que Mapbox distinga cada pin individualmente
      geometry: { type: 'Point', coordinates: o.coordenadas },
      properties: o,
    })),
  };

  if (state.map && state.map.getSource('obras')) {
    state.map.getSource('obras').setData(geojson);
  }
}
```[cite: 16]

### Y comprueba el evento del botón "X" en `js/sheetUI.js`
Para asegurarte de que el botón de cierre responde al 100%, verifica que la función `cerrarFicha` en tu `sheetUI.js` limpia el estado global y llama a actualizar el mapa así:

```javascript
export function cerrarFicha() {
  sheet.classList.remove('open');
  if (state.selectedFeatureId !== null) {
    const obraAnterior = state.OBRAS.find((o) => o.id === state.selectedFeatureId);
    if (obraAnterior) obraAnterior.selected = false;
    actualizarFuenteMapa();
    state.selectedFeatureId = null;
  }
}