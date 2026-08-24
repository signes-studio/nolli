/* =========================================================================
   MAIN.JS — Punto de entrada de la aplicación
   Descarga los edificios, prepara filtros y arranca el mapa. Se carga como
   <script type="module"> por lo que se ejecuta en modo defer de forma nativa.
   ========================================================================= */

import { state } from './state.js';
import { fetchBuildings } from './api.js';
import { generarFiltrosUI } from './filtersUI.js';
import { cargarMapaMapbox } from './mapController.js';
import { initModalsUI } from './modalsUI.js';

async function inicializarRadar() {
  try {
    const datosDB = await fetchBuildings();

    state.OBRAS = datosDB.map((fila) => ({
      id: fila.id,
      nombre_obra: fila.nombre_obra,
      arquitecto: fila.arquitecto,
      año_construccion: fila.año_construccion,
      importancia: Number(fila.importancia) || 1,
      coordenadas: [fila.longitud, fila.latitud],
      selected: false,
    }));

    state.ARQUITECTOS = [...new Set(state.OBRAS.map((o) => o.arquitecto))];
    state.activeArquitectos = new Set(state.ARQUITECTOS);

    generarFiltrosUI();
    cargarMapaMapbox();
  } catch (error) {
    console.error('Error:', error);
    alert('Error de conexión con la base de datos.');
  }
}

initModalsUI();
lucide.createIcons();
inicializarRadar();
