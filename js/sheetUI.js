/* =========================================================================
   SHEETUI.JS — Ficha técnica (bottom sheet)
   ========================================================================= */

import { state } from './state.js';
import { actualizarFuenteMapa } from './mapData.js';
import { cerrarFiltros } from './filtersUI.js';

const sheet = document.getElementById('sheet');

export function cerrarFicha() {
  sheet.classList.remove('open');
  if (state.selectedFeatureId !== null) {
    const obraAnterior = state.OBRAS.find((o) => o.id === state.selectedFeatureId);
    if (obraAnterior) obraAnterior.selected = false;
    actualizarFuenteMapa();
    state.selectedFeatureId = null;
  }
}

export function abrirFicha(p, c) {
  const clickedId = p.id;

  // Limpiar selección anterior si la hubiera
  if (state.selectedFeatureId !== null) {
    const obraAnterior = state.OBRAS.find((o) => o.id === state.selectedFeatureId);
    if (obraAnterior) obraAnterior.selected = false;
  }

  state.selectedFeatureId = clickedId;
  const obraNueva = state.OBRAS.find((o) => o.id === state.selectedFeatureId);
  if (obraNueva) obraNueva.selected = true;

  actualizarFuenteMapa();

  document.getElementById('sheet-title').innerHTML = p.nombre_obra;
  document.getElementById('sheet-body').innerHTML = `
    <div class="data-row"><div class="label">[ARQUITECTO]</div><div class="value accent">${p.arquitecto}</div></div>
    <div class="data-row"><div class="label">[AÑO]</div><div class="value">${p.año_construccion}</div></div>
    <div class="data-row"><div class="label">[COORD]</div><div class="value">${c[0].toFixed(5)}, ${c[1].toFixed(5)}</div></div>
  `;
  sheet.classList.add('open');
  cerrarFiltros();
}

// Enlace directo y seguro al botón de cerrar
document.getElementById('btn-sheet-close').addEventListener('click', (e) => {
  e.stopPropagation();
  cerrarFicha();
});

document.addEventListener('radar:cerrar-ficha', cerrarFicha);
```[cite: 17]

---

### 2. Añadir Buscador en el Filtro de Arquitectos

Para que el panel de filtros no sea eterno si añadís muchos arquitectos, vamos a inyectar una barra de búsqueda rápida arriba del todo en el panel de filtros.

#### Actualiza `js/filtersUI.js`:
Sustituye el contenido de `filtersUI.js` por esto para incluir el campo de texto que filtra en tiempo real[cite: 11]:

```javascript
/* =========================================================================
   FILTERSUI.JS — Panel de filtros por arquitecto con buscador
   ========================================================================= */

import { state } from './state.js';

const filterPanel = document.getElementById('filter-panel');
const btnFilters = document.getElementById('btn-filters');
const filterSwitches = document.getElementById('filter-switches');

export function generarFiltrosUI() {
  renderizarListaFiltros('');
}

function renderizarListaFiltros(filtroTexto = '') {
  filterSwitches.innerHTML = '';

  // Inyectar un buscador rápido la primera vez si no existe
  let searchInput = document.getElementById('architect-search');
  if (!searchInput) {
    const searchContainer = document.createElement('div');
    searchContainer.style.padding = '8px 12px';
    searchContainer.style.borderBottom = '1px solid var(--border)';
    searchContainer.innerHTML = `
      <input type="text" id="architect-search" placeholder="[ FILTRAR ARQUITECTO... ]" class="tech-input" style="font-size:10px; padding:6px 8px;">
    `;
    filterPanel.insertBefore(searchContainer, filterSwitches);
    
    searchInput = document.getElementById('architect-search');
    searchInput.addEventListener('input', (e) => {
      renderizarListaFiltros(e.target.value.toLowerCase());
    });
  }

  state.ARQUITECTOS.forEach((arq) => {
    if (!arq) return;
    if (filtroTexto && !arq.toLowerCase().includes(filtroTexto)) return;

    const row = document.createElement('div');
    row.className = 'switch-row';
    const isChecked = state.activeArquitectos.has(arq);
    row.innerHTML = `
      <span style="text-transform: uppercase;">${arq}</span>
      <div class="tech-switch">
        <input type="checkbox" ${isChecked ? 'checked' : ''} data-arq="${arq}">
        <div class="track"></div>
        <div class="thumb"></div>
      </div>
    `;
    filterSwitches.appendChild(row);
  });
}

export function cerrarFiltros() {
  filterPanel.classList.remove('open');
  btnFilters.classList.remove('active-state');
}

