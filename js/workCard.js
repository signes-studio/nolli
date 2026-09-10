import { CATEGORY_META, escapeHtml, formatCategoria, normalizarCategoria } from './state.js';
import { getOptimizedPhotoUrl } from './imageProxy.js';

/** Tarjeta canónica de obra: toda lista reutiliza esta estructura. */
export function renderObraCard(obra, { variant = 'list', className = '', distance = '', action = '', actionClass = '', featureId = obra?.featureId || obra?.id || '', showPhoto = true } = {}) {
  const category = normalizarCategoria(obra?.categoria);
  const color = CATEGORY_META[category]?.color || CATEGORY_META.otro.color;
  const title = obra?.nombre_obra || 'Obra de arquitectura';
  const architects = Array.isArray(obra?.arquitectos) ? obra.arquitectos.join(', ') : (obra?.arquitectos || obra?.arquitecto || 'Arquitecto no especificado');
  const year = obra?.año_construccion ? String(obra.año_construccion) : '';
  const city = obra?.place || obra?.ciudad || '';
  const photoUrl = showPhoto ? getOptimizedPhotoUrl(obra?.foto_miniatura || obra?.foto_url || '', { width: 320 }) : '';
  const meta = [architects, year, city].filter(Boolean).map(escapeHtml).join(' · ');
  return `<article class="obra-card obra-card--${escapeHtml(variant)} ${escapeHtml(className)}" data-feature-id="${escapeHtml(featureId)}" data-lng="${obra?.coordenadas?.[0] ?? ''}" data-lat="${obra?.coordenadas?.[1] ?? ''}" role="button" tabindex="0" aria-label="Ver ${escapeHtml(title)}">
    ${photoUrl ? `<div class="obra-card__thumb"><img src="${escapeHtml(photoUrl)}" alt="" loading="lazy" onerror="this.parentElement.remove()"></div>` : ''}
    <div class="obra-card__body"><div class="obra-card__topline"><span class="obra-card__category" style="--obra-category:${color}">${escapeHtml(formatCategoria(obra?.categoria))}</span>${distance ? `<span class="obra-card__distance">${escapeHtml(distance)}</span>` : ''}</div><h3 class="obra-card__title">${escapeHtml(title)}</h3><p class="obra-card__meta">${meta}</p></div>
    ${action ? `<div class="obra-card__action ${escapeHtml(actionClass)}">${action}</div>` : ''}</article>`;
}
