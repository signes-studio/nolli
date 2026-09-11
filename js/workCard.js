import { CATEGORY_META, escapeHtml, formatCategoria, normalizarCategoria } from './state.js';
import { getOptimizedPhotoUrl } from './imageProxy.js';

/**
 * Tarjeta canónica de obra: componente visual centralizado para radar, búsqueda,
 * explorar, mis lugares, perfil y fichas de arquitecto.
 */
export function renderObraCard(obra, {
  variant = 'list',
  className = '',
  distance = '',
  action = '',
  actionClass = '',
  featureId = obra?.featureId || obra?.id || '',
  showPhoto = true,
  tag = 'article'
} = {}) {
  const safeFeatureId = String(featureId || obra?.id || '');
  const safeId = String(obra?.id || safeFeatureId);
  const category = normalizarCategoria(obra?.categoria);
  const metaCat = CATEGORY_META[category] || CATEGORY_META.otro;
  const color = metaCat.color || '#E84E1B';

  const title = String(obra?.nombre_obra || obra?.title || 'Obra de arquitectura').trim();
  const rawArchitects = Array.isArray(obra?.arquitectos)
    ? obra.arquitectos.join(', ')
    : (obra?.arquitectos || obra?.arquitecto || '');
  const architects = String(rawArchitects).trim() || 'Arquitecto no especificado';

  const year = obra?.año_construccion || obra?.ano_construccion || obra?.year ? String(obra?.año_construccion || obra?.ano_construccion || obra?.year).trim() : '';
  const city = String(obra?.place || obra?.ciudad || obra?.city || '').trim();

  const rawImportance = Number(obra?.importancia);
  const hasImportance = Number.isFinite(rawImportance) && rawImportance >= 0 && rawImportance <= 3;
  const importanceLevel = hasImportance ? Math.min(3, Math.max(0, Math.round(rawImportance))) : 3;
  const importanceLabels = ['Hito / Obra Maestra (Nivel 0)', 'Importancia Alta (Nivel 1)', 'Importancia Media (Nivel 2)', 'Importancia Menor (Nivel 3)'];
  const importanceLabel = hasImportance ? importanceLabels[importanceLevel] : '';

  const rawPhoto = obra?.foto_miniatura || obra?.foto_url || '';
  const photoUrl = showPhoto && rawPhoto ? getOptimizedPhotoUrl(rawPhoto, { width: 320 }) : '';

  const metaList = [architects, year, city].filter(Boolean);
  const metaString = metaList.map(escapeHtml).join(' · ');

  const coords = obra?.coordenadas || (obra?.longitud != null && obra?.latitud != null ? [obra.longitud, obra.latitud] : null);
  const lng = coords?.[0] != null ? coords[0] : '';
  const lat = coords?.[1] != null ? coords[1] : '';

  const isButton = tag === 'button';
  const tagAttrs = isButton ? 'type="button"' : 'role="button" tabindex="0"';

  const formattedCat = formatCategoria(obra?.categoria);

  return `<${tag} class="obra-card obra-card--${escapeHtml(variant)} ${escapeHtml(className)}" data-feature-id="${escapeHtml(safeFeatureId)}" data-id="${escapeHtml(safeId)}" data-obra-id="${escapeHtml(safeId)}" data-radar-feature-id="${escapeHtml(safeFeatureId)}" data-search-feature-id="${escapeHtml(safeFeatureId)}" data-architect-work-id="${escapeHtml(safeFeatureId)}" data-lng="${escapeHtml(String(lng))}" data-lat="${escapeHtml(String(lat))}" ${tagAttrs} aria-label="Ver ${escapeHtml(title)}">
    ${photoUrl ? `<div class="obra-card__thumb"><img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(title)}" loading="lazy" onerror="this.parentElement.style.display='none'"></div>` : ''}
    <div class="obra-card__body">
      <div class="obra-card__topline">
        <span class="obra-card__category" style="--obra-category:${color}; color:${color};">
          ${hasImportance ? `<i class="obra-card__importance importance-${importanceLevel}" title="${escapeHtml(importanceLabel)}" aria-label="${escapeHtml(importanceLabel)}"></i>` : ''}
          ${escapeHtml(formattedCat)}
        </span>
        ${distance ? `<span class="obra-card__distance">${escapeHtml(distance)}</span>` : ''}
      </div>
      <h3 class="obra-card__title">${escapeHtml(title)}</h3>
      <p class="obra-card__meta">${metaString}</p>
    </div>
    ${action ? `<div class="obra-card__action ${escapeHtml(actionClass)}">${action}</div>` : ''}
  </${tag}>`;
}