function initFiltersUI() {
  filterPanel.addEventListener('change', (e) => {
    if (e.target.type !== 'checkbox') return;
    const arq = e.target.dataset.arq;
    if (e.target.checked) state.activeArquitectos.add(arq);
    else state.activeArquitectos.delete(arq);

    if (state.map && state.map.getLayer('obras-layer')) {
      aplicarFiltrosMapa();
    }
  });

  document.getElementById('btn-filters-close').addEventListener('click', cerrarFiltros);

  btnFilters.addEventListener('click', () => {
    filterPanel.classList.toggle('open');
    btnFilters.classList.toggle('active-state');
    document.dispatchEvent(new CustomEvent('radar:cerrar-ficha'));
  });
}

export function aplicarFiltrosMapa() {
  if (!state.map || !state.map.getLayer('obras-layer')) return;
  
  // Filtramos simultáneamente por arquitecto Y por el nivel de zoom actual
  const zoomActual = state.map.getZoom();
  
  // Jerarquía por zoom: 
  // Zoom < 11: Solo categoría 1 (Alta importancia)
  // Zoom 11 - 13.5: Categorías 1 y 2
  // Zoom > 13.5: Todas (1, 2 y 3)
  let maxImportanciaPermitida = 3;
  if (zoomActual < 11) maxImportanciaPermitida = 1;
  else if (zoomActual < 13.5) maxImportanciaPermitida = 2;

  state.map.setFilter('obras-layer', [
    'all',
    ['in', ['get', 'arquitecto'], ['literal', [...state.activeArquitectos]]],
    ['<=', ['get', 'importancia'], maxImportanciaPermitida]
  ]);
}

initFiltersUI();
```[cite: 11]

---

### 3. Jerarquía de Iconos por Importancia y Filtro por Zoom

Para soportar esto en la base de datos y en el código, necesitamos que cada edificio tenga un campo de **importancia** (por ejemplo: `1` para obras maestras/alta relevancia, `2` para relevancia media, y `3` para obra menor/secundaria).

#### Paso A: Asegurar la propiedad `importancia` en `main.js`
Modifica el mapeo inicial en `js/main.js` para capturar la importancia (si en Supabase aún no tienes esa columna, asignará por defecto `1` para que no falle)[cite: 7]:

```javascript
    state.OBRAS = datosDB.map((fila) => ({
      id: fila.id,
      nombre_obra: fila.nombre_obra,
      arquitecto: fila.arquitecto,
      año_construccion: fila.año_construccion,
      importancia: fila.importancia || 1, // 1 (alta), 2 (media), 3 (baja)
      coordenadas: [fila.longitud, fila.latitud],
      selected: false,
    }));
```[cite: 7]

#### Paso B: Actualizar los iconos vectoriales en `js/icons.js`
Vamos a crear tres diseños de iconos distintos según su jerarquía (por ejemplo: círculo completo para nivel 1, diana clásica para nivel 2, y un punto técnico pequeño para nivel 3):

```javascript
/* =========================================================================
   ICONS.JS — Iconos con jerarquía visual según importancia
   ========================================================================= */

export function buildIcon(draw, color, importance, size = 64) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, color, importance, size);
  return ctx.getImageData(0, 0, size, size);
}

