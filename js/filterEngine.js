/* =========================================================================
   FILTERENGINE.TS — Sistema de filtros apilables y combinables con lógica AND
   ========================================================================= */
import { state, normalizarCategoria, separarArquitectos, CATEGORY_META, escapeHtml } from './state.js';
import { actualizarFuenteMapa } from './mapData.js';
export function normalizarTexto(str) {
    if (!str)
        return '';
    return String(str)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}
/**
 * Comprueba si una obra cumple un filtro individual
 */
export function obraCumpleFiltroIndividual(obra, chip) {
    if (!obra || !chip)
        return true;
    // 1. Filtro por Categoría
    if (chip.type === 'category' && chip.value) {
        const catObra = normalizarCategoria(obra.categoria);
        const catFiltro = normalizarCategoria(chip.value);
        return catObra === catFiltro;
    }
    // 2. Filtro por Arquitecto
    if (chip.type === 'architect' && chip.value) {
        const valNorm = normalizarTexto(chip.value);
        if (!valNorm)
            return true;
        const arq1 = normalizarTexto(obra.arquitecto || '');
        const arqs = (Array.isArray(obra.arquitectos) ? obra.arquitectos : separarArquitectos(obra.arquitecto || '')).map((a) => normalizarTexto(a));
        return arq1.includes(valNorm) || arqs.some((a) => a.includes(valNorm) || valNorm.includes(a));
    }
    // 3. Filtro por Ciudad / Ubicación
    if (chip.type === 'city' && chip.value) {
        const valNorm = normalizarTexto(chip.value);
        if (!valNorm)
            return true;
        const ciudad = normalizarTexto(obra.ciudad || obra.place || '');
        const pais = normalizarTexto(obra.pais || '');
        return ciudad.includes(valNorm) || pais.includes(valNorm);
    }
    // 4. Filtro por Itinerario / Colección (Set de IDs)
    if (chip.type === 'itinerary') {
        const id = String(obra.id ?? obra.featureId ?? '');
        return Boolean(chip.workIds && chip.workIds.has(id));
    }
    // 5. Filtro de Búsqueda por texto (múltiples tokens)
    if (chip.type === 'search') {
        const query = normalizarTexto(chip.value || chip.query || '');
        if (!query)
            return true;
        // Si tiene workIds precalculados y coinciden, utilizarlos como vía rápida
        if (chip.workIds && chip.workIds.size > 0) {
            const id = String(obra.id ?? obra.featureId ?? '');
            if (chip.workIds.has(id))
                return true;
        }
        const tokens = query.split(/\s+/).filter(Boolean);
        if (tokens.length === 0)
            return true;
        const haystack = normalizarTexto([
            obra.nombre_obra,
            obra.arquitecto,
            Array.isArray(obra.arquitectos) ? obra.arquitectos.join(' ') : '',
            obra.ciudad,
            obra.place,
            obra.pais,
            obra.categoria,
            obra.año_construccion,
        ].filter(Boolean).join(' '));
        return tokens.every((token) => haystack.includes(token));
    }
    return true;
}
/**
 * Comprueba si una obra cumple TODOS los filtros activos (AND logic)
 */
export function obraCumpleFiltrosActivos(obra) {
    const chips = state.activeFilterChips;
    if (!Array.isArray(chips) || chips.length === 0) {
        return true;
    }
    return chips.every((chip) => obraCumpleFiltroIndividual(obra, chip));
}
/**
 * Obtiene el subconjunto de obras que cumplen la intersección de todos los filtros activos
 */
export function obtenerObrasFiltradas() {
    const catalogo = state.OBRAS || [];
    if (!Array.isArray(state.activeFilterChips) || state.activeFilterChips.length === 0) {
        return catalogo;
    }
    return catalogo.filter((obra) => obraCumpleFiltrosActivos(obra));
}
/**
 * Añade un chip de filtro activo y sincroniza la vista y el mapa
 */
export function addFilterChip(chip) {
    if (!chip || !chip.label)
        return;
    if (!Array.isArray(state.activeFilterChips)) {
        state.activeFilterChips = [];
    }
    const chips = state.activeFilterChips;
    // Comprobar si ya existe un chip idéntico
    const existingIdx = chips.findIndex((c) => c.id === chip.id || (c.type === chip.type && normalizarTexto(c.value) === normalizarTexto(chip.value)));
    if (existingIdx >= 0 && chips[existingIdx] !== undefined) {
        chips[existingIdx] = { ...chips[existingIdx], ...chip };
    }
    else {
        chips.push(chip);
    }
    sincronizarFiltrosConMapa();
}
/**
 * Elimina un chip por su ID
 */
export function removeFilterChip(chipId) {
    if (!Array.isArray(state.activeFilterChips))
        return;
    const chips = state.activeFilterChips;
    state.activeFilterChips = chips.filter((c) => c.id !== chipId);
    if (state.activeFilterChips.length === 0) {
        restaurarDesdeFiltros();
    }
    else {
        sincronizarFiltrosConMapa();
    }
}
/**
 * Deshace el último filtro añadido (útil para el estado vacío)
 */
export function removeLastFilterChip() {
    if (!Array.isArray(state.activeFilterChips) || state.activeFilterChips.length === 0)
        return;
    state.activeFilterChips.pop();
    if (state.activeFilterChips.length === 0) {
        restaurarDesdeFiltros();
    }
    else {
        sincronizarFiltrosConMapa();
    }
}
/**
 * Limpia todos los filtros activos
 */
