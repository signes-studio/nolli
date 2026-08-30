// js/radarUI.js
import { state, CATEGORY_COLORS, escapeHtml } from './state.js';
import { abrirFicha } from './sheetUI.js';
import { calcularDistanciaMetros } from './exploreUI.js';

let radarRadius = 1000; // 1000m por defecto

export const CURATED_ROUTES = [
  {
    id: 'route-brutalismo',
    title: 'BRUTALISMO EN EL CENTRO',
    subtitle: 'Hormigón visto, geometrías masivas y honestidad estructural',
    tag: 'CURADA POR NOLLI',
    color: '#E84E1B',
    stops: 6,
    keywords: ['brutalismo', 'hormigón', 'estructura', 'industrial']
  },
  {
    id: 'route-siza',
    title: 'RUTA ÁLVARO SIZA',
    subtitle: 'Luz atlántica, volúmenes puros y diálogo sensible con el lugar',
    tag: 'MONOGRÁFICA',
    color: '#0d682f',
    stops: 4,
    architectFilter: 'Álvaro Siza'
  },
  {
    id: 'route-vanguardias',
    title: 'VANGUARDIAS DEL SIGLO XX',
    subtitle: 'Racionalismo, espíritu Bauhaus y los orígenes de la modernidad',
    tag: 'HISTÓRICA',
    color: '#EFBC02',
    stops: 8,
    decadeFilter: '1930'
  },
  {
    id: 'route-racionalismo',
    title: 'RACIONALISMO MEDITERRÁNEO',
    subtitle: 'Blancura, sombra, pérgolas y adaptación climática vernácula',
    tag: 'TIPOLÓGICA',
    color: '#0284c7',
    stops: 5,
    keywords: ['mediterráneo', 'racionalismo', 'vivienda']
  },
  {
    id: 'route-industrial',
    title: 'ARQUITECTURA INDUSTRIAL',
    subtitle: 'Naves históricas, tinglados portuarios y patrimonio recuperado',
    tag: 'PATRIMONIO',
    color: '#7c3aed',
    stops: 7,
    categoryFilter: 'industrial'
  }
];

function getRadarCenter() {
  if (state.userLocation && state.userLocation.length === 2) {
    return state.userLocation;
  }
  if (state.map) {
    const center = state.map.getCenter();
    return [center.lng, center.lat];
  }
  return [-0.3763, 39.4699]; // Valencia centro
}

export function formatearDistanciaRadar(metros) {
  if (!isFinite(metros) || metros == null) return '';
  if (metros < 1000) {
    return `A ${Math.round(metros)} METROS`;
  }
  return `A ${(metros / 1000).toFixed(1)} KM`;
}