export function drawTargetIcon(ctx, color, importance, s) {
  const center = s / 2;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  if (importance === 1) {
    // NIVEL 1: Obra maestra (Círculo sólido grande con punto central)
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(center, center, s * 0.35, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(center, center, s * 0.12, 0, Math.PI * 2); ctx.fill();
  } else if (importance === 2) {
    // NIVEL 2: Relevancia media (Diana técnica estándar)
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(center, center, s * 0.28, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(center, s * 0.08); ctx.lineTo(center, s * 0.24);
    ctx.moveTo(center, s * 0.76); ctx.lineTo(center, s * 0.92);
    ctx.moveTo(s * 0.08, center); ctx.lineTo(s * 0.24, center);
    ctx.moveTo(s * 0.76, center); ctx.lineTo(s * 0.92, center);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(center, center, 3, 0, Math.PI * 2); ctx.fill();
  } else {
    // NIVEL 3: Obra secundaria / menor (Cruz minimalista pequeña)
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(center, s * 0.25); ctx.lineTo(center, s * 0.75);
    ctx.moveTo(s * 0.25, center); ctx.lineTo(s * 0.75, center);
    ctx.stroke();
  }
}
```[cite: 14]

#### Paso C: Registrar y actualizar las capas en `js/mapController.js`
Asegúrate de que `mapController.js` registre los iconos con sus diferentes importancias y escuche el evento de **zoom** del mapa para actualizar dinámicamente qué pines se muestran[cite: 12]:

```javascript
import { state } from './state.js';
import { MAPBOX_TOKEN, MAP_STYLE, DEFAULT_CENTER, DEFAULT_ZOOM } from './config.js';
import { buildIcon, drawTargetIcon } from './icons.js';
import { actualizarFuenteMapa } from './mapData.js';
import { abrirFicha, cerrarFicha } from './sheetUI.js';
import { aplicarFiltrosMapa } from './filtersUI.js';

mapboxgl.accessToken = MAPBOX_TOKEN;

export function cargarMapaMapbox() {
  state.map = new mapboxgl.Map({
    container: 'map',
    style: MAP_STYLE,
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    attributionControl: true,
  });
  state.map.dragRotate.disable();
  state.map.touchZoomRotate.disableRotation();

  state.map.on('load', () => {
    // Generar iconos dinámicos para cada nivel de importancia (Naranja y Seleccionado Blanco)
    [1, 2, 3].forEach((imp) => {
      state.map.addImage(`icon-l${imp}`, buildIcon(drawTargetIcon, '#FF4500', imp), { pixelRatio: 2 });
      state.map.addImage(`icon-l${imp}-sel`, buildIcon(drawTargetIcon, '#FFFFFF', imp), { pixelRatio: 2 });
    });

    actualizarFuenteMapa();

    state.map.addLayer({
      id: 'obras-layer',
      type: 'symbol',
      source: 'obras',
      layout: {
        // Selecciona la imagen combinando si está seleccionado y su nivel de importancia
        'icon-image': [
          'case',
          ['==', ['get', 'selected'], true],
          ['concat', 'icon-l', ['string', ['get', 'importancia'], '1'], '-sel'],
          ['concat', 'icon-l', ['string', ['get', 'importancia'], '1']]
        ],
        'icon-size': 0.65,
        'icon-allow-overlap': true,
      },
    });

    // Escuchar el nivel de zoom para dinamizar la densidad de pines en tiempo real
    state.map.on('zoom', () => {
      aplicarFiltrosMapa();
    });

    state.map.on('mouseenter', 'obras-layer', () => { state.map.getCanvas().style.cursor = 'pointer'; });
    state.map.on('mouseleave', 'obras-layer', () => { state.map.getCanvas().style.cursor = ''; });

    iniciarInteraccionesMapa();
  });

  initHudReadout();
  document.getElementById('btn-recenter').addEventListener('click', () => {
    state.map.flyTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
  });
}

function initHudReadout() {
  const hL = document.getElementById('hud-lng');
  const hLa = document.getElementById('hud-lat');
  const hZ = document.getElementById('hud-zoom');

  function actualizarHud(lngLat) {
    if (lngLat) {
      hL.textContent = lngLat.lng.toFixed(5);
      hLa.textContent = lngLat.lat.toFixed(5);
    }
    hZ.textContent = state.map.getZoom().toFixed(1);
  }

  state.map.on('mousemove', (e) => actualizarHud(e.lngLat));
  state.map.on('move', () => actualizarHud());
  state.map.on('load', () => actualizarHud(state.map.getCenter()));
}

function iniciarInteraccionesMapa() {
  state.map.on('click', 'obras-layer', (e) => {
    const p = e.features[0].properties;
    const c = e.features[0].geometry.coordinates;
    abrirFicha(p, c);
  });

  state.map.on('click', (e) => {
    const isObra = state.map.queryRenderedFeatures(e.point, { layers: ['obras-layer'] });
    if (!isObra.length) cerrarFicha();
  });

  state.map.on('contextmenu', (e) => dispatchLongPress(e.lngLat));

  let pressTimer = null;
  let pressStart = null;
  state.map.on('touchstart', (e) => {
    if (e.points.length > 1) return;
    pressStart = e.lngLat;
    pressTimer = setTimeout(() => dispatchLongPress(pressStart), 600);
  });
  state.map.on('touchmove', () => clearTimeout(pressTimer));
  state.map.on('touchend', () => clearTimeout(pressTimer));
}

function dispatchLongPress(lngLat) {
  document.dispatchEvent(new CustomEvent('radar:map-longpress', { detail: { lngLat } }));
}
```[cite: 12]

---

### ¿Qué has conseguido con esto?
1. **Buscador en filtros:** Escribe las primeras letras de cualquier arquitecto y la lista se reduce al instante.
2. **Jerarquía visual:** Los edificios de máxima relevancia (`1`) se dibujan con un círculo sólido potente, los medianos (`2`) con la diana clásica, y los menores (`3`) con una cruz fina y limpia.
3. **Filtro dinámico por Zoom:** Al alejarte del mapa, las obras secundarias desaparecen automáticamente para evitar ruido visual, mostrando solo las de mayor relevancia institucional/arquitectónica. Al hacer zoom *in*, el radar despliega el catálogo completo.