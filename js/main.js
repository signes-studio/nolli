/* =========================================================================
   MAIN.JS — Punto de entrada de la aplicación
   Descarga los edificios, prepara filtros y arranca el mapa. Se carga como
   <script type="module"> por lo que se ejecuta en modo defer de forma nativa.
   ========================================================================= */

import { state, separarArquitectos } from './state.js';
import { fetchBuildings } from './api.js';
import { generarFiltrosUI } from './filtersUI.js';
import { cargarMapaMapbox } from './mapController.js';
import { initModalsUI } from './modalsUI.js';
import { initSearchUI } from './searchUI.js';

async function inicializarRadar() {
  try {
    const datosDB = await fetchBuildings();

      state.OBRAS = datosDB.map((fila, index) => ({
      id: fila.id,
        featureId: String(fila.id ?? `obra-${index}`),
      nombre_obra: fila.nombre_obra,
      arquitecto: fila.arquitecto,
      arquitectos: separarArquitectos(fila.arquitecto),
      año_construccion: fila.año_construccion,
      importancia: Number(fila.importancia) || 1,
      categoria: fila.categoria || 'otro',
      visitable: fila.visitable === true || fila.visitable === 1 || fila.visitable === 'true',
      añadido_por: fila.añadido_por || null,
      coordenadas: [fila.longitud, fila.latitud],
      selected: false,
    }));

    state.ARQUITECTOS = [...new Set(state.OBRAS.flatMap((o) => o.arquitectos))];
    state.activeArquitectos = new Set(state.ARQUITECTOS);
    document.dispatchEvent(new CustomEvent('radar:data-ready'));

    generarFiltrosUI();
    cargarMapaMapbox();
  } catch (error) {
    console.error('Error:', error);
    alert('Error de conexión con la base de datos.');
  }
}

initModalsUI();
initSearchUI();
lucide.createIcons();
inicializarRadar();