export function renderRadarUI() {
  const container = document.getElementById('radar-detected-list');
  const countSpan = document.getElementById('radar-detected-count');
  const curatedContainer = document.getElementById('radar-curated-carousel');
  if (!container) return;

  // 1. Render Carrusel de Rutas Curatoriales
  if (curatedContainer) {
    curatedContainer.innerHTML = CURATED_ROUTES.map((route) => `
      <div class="radar-route-card" data-curated-id="${escapeHtml(route.id)}" role="button" tabindex="0" aria-label="Ruta ${escapeHtml(route.title)}">
        <div class="radar-route-topline">
          <span class="radar-route-tag" style="color:${route.color}; border-color:${route.color};">[ ${escapeHtml(route.tag)} ]</span>
          <span class="radar-route-stops">[ ${route.stops} PARADAS ]</span>
        </div>
        <h4 class="radar-route-title">${escapeHtml(route.title)}</h4>
        <p class="radar-route-desc">${escapeHtml(route.subtitle)}</p>
        <button type="button" class="radar-route-btn" data-curated-id="${escapeHtml(route.id)}">
          [ INICIAR ITINERARIO ]
        </button>
      </div>
    `).join('');
  }

  // 2. Render Feed de Proximidad Dinámica
  const [refLon, refLat] = getRadarCenter();
  const works = (state.OBRAS || []).map((obra) => {
    let dist = Infinity;
    if (obra.coordenadas && obra.coordenadas.length === 2) {
      dist = calcularDistanciaMetros(refLon, refLat, obra.coordenadas[0], obra.coordenadas[1]);
    }
    return { ...obra, _dist: dist };
  });

  const inRadius = works.filter((obra) => {
    if (radarRadius === 0) return true; // Todo
    return obra._dist <= radarRadius;
  });

  inRadius.sort((a, b) => a._dist - b._dist);

  if (countSpan) {
    countSpan.textContent = `[ ${inRadius.length} DETECTADAS ]`;
  }

  if (!inRadius.length) {
    container.innerHTML = `
      <div class="radar-empty-state">
        <i data-lucide="crosshair" width="28" height="28" style="color:var(--accent, #E84E1B); margin-bottom:8px;"></i>
        <div class="font-display text-sm font-bold">[ NINGUNA OBRA A MENOS DE ${radarRadius < 1000 ? radarRadius + 'M' : (radarRadius/1000) + 'KM'} ]</div>
        <p class="text-xs text-dim">Amplía el radio de búsqueda o desplázate por el mapa.</p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  container.innerHTML = inRadius.slice(0, 40).map((obra) => {
    const catKey = obra.categoria || 'otro';
    const catColor = CATEGORY_COLORS[catKey] || '#E84E1B';
    const distText = formatearDistanciaRadar(obra._dist);
    const photo = obra.foto_url || obra.foto_miniatura || '';
    const city = obra.place || obra.ciudad || '';
    const architects = obra.arquitectos || 'AUTOR NO IDENTIFICADO';
    const year = obra.año_construccion ? ` · ${escapeHtml(obra.año_construccion)}` : '';

    return `
      <article class="radar-proximity-card" data-radar-feature-id="${escapeHtml(obra.featureId || obra.id)}" role="button" tabindex="0" aria-label="${escapeHtml(obra.nombre_obra)}">
        <div class="radar-proximity-header">
          <span class="radar-vermillon-badge">[ ${distText} ]</span>
          <span class="radar-cat-badge" style="color:${catColor}; border-color:${catColor};">[ ${escapeHtml(obra.categoria || 'ARQUITECTURA').toUpperCase()} ]</span>
        </div>
        <div class="radar-proximity-body">
          ${photo ? `
            <div class="radar-proximity-thumb">
              <img src="${escapeHtml(photo)}" alt="${escapeHtml(obra.nombre_obra)}" loading="lazy" onerror="this.parentElement.style.display='none'">
            </div>
          ` : ''}
          <div class="radar-proximity-info">
            <h4 class="radar-proximity-title">${escapeHtml(obra.nombre_obra)}</h4>
            <div class="radar-proximity-meta">${escapeHtml(architects)}${year}</div>
            ${city ? `<div class="radar-proximity-city">${escapeHtml(city).toUpperCase()}</div>` : ''}
          </div>
        </div>
      </article>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}

export function activarRutaEnMapa(routeId) {
  const route = CURATED_ROUTES.find((r) => r.id === routeId);
  if (!route || !state.map) return;

  const panel = document.getElementById('radar-panel');
  if (panel) panel.classList.remove('open');
  const backdrop = document.getElementById('panel-backdrop');
  if (backdrop) backdrop.classList.remove('active');

  let matchingWorks = [];

  if (route.architectFilter) {
    matchingWorks = state.OBRAS.filter((o) => (o.arquitectos || '').toLowerCase().includes(route.architectFilter.toLowerCase()));
  } else if (route.decadeFilter) {
    matchingWorks = state.OBRAS.filter((o) => {
      const y = Number(o.año_construccion);
      const dec = Number(route.decadeFilter);
      return y >= dec && y < dec + 10;
    });
  } else if (route.categoryFilter) {
    matchingWorks = state.OBRAS.filter((o) => String(o.categoria || '').toLowerCase() === route.categoryFilter.toLowerCase());
  } else if (route.keywords) {
    matchingWorks = state.OBRAS.filter((o) => {
      const text = `${o.nombre_obra} ${o.arquitectos} ${o.categoria}`.toLowerCase();
      return route.keywords.some((kw) => text.includes(kw));
    });
  }

  if (matchingWorks.length > 0) {
    const validCoords = matchingWorks.filter((w) => w.coordenadas && w.coordenadas.length === 2).map((w) => w.coordenadas);
    if (validCoords.length > 0) {
      if (validCoords.length === 1) {
        state.map.flyTo({ center: validCoords[0], zoom: 16 });
      } else {
        const bounds = validCoords.reduce((b, coord) => b.extend(coord), new mapboxgl.LngLatBounds(validCoords[0], validCoords[0]));
        state.map.fitBounds(bounds, { padding: 80, maxZoom: 16, duration: 1000 });
      }
    }
  }
}

export function initRadarUI() {
  const panel = document.getElementById('radar-panel');
  const btnClose = document.getElementById('btn-radar-close');
  const radiusPills = document.querySelectorAll('.radar-radius-pill');
  const detectedList = document.getElementById('radar-detected-list');
  const curatedCarousel = document.getElementById('radar-curated-carousel');

  if (btnClose && panel) {
    btnClose.addEventListener('click', () => {
      panel.classList.remove('open');
      const backdrop = document.getElementById('panel-backdrop');
      if (backdrop) backdrop.classList.remove('active');
      document.dispatchEvent(new CustomEvent('radar:panel-closed'));
    });
  }

  // Selector de radio GPS: 250m, 500m, 1km, 3km
  radiusPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      radiusPills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      radarRadius = Number(pill.dataset.radius);
      renderRadarUI();
    });
  });

  // Tap en tarjeta de proximidad -> Despliega Bottom Sheet de la obra
  if (detectedList) {
    detectedList.addEventListener('click', (e) => {
      const card = e.target.closest('.radar-proximity-card');
      if (!card) return;

      const featureId = card.dataset.radarFeatureId;
      const obra = state.OBRAS.find((o) => String(o.featureId) === String(featureId) || String(o.id) === String(featureId));

      if (obra) {
        if (panel) panel.classList.remove('open');
        const backdrop = document.getElementById('panel-backdrop');
        if (backdrop) backdrop.classList.remove('active');

        if (state.map && obra.coordenadas) {
          state.map.flyTo({
            center: obra.coordenadas,
            zoom: Math.max(state.map.getZoom(), 15),
            duration: 800
          });
        }

        abrirFicha(obra, obra.coordenadas, obra.featureId);
      }
    });
  }

  // Tap en Tarjeta de Ruta Curatorial -> Activa itinerario en mapa
  if (curatedCarousel) {
    curatedCarousel.addEventListener('click', (e) => {
      const btn = e.target.closest('.radar-route-btn') || e.target.closest('.radar-route-card');
      if (!btn) return;
      const routeId = btn.dataset.curatedId;
      if (routeId) {
        activarRutaEnMapa(routeId);
      }
    });
  }

  // Geolocalización continua en campo
  if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
      (pos) => {
        state.userLocation = [pos.coords.longitude, pos.coords.latitude];
        if (panel && panel.classList.contains('open')) {
          renderRadarUI();
        }
      },
      (err) => console.warn('Geolocalización en background:', err.message),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 6000 }
    );
  }

  document.addEventListener('radar:data-ready', () => {
    if (panel && panel.classList.contains('open')) {
      renderRadarUI();
    }
  });
}