export function clearFilterChips() {
    state.activeFilterChips = [];
    restaurarDesdeFiltros();
}
function restaurarDesdeFiltros() {
    state.activeFilterChips = [];
    state.activeItinerary = null;
    const badge = document.getElementById('itinerary-filter-badge');
    if (badge)
        badge.classList.add('hidden');
    const emptyBanner = document.getElementById('filter-empty-banner');
    if (emptyBanner)
        emptyBanner.classList.add('hidden');
    actualizarFuenteMapa();
    document.dispatchEvent(new CustomEvent('radar:filters-changed'));
}
/**
 * Sincroniza estado de filtros con el mapa, badge y estado vacío
 */
export function sincronizarFiltrosConMapa() {
    renderFilterChipsUI();
    actualizarFuenteMapa();
    document.dispatchEvent(new CustomEvent('radar:filters-changed'));
}
/**
 * Renderiza los chips en formato pill y el estado vacío
 */
export function renderFilterChipsUI() {
    const badgeContainer = document.getElementById('itinerary-filter-badge');
    const chipsList = document.getElementById('active-filter-chips-list');
    const emptyBanner = document.getElementById('filter-empty-banner');
    const emptyMsg = document.getElementById('filter-empty-message');
    if (!badgeContainer || !chipsList)
        return;
    const chips = state.activeFilterChips;
    if (!Array.isArray(chips) || chips.length === 0) {
        badgeContainer.classList.add('hidden');
        if (emptyBanner)
            emptyBanner.classList.add('hidden');
        return;
    }
    // Calcular obras resultantes de la intersección AND
    const filteredWorks = obtenerObrasFiltradas();
    const count = filteredWorks.length;
    // Renderizar pills apilables
    chipsList.innerHTML = chips.map((chip) => {
        const metaColor = chip.type === 'category' && chip.value ? CATEGORY_META[normalizarCategoria(chip.value)]?.color : null;
        const color = chip.color || metaColor || 'var(--accent, #E84E1B)';
        return `
      <div class="filter-pill-chip" data-chip-id="${escapeHtml(chip.id)}">
        <span class="filter-pill-dot" style="background-color: ${escapeHtml(color)};"></span>
        <span class="filter-pill-label" title="${escapeHtml(chip.label)}">${escapeHtml(chip.label)}</span>
        <span class="filter-pill-count">(${count})</span>
        <button type="button" class="filter-pill-close" data-remove-chip-id="${escapeHtml(chip.id)}" aria-label="Eliminar filtro ${escapeHtml(chip.label)}" title="Eliminar filtro">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;
    }).join('');
    badgeContainer.classList.remove('hidden');
    // Estado vacío si 0 resultados
    if (count === 0 && chips.length >= 2) {
        if (emptyBanner && emptyMsg) {
            emptyMsg.textContent = `Ninguna obra cumple estos ${chips.length} filtros a la vez`;
            emptyBanner.classList.remove('hidden');
        }
    }
    else if (count === 0 && chips.length === 1) {
        if (emptyBanner && emptyMsg) {
            emptyMsg.textContent = 'Ninguna obra coincide con el filtro activo';
            emptyBanner.classList.remove('hidden');
        }
    }
    else {
        if (emptyBanner)
            emptyBanner.classList.add('hidden');
    }
    // Encuadre geográfico suave si hay obras coincidentes
    const mapInstance = state.map;
    if (count > 0 && mapInstance && typeof mapboxgl !== 'undefined') {
        const validCoords = filteredWorks
            .map((w) => (Array.isArray(w.coordenadas) && w.coordenadas.length === 2 && Number.isFinite(w.coordenadas[0]) ? w.coordenadas : [Number(w.longitud), Number(w.latitud)]))
            .filter((coords) => coords != null && coords.length === 2 && Number.isFinite(coords[0]) && Number.isFinite(coords[1]));
        if (validCoords.length === 1 && validCoords[0]) {
            mapInstance.flyTo?.({ center: validCoords[0], zoom: 15, duration: 600 });
        }
        else if (validCoords.length > 1 && validCoords[0]) {
            try {
                const initialBounds = new mapboxgl.LngLatBounds(validCoords[0], validCoords[0]);
                const bounds = validCoords.reduce((b, c) => b.extend(c), initialBounds);
                mapInstance.fitBounds?.(bounds, { padding: 80, maxZoom: 14, duration: 800 });
            }
            catch (err) {
                console.warn('Aviso fitBounds filtros:', err);
            }
        }
    }
}
/**
 * Inicializa los listeners delegados del sistema de filtros
 */
export function initFilterEngine() {
    document.addEventListener('click', (e) => {
        const target = e.target;
        if (!target)
            return;
        // 1. Clic en la "X" individual de un chip
        const removeBtn = target.closest('[data-remove-chip-id]');
        if (removeBtn) {
            e.preventDefault();
            e.stopPropagation();
            const chipId = removeBtn.dataset.removeChipId;
            if (chipId)
                removeFilterChip(chipId);
            return;
        }
        // 2. Clic en "Deshacer último filtro" en el banner de estado vacío
        const undoBtn = target.closest('#btn-filter-undo');
        if (undoBtn) {
            e.preventDefault();
            e.stopPropagation();
            removeLastFilterChip();
            return;
        }
    });
}
//# sourceMappingURL=filterEngine.js.map