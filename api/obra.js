const { categoryClass, categoryLabel } = require('./_lib/categories.js');
const { detectServerLanguage, getLangPrefix, getSSRText, getHreflangTags, getOgLocaleTags, renderSiteFooter } = require('./_lib/i18n.js');
const { slugify, slugToRegex, extractCityName, isIgnoredArchitect, ARCHITECT_ALIASES, cleanArchitectName, parseArchitectsAndInterventions } = require('./_lib/slugs.js');
const { createRateLimiter } = require('./_lib/rateLimiter.js');
const { getSupabaseConfig } = require('./_lib/supabaseEnv.js');
const { getImportanceInfo } = require('./_lib/importance.js');
const { CURATED_ROUTES, buildingMatchesRoute } = require('./_lib/embeddings.js');

const checkRateLimit = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 60 });

const SITE_URL = 'https://nollimap.app';

const CATEGORY_COLORS = {
  residencial: '#EA560D',
  dotacional_equipamiento: '#F6A600',
  industrial_logistico: '#163D62',
  religioso_funerario: '#F6B9C5',
  comercial_terciario: '#007BC3',
  espacio_publico_paisaje: '#007446',
  infraestructura_urbanismo: '#E02523',
  otro: '#492900',
};

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildingDescription(building) {
  return [building.nombre_obra, building.arquitecto, building.place, building.año_construccion]
    .filter(Boolean)
    .join(' | ');
}

function getOptimizedUrl(fotoUrl, width = 1200) {
  if (!fotoUrl) return '';
  try {
    const url = new URL(fotoUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return fotoUrl;
    return `https://wsrv.nl/?url=${encodeURIComponent(url.href)}&w=${width}&q=80&output=webp`;
  } catch {
    return fotoUrl;
  }
}

async function fetchPublicBuilding(id) {
  const { supabaseUrl, serviceRoleKey: supabaseKey } = getSupabaseConfig();

  const fields = 'id,nombre_obra,arquitecto,año_construccion,categoria,place,foto_url,foto_credito,foto_licencia,enlace_url,latitud,longitud,estado_revision,importancia';
  const params = new URLSearchParams({
    select: fields,
    id: `eq.${id}`,
    or: '(estado_revision.eq.publicada,estado_revision.is.null)',
    limit: '1',
  });
  const result = await fetch(`${supabaseUrl}/rest/v1/Buildings?${params}`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
  });
  if (!result.ok) return null;
  const buildings = await result.json().catch(() => []);
  return buildings[0] || null;
}

async function fetchDiscoverySections(building) {
  if (!building || !building.id) {
    return {
      architectData: { primaryArchitect: '', slug: '', totalWorks: 0, works: [] },
      relatedWorks: [],
    };
  }
  const { supabaseUrl, serviceRoleKey: supabaseKey } = getSupabaseConfig();
  if (!supabaseUrl || !supabaseKey) {
    return {
      architectData: { primaryArchitect: '', slug: '', totalWorks: 0, works: [] },
      relatedWorks: [],
    };
  }

  const currentId = String(building.id).trim();
  const fields = 'id,nombre_obra,arquitecto,año_construccion,categoria,place,foto_url,latitud,longitud,importancia';
  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
  };

  async function querySupabase(params, extraHeaders = {}) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/Buildings?${params.toString()}`, {
        headers: { ...headers, ...extraHeaders },
      });
      if (!res.ok) return { data: [], total: 0 };
      const data = await res.json().catch(() => []);
      let total = data.length;
      const contentRange = res.headers.get('content-range');
      if (contentRange && contentRange.includes('/')) {
        const totalPart = contentRange.split('/')[1];
        if (totalPart && totalPart !== '*') {
          total = parseInt(totalPart, 10) || total;
        }
      }
      return { data, total };
    } catch {
      return { data: [], total: 0 };
    }
  }

  // 1. SECCIÓN "MÁS OBRAS DE [ARQUITECTO]":
  const { arquitectos: cleanArchitects } = parseArchitectsAndInterventions(building.arquitecto);
  const primaryArchitect = cleanArchitects.find((name) => !isIgnoredArchitect(name)) || '';

  let architectWorks = [];
  let totalArchitectWorks = 0;
  let architectSlug = '';
  const excludedIds = new Set([currentId]);

  if (primaryArchitect) {
    const rawSlug = slugify(primaryArchitect);
    architectSlug = (ARCHITECT_ALIASES && ARCHITECT_ALIASES[rawSlug]) || rawSlug;
  }

  // 1 y 2. EJECUCIÓN PARALELA (Promise.all)
  // Disparamos concurrentemente la consulta del arquitecto y la similitud vectorial
  // para reducir el tiempo de respuesta del servidor (TTFB) a la mitad.
  const [res1, rpcRes] = await Promise.all([
    // Tarea 1: Obras del mismo arquitecto
    (async () => {
      if (!primaryArchitect) return { data: [], total: 0 };
      const archRegex = slugToRegex(primaryArchitect);

      const sp1 = new URLSearchParams();
      sp1.append('select', fields);
      sp1.append('id', `neq.${currentId}`);
      sp1.append('arquitecto', `imatch.${archRegex}`);
      sp1.append('or', '(estado_revision.eq.publicada,estado_revision.is.null)');
      sp1.append('order', 'año_construccion.desc.nullslast,id.asc');

      return querySupabase(sp1, {
        Prefer: 'count=exact',
        Range: '0-5',
      });
    })(),

    // Tarea 2: Búsqueda vectorial semántica (pgvector) acelerada por índice HNSW
    // NOTA DE RENDIMIENTO: Lee vectores ya calculados en PostgreSQL (0 llamadas externas a OpenAI/Voyage).
    fetch(`${supabaseUrl}/rest/v1/rpc/match_similar_buildings`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        target_building_id: currentId,
        match_count: 24,
        same_category_boost: 0.05,
      }),
    }).catch((err) => {
      console.warn('[Obra SSR] Error al consultar similitud semántica vectorial:', err?.message || err);
      return null;
    }),
  ]);

  // Procesar resultados de Tarea 1 (Arquitecto)
  const otherWorks = Array.isArray(res1?.data) ? res1.data : [];
  const otherTotal = res1?.total || otherWorks.length;
  totalArchitectWorks = otherTotal + 1; // Sumando la obra actual en catálogo

  if (otherWorks.length > 0) {
    architectWorks = otherWorks.slice(0, 6);
    architectWorks.forEach((w) => {
      if (w && w.id) excludedIds.add(String(w.id).trim());
    });
  }

  // 2. SECCIÓN "OBRAS RELACIONADAS" (excluye explícitamente al arquitecto actual):
  const relatedMap = new Map();

  function addRelated(items) {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (!item || !item.id) continue;
      const idStr = String(item.id).trim();
      if (excludedIds.has(idStr)) continue;
      if (primaryArchitect && item.arquitecto) {
        const { arquitectos: itemArchs } = parseArchitectsAndInterventions(item.arquitecto);
        const itemPrimary = itemArchs.find((name) => !isIgnoredArchitect(name));
        if (itemPrimary && slugify(itemPrimary) === slugify(primaryArchitect)) {
          continue;
        }
      }
      if (!relatedMap.has(idStr)) {
        relatedMap.set(idStr, item);
      }
    }
  }

  // Procesar resultados de Tarea 2 (Vectorial HNSW)
  if (rpcRes && rpcRes.ok) {
    const candidates = await rpcRes.json().catch(() => []);
    if (Array.isArray(candidates) && candidates.length > 0) {
      // Encontrar qué rutas curatoriales oficiales aplican a la obra de referencia
      const currentRoutes = CURATED_ROUTES.filter((r) => buildingMatchesRoute(building, r)).map((r) => r.id);
      const scoredCandidates = [];

      for (const item of candidates) {
        if (!item || !item.id) continue;
        const idStr = String(item.id).trim();
        if (excludedIds.has(idStr)) continue;

        // Excluir obras del mismo arquitecto principal (tienen su propia sección dedicada)
        if (primaryArchitect && item.arquitecto) {
          const { arquitectos: itemArchs } = parseArchitectsAndInterventions(item.arquitecto);
          const itemPrimary = itemArchs.find((name) => !isIgnoredArchitect(name));
          if (itemPrimary && slugify(itemPrimary) === slugify(primaryArchitect)) {
            continue;
          }
        }

        let score = Number(item.similarity) || 0;

        // Boost si comparten alguna colección curada
        if (currentRoutes.length > 0) {
          const sharesRoute = currentRoutes.some((routeId) => {
            const route = CURATED_ROUTES.find((r) => r.id === routeId);
            return route && buildingMatchesRoute(item, route);
          });
          if (sharesRoute) {
            score += 0.08;
          }
        }

        scoredCandidates.push({ item, score });
      }

      // Ordenar por afinidad global descendente
      scoredCandidates.sort((a, b) => b.score - a.score);

      for (const { item } of scoredCandidates) {
        addRelated([item]);
        if (relatedMap.size >= 6) break;
      }
    }
  }


  // 2.2 Fallback silencioso a lógica estructurada si no se alcanzaron al menos 3 resultados
  // (ej. obra de reciente creación cuyo embedding aún no se generó, o fallo en RPC)
  if (relatedMap.size < 3) {
    // Prioridad 1: Misma categoría + década (año_construccion ±10 años)
    if (building.categoria) {
      const sp2 = new URLSearchParams();
      sp2.append('select', fields);
      sp2.append('id', `neq.${currentId}`);
      sp2.append('categoria', `eq.${building.categoria}`);
      sp2.append('or', '(estado_revision.eq.publicada,estado_revision.is.null)');
      if (primaryArchitect) {
        const archRegex = slugToRegex(primaryArchitect);
        sp2.append('arquitecto', `not.imatch.${archRegex}`);
      }

      const year = parseInt(building.año_construccion, 10);
      if (!Number.isNaN(year) && year > 0) {
        sp2.append('año_construccion', `gte.${year - 10}`);
        sp2.append('año_construccion', `lte.${year + 10}`);
      }
      sp2.append('order', 'importancia.asc,id.asc');
      sp2.append('limit', '8');

      const res2 = await querySupabase(sp2);
      addRelated(res2.data);
    }

    // Si aún no llega a 3 resultados, complementar con Prioridad 2: Misma ciudad / place
    if (relatedMap.size < 3) {
      const city = extractCityName(building.place);
      if (city) {
        const sp3 = new URLSearchParams();
        sp3.append('select', fields);
        sp3.append('id', `neq.${currentId}`);
        sp3.append('place', `ilike.*${city}*`);
        sp3.append('or', '(estado_revision.eq.publicada,estado_revision.is.null)');
        if (primaryArchitect) {
          const archRegex = slugToRegex(primaryArchitect);
          sp3.append('arquitecto', `not.imatch.${archRegex}`);
        }
        sp3.append('order', 'importancia.asc,año_construccion.desc.nullslast');
        sp3.append('limit', '8');

        const res3 = await querySupabase(sp3);
        addRelated(res3.data);
      }
    }
  }

  const relatedWorks = Array.from(relatedMap.values()).slice(0, 6);

  return {
    architectData: {
      primaryArchitect,
      slug: architectSlug,
      totalWorks: totalArchitectWorks,
      works: architectWorks,
    },
    relatedWorks,
  };
}

async function fetchSimilarBuildings(building) {
  const discovery = await fetchDiscoverySections(building);
  return discovery.relatedWorks;
}

function renderObraCardHtml(b, lang = 'es') {
  const prefix = getLangPrefix(lang);
  const catSlug = b.categoria || 'otro';
  const catColor = CATEGORY_COLORS[catSlug] || CATEGORY_COLORS.otro;
  const catText = categoryLabel(b.categoria, lang);
  const optThumb = b.foto_url ? getOptimizedUrl(b.foto_url, 360) : '';

  const rawImportance = b.importancia != null ? Number(b.importancia) : NaN;
  const hasImp = Number.isFinite(rawImportance) && rawImportance >= 0 && rawImportance <= 3;
  const impLevel = hasImp ? Math.min(3, Math.max(0, Math.round(rawImportance))) : 3;
  const filledSquares = 4 - impLevel;
  const impInfo = getImportanceInfo(b.importancia, lang);
  const isHito = hasImp && impLevel === 0;

  const metaParts = [b.arquitecto, b.año_construccion, b.place].filter(Boolean).join(' · ');

  return `
    <a href="${SITE_URL}${prefix}/obra/${encodeURIComponent(b.id)}" class="obra-card obra-card--similar" data-id="${escapeHtml(b.id)}" aria-label="Ver ${escapeHtml(b.nombre_obra)}">
      ${optThumb ? `
        <div class="obra-card__thumb">
          <img src="${escapeHtml(optThumb)}" alt="${escapeHtml(b.nombre_obra)}" loading="lazy" decoding="async" onerror="this.parentElement.style.display='none'">
        </div>
      ` : ''}
      <div class="obra-card__body">
        <div class="obra-card__topline">
          <div class="obra-card__tags">
            <span class="obra-card__category" style="--obra-category:${catColor};">
              <span class="obra-card__cat-pip" style="background:${catColor};"></span>
              <span>${escapeHtml(catText)}</span>
            </span>
            ${hasImp ? `
              <span class="obra-card__importance-meter" title="${escapeHtml(impInfo.desc)}" aria-label="${escapeHtml(impInfo.desc)}" role="img">
                ${[1, 2, 3, 4].map((w) => `<span class="obra-card__importance-sq ${w <= filledSquares ? 'is-filled' : ''}"></span>`).join('')}
              </span>
            ` : ''}
            ${isHito ? '<span class="obra-card__badge-hito">HITO</span>' : ''}
          </div>
        </div>
        <h3 class="obra-card__title">${escapeHtml(b.nombre_obra)}</h3>
        ${metaParts ? `<p class="obra-card__meta">${escapeHtml(metaParts)}</p>` : ''}
      </div>
    </a>
  `;
}

function renderBuildingPage(building, lang = 'es', discoveryData = {}) {
  const prefix = getLangPrefix(lang);
  const architectData = (discoveryData && discoveryData.architectData) || { primaryArchitect: '', slug: '', totalWorks: 0, works: [] };
  const relatedWorks = Array.isArray(discoveryData) ? discoveryData : ((discoveryData && discoveryData.relatedWorks) || []);
  const canonicalUrl = `${SITE_URL}/obra/${encodeURIComponent(building.id)}`;
  const title = `${building.nombre_obra} | nolli.`;
  const description = buildingDescription(building) || getSSRText('default_work_desc', lang);
  const image = building.foto_url || `${SITE_URL}/icon.svg`;
  const categoriaSlug = building.categoria || 'otro';
  const categoriaText = categoryLabel(building.categoria, lang);
  const isIndexable = lang === 'es';

  let architectHtml = '';
  let interventionsHtml = '';
  let interventionsSubtitleHtml = '';
  const validArchitects = [];

  const { arquitectos: cleanArchitects, intervenciones } = parseArchitectsAndInterventions(building.arquitecto);

  if (cleanArchitects.length > 0) {
    const renderedParts = cleanArchitects.map((name) => {
      if (isIgnoredArchitect(name)) {
        return escapeHtml(name);
      }
      const rawSlug = slugify(name);
      const slug = (ARCHITECT_ALIASES && ARCHITECT_ALIASES[rawSlug]) || rawSlug;
      if (!slug || isIgnoredArchitect(slug)) {
        return escapeHtml(name);
      }
      validArchitects.push(name);
      return `<a class="architect-link" href="${SITE_URL}${prefix}/arquitecto/${encodeURIComponent(slug)}">${escapeHtml(name)}</a>`;
    });
    architectHtml = renderedParts.join(', ');
  }

  if (intervenciones.length > 0) {
    interventionsHtml = intervenciones.map((inv) => {
      const rawSlug = slugify(inv.arquitecto);
      const slug = (ARCHITECT_ALIASES && ARCHITECT_ALIASES[rawSlug]) || rawSlug;
      const link = (slug && !isIgnoredArchitect(slug))
        ? `<a class="architect-link" href="${SITE_URL}${prefix}/arquitecto/${encodeURIComponent(slug)}">${escapeHtml(inv.arquitecto)}</a>`
        : escapeHtml(inv.arquitecto);
      return `Intervención en ${escapeHtml(inv.año)} por ${link}`;
    }).join('<br>');

    interventionsSubtitleHtml = intervenciones.map((inv) => {
      const rawSlug = slugify(inv.arquitecto);
      const slug = (ARCHITECT_ALIASES && ARCHITECT_ALIASES[rawSlug]) || rawSlug;
      const link = (slug && !isIgnoredArchitect(slug))
        ? `<a class="architect-link" href="${SITE_URL}${prefix}/arquitecto/${encodeURIComponent(slug)}">${escapeHtml(inv.arquitecto)}</a>`
        : escapeHtml(inv.arquitecto);
      return `Intervención en ${escapeHtml(inv.año)} por ${link}`;
    }).join(' · ');
  }

  const impInfo = getImportanceInfo(building.importancia, lang);

  const detailsList = [
    cleanArchitects.length > 0 && { label: getSSRText('label_architecture', lang), value: architectHtml, isHtml: true },
    intervenciones.length > 0 && {
      label: intervenciones.length === 1 ? getSSRText('label_intervention', lang) : getSSRText('label_interventions', lang),
      value: interventionsHtml,
      isHtml: true,
    },
    building.año_construccion && { label: getSSRText('label_year', lang), value: escapeHtml(building.año_construccion) },
    {
      label: getSSRText('label_importance', lang),
      value: `<span class="badge-importance ${impInfo.badgeClass}" title="${escapeHtml(impInfo.desc)}">${impInfo.iconSvg}<span>${escapeHtml(impInfo.label)}</span></span>`,
      isHtml: true,
    },
    building.categoria && {
      label: getSSRText('label_category', lang),
      value: `<a href="${SITE_URL}${prefix}/categoria/${encodeURIComponent(categoriaSlug)}" class="badge-category category-${categoryClass(building.categoria)}"><span class="dot"></span>${escapeHtml(categoriaText)}</a>`,
      isHtml: true,
    },
    building.place && { label: getSSRText('label_place', lang), value: escapeHtml(building.place) },
    building.enlace_url && {
      label: 'Info',
      value: `<a href="${escapeHtml(building.enlace_url)}" target="_blank" rel="noopener noreferrer">Wikipedia / Web ↗</a>`,
      isHtml: true,
    },
  ].filter(Boolean);

  const detailsRowsHtml = detailsList.map((item) => `
    <li class="tech-row">
      <span class="tech-label">${escapeHtml(item.label)}</span>
      <span class="tech-value">${item.isHtml ? item.value : escapeHtml(item.value)}</span>
    </li>
  `).join('');

  const placeSchema = {
    '@context': 'https://schema.org',
    '@type': ['Place', 'LandmarksOrHistoricalBuildings'],
    name: building.nombre_obra,
    description,
    url: canonicalUrl,
    image: {
      '@type': 'ImageObject',
      url: image,
      ...(building.foto_credito ? { creditText: building.foto_credito } : {}),
      ...(building.foto_licencia ? { license: building.foto_licencia } : {}),
    },
    ...(building.latitud && building.longitud ? {
      geo: {
        '@type': 'GeoCoordinates',
        latitude: building.latitud,
        longitude: building.longitud,
      },
    } : {}),
    ...(building.arquitecto || building.año_construccion ? {
      subjectOf: {
        '@type': 'CreativeWork',
        ...(validArchitects.length > 0 ? {
          creator: validArchitects.length === 1
            ? { '@type': 'Person', name: validArchitects[0] }
            : validArchitects.map((name) => ({ '@type': 'Person', name })),
        } : (building.arquitecto && !isIgnoredArchitect(building.arquitecto) ? {
          creator: {
            '@type': 'Person',
            name: building.arquitecto,
          },
        } : {})),
        ...(building.año_construccion ? {
          dateCreated: String(building.año_construccion),
        } : {}),
      },
    } : {}),
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'nolli.',
        item: `${SITE_URL}${prefix}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: categoriaText,
        item: `${SITE_URL}${prefix}/categoria/${encodeURIComponent(categoriaSlug)}`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: building.nombre_obra,
        item: canonicalUrl,
      },
    ],
  };

  const schemaJson = JSON.stringify(placeSchema).replace(/</g, '\\u003c');
  const breadcrumbJson = JSON.stringify(breadcrumbSchema).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="${lang}">
<head>
  <base href="/">
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="${isIndexable ? 'index, follow' : 'noindex, follow'}">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="nolli.">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  ${getOgLocaleTags(lang)}
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" type="image/png" sizes="48x48" href="${SITE_URL}/icon.png">
  <link rel="icon" type="image/png" sizes="192x192" href="${SITE_URL}/icons/icon-192.png">
  <link rel="apple-touch-icon" href="${SITE_URL}/icons/icon-192.png">
  <link rel="shortcut icon" href="${SITE_URL}/favicon.ico">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preconnect" href="https://wsrv.nl" crossorigin>
  <link rel="dns-prefetch" href="https://wsrv.nl">
  <link rel="preload" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=League+Spartan:wght@700;800;900&family=Montserrat:wght@200;300;700;800&display=swap" as="style" onload="this.onload=null;this.rel='stylesheet'">
  <noscript>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=League+Spartan:wght@700;800;900&family=Montserrat:wght@200;300;700;800&display=swap">
  </noscript>
  <script type="application/ld+json">${schemaJson}</script>
  <script type="application/ld+json">${breadcrumbJson}</script>
  <style>
    :root {
      --bg: #F8F1DF;
      --bg-card: #FFFFFF;
      --bg-elevated: #F0E9D2;
      --bg-row-alt: rgba(20, 20, 17, 0.02);
      --ink: #141411;
      --ink-dim: #6B6B6B;
      --border: #D8D6CE;
      --border-subtle: rgba(20, 20, 17, 0.08);
      --border-strong: #141411;
      --brand: #EA560D;
      --accent: #EA560D;
      --accent-hover: #C44605;
      --font-display: 'League Spartan', sans-serif;
      --font-body: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      --space-1: 8px;
      --space-2: 16px;
      --space-3: 24px;
      --space-4: 32px;
      --space-6: 48px;
      --space-8: 64px;
      --radius-sm: 6px;
      --radius-md: 10px;
      --radius-lg: 16px;
      --radius-pill: 9999px;
      --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02);
      --shadow-md: 0 4px 20px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.03);
      --shadow-accent: 0 3px 12px rgba(234, 86, 13, 0.28);
      
      --cat-residential: #EA560D;
      --cat-institutional: #F6A600;
      --cat-industrial: #163D62;
      --cat-religious: #F6B9C5;
      --cat-commercial: #007BC3;
      --cat-public-space: #007446;
      --cat-infrastructure: #E02523;
      --cat-other: #492900;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #141411;
        --bg-card: #1B1B18;
        --bg-elevated: #242420;
        --bg-row-alt: rgba(255, 255, 255, 0.03);
        --ink: #F4F1EA;
        --ink-dim: #9E9E94;
        --border: rgba(255, 255, 255, 0.12);
        --border-subtle: rgba(255, 255, 255, 0.08);
        --border-strong: rgba(255, 255, 255, 0.25);
        --shadow-sm: 0 1px 4px rgba(0, 0, 0, 0.3);
        --shadow-md: 0 4px 20px rgba(0, 0, 0, 0.4);
      }
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: var(--font-body);
      font-size: 15px;
      line-height: 1.55;
      -webkit-font-smoothing: antialiased;
    }
    .page {
      width: min(100% - 32px, 1040px);
      margin: 0 auto;
      padding: var(--space-3) 0 var(--space-8);
    }
    .site-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-2) 0;
      border-bottom: 1px solid var(--border);
      margin-bottom: var(--space-3);
    }
    .brand-group {
      display: flex;
      align-items: baseline;
      gap: 12px;
    }
    .brand-logo {
      color: var(--ink);
      font-family: var(--font-display);
      font-size: 26px;
      font-weight: 900;
      letter-spacing: -0.03em;
      text-decoration: none;
      line-height: 1;
    }
    .brand-logo .dot {
      color: var(--brand);
    }
    .site-tagline {
      color: var(--ink-dim);
      font-size: 12px;
      font-weight: 500;
    }
    .header-nav-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-card);
      color: var(--ink);
      font-family: var(--font-body);
      font-size: 12px;
      font-weight: 600;
      text-decoration: none;
      box-shadow: var(--shadow-sm);
      transition: all 0.15s ease;
    }
    .header-nav-btn:hover {
      border-color: var(--brand);
      color: var(--brand);
      transform: translateY(-1px);
    }
    .breadcrumb-nav {
      margin-bottom: var(--space-4);
    }
    .breadcrumb-list {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      list-style: none;
      margin: 0;
      padding: 0;
      font-size: 12px;
      font-weight: 500;
      color: var(--ink-dim);
    }
    .breadcrumb-item a {
      color: var(--ink-dim);
      text-decoration: none;
      transition: color 0.12s;
    }
    .breadcrumb-item a:hover {
      color: var(--brand);
    }
    .breadcrumb-sep {
      color: var(--ink-dim);
      opacity: 0.5;
    }
    .breadcrumb-item.active {
      color: var(--ink);
      font-weight: 600;
    }
    .work-card {
      background: var(--bg-card);
      border-radius: var(--radius-lg);
      border: 1px solid var(--border);
      box-shadow: var(--shadow-md);
      padding: var(--space-4);
      margin-bottom: var(--space-6);
    }
    .work-header {
      margin-bottom: var(--space-4);
    }
    .badges-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }
    .badges-row .badge-category {
      margin-bottom: 0;
    }
    .badge-category {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: var(--radius-pill);
      background: var(--bg-elevated);
      border: 1px solid var(--border-subtle);
      font-family: var(--font-display);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--ink);
      text-decoration: none;
      margin-bottom: 12px;
      transition: transform 0.12s ease;
    }
    .badge-category:hover {
      transform: translateY(-1px);
    }
    .badge-importance {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: var(--radius-pill);
      background: var(--bg-elevated);
      border: 1px solid var(--border-subtle);
      font-family: var(--font-display);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--ink);
      line-height: 1.2;
    }
    .badge-importance.imp-0 {
      background: rgba(234, 86, 13, 0.08);
      border-color: rgba(234, 86, 13, 0.3);
      color: var(--brand);
    }
    .badge-importance .imp-icon-svg {
      flex-shrink: 0;
      display: inline-block;
      vertical-align: middle;
    }
    .badge-category .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--cat-other);
      display: inline-block;
    }
    .category-residential .dot { background: var(--cat-residential); }
    .category-institutional .dot { background: var(--cat-institutional); }
    .category-industrial .dot { background: var(--cat-industrial); }
    .category-religious .dot { background: var(--cat-religious); }
    .category-commercial .dot { background: var(--cat-commercial); }
    .category-public-space .dot { background: var(--cat-public-space); }
    .category-infrastructure .dot { background: var(--cat-infrastructure); }
    .work-title {
      margin: 0 0 8px 0;
      font-family: var(--font-display);
      font-size: clamp(30px, 5vw, 50px);
      font-weight: 900;
      letter-spacing: -0.025em;
      line-height: 1.08;
      color: var(--ink);
    }
    .work-subtitle {
      margin: 0;
      font-size: 16px;
      font-weight: 500;
      color: var(--ink-dim);
    }
    .work-subtitle a {
      color: var(--brand);
      text-decoration: none;
      font-weight: 600;
    }
    .work-subtitle a:hover {
      text-decoration: underline;
    }
    .work-intervention-subtitle {
      margin: 4px 0 0 0;
      font-size: 13.5px;
      font-weight: 500;
      color: var(--ink-dim);
    }
    .work-intervention-subtitle a {
      color: var(--brand);
      text-decoration: none;
      font-weight: 600;
    }
    .work-intervention-subtitle a:hover {
      text-decoration: underline;
    }
    .work-layout {
      display: grid;
      grid-template-columns: minmax(0, 1.35fr) minmax(280px, 1fr);
      gap: var(--space-4);
      align-items: start;
    }
    .image-wrapper {
      position: relative;
      border-radius: var(--radius-md);
      overflow: hidden;
      border: 1px solid var(--border);
      background: var(--bg-elevated);
      box-shadow: var(--shadow-sm);
    }
    .work-image {
      display: block;
      width: 100%;
      min-height: 280px;
      max-height: 480px;
      object-fit: cover;
    }
    .image-caption {
      padding: 8px 12px;
      font-size: 11px;
      color: var(--ink-dim);
      background: var(--bg-elevated);
      border-top: 1px solid var(--border-subtle);
    }
    .work-actions {
      margin-top: var(--space-3);
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .btn-primary-map {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 22px;
      border-radius: var(--radius-sm);
      background: var(--accent);
      color: #FFFFFF;
      font-family: var(--font-display);
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      text-decoration: none;
      box-shadow: var(--shadow-accent);
      transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
    }
    .btn-primary-map:hover {
      background: var(--accent-hover);
      transform: translateY(-2px);
      box-shadow: 0 5px 16px rgba(234, 86, 13, 0.4);
    }
    .tech-card {
      background: var(--bg-elevated);
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
      overflow: hidden;
    }
    .tech-card-header {
      padding: 12px 16px;
      background: var(--bg-row-alt);
      border-bottom: 1px solid var(--border);
      font-family: var(--font-display);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--ink-dim);
    }
    .tech-list {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .tech-row {
      display: grid;
      grid-template-columns: 110px 1fr;
      padding: 11px 16px;
      border-bottom: 1px solid var(--border-subtle);
      font-size: 13px;
      align-items: baseline;
    }
    .tech-row:last-child {
      border-bottom: none;
    }
    .tech-label {
      font-family: var(--font-display);
      font-size: 10.5px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--ink-dim);
    }
    .tech-value {
      font-weight: 500;
      color: var(--ink);
      overflow-wrap: anywhere;
    }
    .tech-value a {
      color: var(--brand);
      text-decoration: none;
      font-weight: 600;
    }
    .tech-value a:hover {
      text-decoration: underline;
    }
    /* Tarjeta de Obra Unificada (.obra-card) */
    .obra-card {
      display: flex;
      gap: 12px;
      align-items: stretch;
      width: 100%;
      padding: 10px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      box-shadow: var(--shadow-sm);
      border-radius: var(--radius-sm);
      color: var(--ink);
      text-align: left;
      cursor: pointer;
      box-sizing: border-box;
      text-decoration: none;
      position: relative;
      transition: border-color 0.12s ease, background-color 0.12s ease, transform 0.1s ease, box-shadow 0.12s ease;
    }
    .obra-card:hover,
    .obra-card:focus-visible {
      border-color: var(--brand);
      box-shadow: var(--shadow-md);
      transform: translateY(-2px);
      outline: none;
    }
    .obra-card:active {
      transform: scale(0.99);
    }
    .obra-card__thumb {
      width: 76px;
      min-width: 76px;
      height: 76px;
      overflow: hidden;
      background: var(--bg-elevated);
      border-radius: 4px;
      flex-shrink: 0;
    }
    .obra-card__thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .obra-card__body {
      min-width: 0;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 3px;
      justify-content: center;
    }
    .obra-card__topline {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      align-items: center;
    }
    .obra-card__tags {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      flex-wrap: nowrap;
    }
    .obra-card__category {
      color: var(--ink);
      font-family: var(--font-body);
      font-size: 10.5px;
      font-weight: 600;
      line-height: 1;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      flex-shrink: 0;
    }
    .obra-card__cat-pip {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .obra-card__importance-meter {
      display: inline-flex;
      align-items: center;
      gap: 2.5px;
      flex-shrink: 0;
    }
    .obra-card__importance-sq {
      display: inline-block;
      width: 5px;
      height: 5px;
      box-sizing: border-box;
      border: 1px solid var(--border);
      background: transparent;
      border-radius: 1px;
    }
    .obra-card__importance-sq.is-filled {
      background: var(--ink);
    }
    .obra-card__badge-hito {
      font-family: var(--font-body);
      font-size: 8.5px;
      font-weight: 800;
      letter-spacing: 0.04em;
      background: var(--brand);
      color: #FFFFFF;
      padding: 1.5px 5px;
      border-radius: 3px;
      line-height: 1;
    }
    .obra-card__title {
      margin: 0;
      font-family: var(--font-body);
      font-size: 14px;
      font-weight: 700;
      line-height: 1.25;
      color: var(--ink);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      letter-spacing: -0.01em;
    }
    .obra-card__meta {
      margin: 0;
      color: var(--ink-dim);
      font-family: var(--font-body);
      font-size: 11.5px;
      font-weight: 400;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    /* Sección de Proyectos Similares */
    .similar-works-section {
      margin-top: var(--space-6);
      padding-top: var(--space-4);
      border-top: 1px solid var(--border);
    }
    .similar-works-header {
      margin-bottom: var(--space-3);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .similar-works-title {
      margin: 0;
      font-family: var(--font-display);
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--ink);
      text-transform: uppercase;
    }
    .similar-works-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 12px;
    }
    .see-all-link {
      font-family: var(--font-display);
      font-size: 11.5px;
      font-weight: 800;
      letter-spacing: 0.04em;
      color: var(--brand);
      text-decoration: none;
      text-transform: uppercase;
      transition: color 0.12s ease, transform 0.12s ease;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    .see-all-link:hover {
      color: var(--accent-hover);
      transform: translateX(2px);
    }
    .session-trail {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      font-size: 11.5px;
      font-family: var(--font-body);
      color: var(--ink-dim);
      margin-bottom: var(--space-2);
      padding: 7px 12px;
      background: var(--bg-row-alt);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
    }
    .session-trail-label {
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-size: 10px;
      color: var(--ink-dim);
    }
    .session-trail-link {
      color: var(--ink);
      text-decoration: none;
      font-weight: 500;
      transition: color 0.12s ease;
    }
    .session-trail-link:hover {
      color: var(--brand);
      text-decoration: underline;
    }
    .session-trail-sep {
      color: var(--border);
      font-size: 10px;
      user-select: none;
    }
    .work-card.is-soft-navigating {
      opacity: 0.45;
      pointer-events: none;
      transition: opacity 0.15s ease;
    }
    /* Botones de Acción (Hero Buttons) */
    .sheet-hero-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 10px 16px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      box-shadow: var(--shadow-sm);
      background: var(--bg-card);
      color: var(--ink);
      font-family: var(--font-body);
      font-size: 12.5px;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.12s ease;
    }
    .sheet-hero-btn:hover {
      border-color: var(--brand);
      color: var(--brand);
      transform: translateY(-1px);
    }
    .sheet-hero-btn svg {
      flex-shrink: 0;
    }
    .sheet-hero-btn.active.visited {
      background: rgba(13, 104, 47, 0.1) !important;
      color: #0D682F !important;
      border-color: #0D682F !important;
    }
    .sheet-hero-btn.active.saved {
      background: var(--ink) !important;
      color: var(--bg) !important;
      border-color: var(--ink) !important;
    }
    .sheet-hero-btn.active.saved svg {
      fill: currentColor;
    }
    .sheet-fav-btn.active.favorite {
      background: rgba(234, 86, 13, 0.1) !important;
      color: var(--brand) !important;
      border-color: var(--brand) !important;
    }
    .sheet-fav-btn.active.favorite svg {
      fill: currentColor;
    }
    .btn-admin-action {
      border-color: rgba(234, 86, 13, 0.4);
      color: var(--brand);
      background: rgba(234, 86, 13, 0.06);
    }
    .btn-admin-action:hover {
      background: var(--brand);
      color: #FFFFFF;
    }

    /* Modales y Capas de Superposición */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transition: opacity 0.2s ease, visibility 0.2s ease;
      padding: 16px;
    }
    .modal-overlay.open {
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
    }
    .modal-box {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      width: 100%;
      max-width: 460px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .modal-head {
      padding: 14px 18px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-family: var(--font-display);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--ink);
    }
    .modal-body {
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .sheet-close-button {
      background: none;
      border: none;
      color: var(--ink-dim);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.12s;
    }
    .sheet-close-button:hover {
      color: var(--brand);
    }
    .personal-organizer-project {
      margin: 0;
      font-family: var(--font-display);
      font-size: 15px;
      font-weight: 800;
      color: var(--ink);
    }
    .personal-organizer-help {
      font-size: 12px;
      color: var(--ink-dim);
      line-height: 1.4;
    }
    .personal-organizer-header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .personal-organizer-count {
      font-size: 11px;
      font-weight: 700;
      color: var(--ink-dim);
      text-transform: uppercase;
    }
    .btn-new-list {
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      padding: 4px 10px;
      border-radius: var(--radius-sm);
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      color: var(--ink);
    }
    .btn-new-list:hover {
      border-color: var(--brand);
      color: var(--brand);
    }
    .personal-organizer-options {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 240px;
      overflow-y: auto;
      padding: 2px;
    }
    .personal-organizer-option {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      background: var(--bg-elevated);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      font-size: 13px;
      color: var(--ink);
      cursor: pointer;
    }
    .personal-organizer-option:hover {
      border-color: var(--border);
    }
    .personal-organizer-option input[type="checkbox"] {
      width: 16px;
      height: 16px;
      accent-color: var(--brand);
      cursor: pointer;
    }
    .personal-create-row {
      display: flex;
      gap: 8px;
    }
    .personal-create-row.hidden {
      display: none;
    }
    .tech-input {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-elevated);
      color: var(--ink);
      font-family: var(--font-body);
      font-size: 13px;
    }
    .tech-input:focus {
      outline: none;
      border-color: var(--brand);
    }
    .btn-accent {
      background: var(--brand);
      color: #FFFFFF;
      border: none;
      padding: 10px 16px;
      border-radius: var(--radius-sm);
      font-family: var(--font-display);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      cursor: pointer;
      transition: transform 0.12s, box-shadow 0.12s;
    }
    .btn-accent:hover {
      transform: translateY(-1px);
      box-shadow: var(--shadow-sm);
    }

    /* Modal Compartir Bottom Sheet */
    #modal-share.modal-overlay {
      align-items: flex-end;
      padding: 0;
    }
    .share-bottom-sheet {
      width: 100%;
      max-width: 500px;
      margin: 0 auto;
      background: var(--bg-card);
      border-top-left-radius: 16px;
      border-top-right-radius: 16px;
      border: 1px solid var(--border);
      box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.25);
      padding: 20px 20px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      transform: translateY(100%);
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
    #modal-share.open .share-bottom-sheet {
      transform: translateY(0);
    }
    .share-sheet-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .share-sheet-title {
      margin: 0;
      font-family: var(--font-display);
      font-size: 16px;
      font-weight: 800;
      color: var(--ink);
      letter-spacing: -0.01em;
    }
    .share-sheet-subtitle {
      margin: 4px 0 0 0;
      font-size: 12.5px;
      color: var(--ink-dim);
    }
    .share-channels-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }
    .share-channel-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 14px 8px;
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      color: var(--ink);
      font-family: var(--font-display);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      cursor: pointer;
      transition: all 0.12s ease;
    }
    .share-channel-btn:hover {
      border-color: var(--brand);
      color: var(--brand);
      transform: translateY(-1px);
    }
    .share-primary-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 12px;
      background: var(--ink);
      color: var(--bg);
      border: none;
      border-radius: var(--radius-sm);
      font-family: var(--font-display);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      cursor: pointer;
      transition: all 0.12s ease;
    }
    .share-primary-btn:hover {
      background: var(--brand);
      color: #FFFFFF;
    }
    .share-primary-btn.copied {
      background: #0D682F !important;
      color: #FFFFFF !important;
    }

    /* Toast Container */
    .neo-toast-container {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 100000;
      pointer-events: none;
      max-width: 90vw;
    }
    .neo-toast {
      pointer-events: auto;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: var(--ink);
      color: var(--bg);
      padding: 10px 18px;
      border-radius: var(--radius-pill);
      font-family: var(--font-body);
      font-size: 12.5px;
      font-weight: 600;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
      animation: neoToastIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      transition: opacity 0.2s ease, transform 0.2s ease;
    }
    .neo-toast.fade-out {
      opacity: 0;
      transform: translateY(8px);
    }
    @keyframes neoToastIn {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .site-footer {
      margin-top: var(--space-8);
      padding: var(--space-4) 0;
      border-top: 1px solid var(--border);
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      font-size: 13px;
      color: var(--ink-dim);
    }
    .footer-brand {
      display: flex;
      align-items: center;
    }
    .footer-by {
      font-size: 12.5px;
      color: var(--ink-dim);
      display: inline-flex;
      align-items: baseline;
      gap: 5px;
      flex-wrap: wrap;
    }
    .brand-signes {
      font-family: 'Montserrat', sans-serif;
      text-decoration: none;
      color: var(--ink);
      display: inline-flex;
      align-items: baseline;
      letter-spacing: 0.04em;
      transition: color 0.15s ease;
    }
    .brand-signes:hover {
      color: var(--brand);
    }
    .brand-signes-bold {
      font-weight: 800;
    }
    .brand-signes-thin {
      font-weight: 200;
    }
    .brand-nolli {
      font-family: var(--font-display);
      font-weight: 800;
      font-size: 1.22em;
      line-height: 1;
      letter-spacing: -0.02em;
      text-transform: lowercase;
      display: inline-block;
      vertical-align: baseline;
    }
    .footer-links {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
    }
    .footer-links a {
      color: var(--ink-dim);
      text-decoration: none;
      font-weight: 500;
      transition: color 0.12s;
    }
    .footer-links a:hover {
      color: var(--brand);
    }
    @media (max-width: 768px) {
      .work-card { padding: 20px 16px; border-radius: var(--radius-md); }
      .work-layout { grid-template-columns: 1fr; gap: var(--space-3); }
      .work-title { font-size: 32px; }
      .work-image { min-height: 220px; }
      .tech-row { grid-template-columns: 95px 1fr; padding: 10px 14px; font-size: 12.5px; }
      .site-tagline { display: none; }
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="site-header">
      <div class="brand-group">
        <a href="${SITE_URL}${prefix}/" class="brand-logo">nolli<span class="dot">.</span></a>
        <span class="site-tagline">${escapeHtml(getSSRText('tagline', lang))}</span>
      </div>
      <a href="${SITE_URL}${prefix}/" class="header-nav-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
        ${escapeHtml(getSSRText('go_to_map', lang))}
      </a>
    </header>

    <nav aria-label="breadcrumb" class="breadcrumb-nav">
      <ol class="breadcrumb-list">
        <li class="breadcrumb-item"><a href="${SITE_URL}${prefix}/"><span class="brand-nolli">nolli.</span></a></li>
        <li class="breadcrumb-sep" aria-hidden="true">/</li>
        <li class="breadcrumb-item"><a href="${SITE_URL}${prefix}/categoria/${encodeURIComponent(categoriaSlug)}">${escapeHtml(categoriaText)}</a></li>
        <li class="breadcrumb-sep" aria-hidden="true">/</li>
        <li class="breadcrumb-item active" aria-current="page">${escapeHtml(building.nombre_obra)}</li>
      </ol>
    </nav>

    <div id="session-trail" class="session-trail" style="display: none;" aria-label="Historial de navegación"></div>

    <article class="work-card">
      <div class="work-header">
        <div class="badges-row">
          <a href="${SITE_URL}${prefix}/categoria/${encodeURIComponent(categoriaSlug)}" class="badge-category category-${categoryClass(building.categoria)}">
            <span class="dot"></span>
            ${escapeHtml(categoriaText)}
          </a>
          <span class="badge-importance ${impInfo.badgeClass}" title="${escapeHtml(impInfo.desc)}">
            ${impInfo.iconSvg}
            <span>${escapeHtml(impInfo.label)}</span>
          </span>
        </div>
        <h1 class="work-title">${escapeHtml(building.nombre_obra)}</h1>
        ${architectHtml ? `<p class="work-subtitle">${architectHtml}</p>` : ''}
        ${interventionsSubtitleHtml ? `<p class="work-intervention-subtitle">${interventionsSubtitleHtml}</p>` : ''}
      </div>

      <div class="work-layout">
        <div>
          ${building.foto_url ? `
            <div class="image-wrapper">
              <img class="work-image" src="${escapeHtml(getOptimizedUrl(building.foto_url, 1200))}" alt="${escapeHtml(building.nombre_obra)}" loading="eager" decoding="async" fetchpriority="high">
              ${(building.foto_credito || building.foto_licencia) ? `
                <div class="image-caption">
                  ${building.foto_credito ? `<span>Foto: ${escapeHtml(building.foto_credito)}</span>` : ''}
                  ${building.foto_licencia ? `<span>(${escapeHtml(building.foto_licencia)})</span>` : ''}
                </div>
              ` : ''}
            </div>
          ` : ''}

          <div class="work-actions">
            <a class="btn-primary-map" href="${SITE_URL}${prefix}/?obra=${encodeURIComponent(building.id)}">
              <span>${escapeHtml(getSSRText('view_on_map', lang))}</span>
              <span aria-hidden="true">&#8599;</span>
            </a>

            ${(building.latitud != null && building.longitud != null) ? `
              <a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(building.latitud)},${encodeURIComponent(building.longitud)}" target="_blank" rel="noopener noreferrer" class="sheet-hero-btn" title="${escapeHtml(getSSRText('action_directions', lang))}">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="18" x2="18" y2="6"></line><polyline points="9 6 18 6 18 15"></polyline></svg>
                <span>${escapeHtml(getSSRText('action_directions', lang))}</span>
              </a>
            ` : ''}

            <button type="button" class="sheet-hero-btn" data-status="visited" aria-label="${escapeHtml(getSSRText('action_visit', lang))}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"></circle><polyline points="8 12 11 15 16 9"></polyline></svg>
              <span>${escapeHtml(getSSRText('action_visit', lang))}</span>
            </button>

            <button type="button" class="sheet-hero-btn" data-save-collection aria-label="${escapeHtml(getSSRText('action_save', lang))}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="3.5" width="13.5" height="13.5"></rect><path d="M3.5 7.5v13h13"></path><circle cx="13.5" cy="10" r="1.5" fill="currentColor"></circle></svg>
              <span>${escapeHtml(getSSRText('action_save', lang))}</span>
            </button>

            <button type="button" class="sheet-hero-btn sheet-fav-btn" data-status="favorite" title="${escapeHtml(getSSRText('action_favorite', lang))}" aria-label="${escapeHtml(getSSRText('action_favorite', lang))}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
              <span>${escapeHtml(getSSRText('action_favorite', lang))}</span>
            </button>

            <button type="button" class="sheet-hero-btn" data-share-action="open" aria-label="${escapeHtml(getSSRText('action_share', lang))}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="2.5"></circle><circle cx="6" cy="12" r="2.5"></circle><circle cx="18" cy="19" r="2.5"></circle><line x1="8.5" y1="10.8" x2="15.5" y2="6.7"></line><line x1="8.5" y1="13.2" x2="15.5" y2="17.3"></line></svg>
              <span>${escapeHtml(getSSRText('action_share', lang))}</span>
            </button>

            <button type="button" class="sheet-hero-btn btn-admin-action" data-edit-building style="display: none;" aria-label="${escapeHtml(getSSRText('action_edit', lang))}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              <span>${escapeHtml(getSSRText('action_edit', lang))}</span>
            </button>
          </div>
        </div>

        ${detailsRowsHtml ? `
          <div class="tech-card">
            <div class="tech-card-header">Ficha Técnica</div>
            <ul class="tech-list">
              ${detailsRowsHtml}
            </ul>
          </div>
        ` : ''}
      </div>

      ${(architectData && architectData.works && architectData.works.length > 0) ? `
        <section class="similar-works-section architect-works-section" aria-labelledby="architect-works-title">
          <div class="similar-works-header">
            <h2 id="architect-works-title" class="similar-works-title">
              ${escapeHtml(getSSRText('more_works_by_architect', lang, { nombre: architectData.primaryArchitect }))}
            </h2>
            ${architectData.totalWorks > 6 ? `
              <a href="${SITE_URL}${prefix}/arquitecto/${encodeURIComponent(architectData.slug)}" class="see-all-link">
                ${escapeHtml(getSSRText('view_all_architect_works', lang, { count: architectData.totalWorks, nombre: architectData.primaryArchitect }))}
              </a>
            ` : ''}
          </div>
          <div class="similar-works-grid">
            ${architectData.works.map((w) => renderObraCardHtml(w, lang)).join('')}
          </div>
        </section>
      ` : ''}

      ${(relatedWorks && relatedWorks.length > 0) ? `
        <section class="similar-works-section related-works-section" aria-labelledby="related-works-title">
          <div class="similar-works-header">
            <h2 id="related-works-title" class="similar-works-title">${escapeHtml(getSSRText('related_works', lang))}</h2>
          </div>
          <div class="similar-works-grid">
            ${relatedWorks.map((sim) => renderObraCardHtml(sim, lang)).join('')}
          </div>
        </section>
      ` : ''}
    </article>

    ${renderSiteFooter(lang, SITE_URL)}
  </main>

  <!-- Modal: Organizar en Listas / Colecciones -->
  <div id="modal-personal-organizer" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="personal-organizer-title">
    <div class="modal-box personal-organizer-box">
      <div class="modal-head">
        <span id="personal-organizer-title">Organizar Obra</span>
        <button type="button" id="btn-personal-organizer-close" class="sheet-close-button" aria-label="Cerrar organizador">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="5" x2="19" y2="19"></line><line x1="19" y1="5" x2="5" y2="19"></line></svg>
        </button>
      </div>
      <div class="modal-body personal-organizer-body">
        <p id="personal-organizer-project" class="personal-organizer-project"></p>
        <div id="personal-organizer-help" class="personal-organizer-help">Selecciona las listas en las que deseas guardar este proyecto:</div>
        
        <div id="organizer-new-list-row" class="personal-organizer-header-row">
          <span id="personal-organizer-count" class="personal-organizer-count">Tus Listas</span>
          <button type="button" id="btn-organizer-new-list" class="btn-new-list">
            + NUEVA LISTA
          </button>
        </div>

        <div id="personal-organizer-options" class="personal-organizer-options"></div>
        
        <div id="personal-create-tag-row" class="personal-create-row hidden">
          <input id="personal-new-name" class="tech-input" type="text" placeholder="Nombre de la nueva lista...">
          <button type="button" id="btn-personal-create" class="btn-accent">CREAR</button>
        </div>

        <button type="button" id="btn-personal-organizer-save" class="btn-accent">GUARDAR SELECCIÓN</button>
      </div>
    </div>
  </div>

  <!-- Modal: Compartir Obra -->
  <div id="modal-share" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-share-title">
    <div class="share-bottom-sheet">
      <div class="share-sheet-head">
        <div>
          <h3 id="modal-share-title" class="share-sheet-title">COMPARTIR OBRA</h3>
          <p id="share-project-subtitle" class="share-sheet-subtitle">${escapeHtml(building.nombre_obra)}</p>
        </div>
        <button type="button" id="btn-share-close" class="sheet-close-button" aria-label="Cerrar compartir">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="5" x2="19" y2="19"></line><line x1="19" y1="5" x2="5" y2="19"></line></svg>
        </button>
      </div>

      <div class="share-channels-grid">
        <button type="button" class="share-channel-btn" data-share-choice="whatsapp" aria-label="Compartir en WhatsApp">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
          <span>WHATSAPP</span>
        </button>
        <button type="button" class="share-channel-btn" data-share-choice="google" aria-label="Abrir en Google Maps">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"></circle><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z"></path></svg>
          <span>MAPS</span>
        </button>
        <button type="button" class="share-channel-btn" data-share-choice="native" aria-label="Compartir en otras aplicaciones">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="2.5"></circle><circle cx="6" cy="12" r="2.5"></circle><circle cx="18" cy="19" r="2.5"></circle><line x1="8.5" y1="10.8" x2="15.5" y2="6.7"></line><line x1="8.5" y1="13.2" x2="15.5" y2="17.3"></line></svg>
          <span>MÁS</span>
        </button>
      </div>

      <button type="button" id="btn-share-copy" class="share-primary-btn" data-share-choice="copy" aria-label="Copiar enlace de la obra">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12"></rect><path d="M5 15H3.5a1.5 1.5 0 0 1-1.5-1.5v-10A1.5 1.5 0 0 1 3.5 2h10A1.5 1.5 0 0 1 15 3.5V5"></path></svg>
        <span id="share-copy-text">COPIAR ENLACE</span>
      </button>
    </div>
  </div>

  <div id="neo-toast-container" class="neo-toast-container" aria-live="polite"></div>

  <script id="building-data" type="application/json">
    ${JSON.stringify({
      id: String(building.id),
      nombre_obra: String(building.nombre_obra || ''),
      arquitecto: String(building.arquitecto || ''),
      año_construccion: String(building.año_construccion || ''),
      categoria: String(building.categoria || ''),
      place: String(building.place || ''),
      latitud: building.latitud != null ? Number(building.latitud) : null,
      longitud: building.longitud != null ? Number(building.longitud) : null,
      foto_url: String(building.foto_url || ''),
      foto_credito: String(building.foto_credito || ''),
      enlace_url: String(building.enlace_url || ''),
      importancia: building.importancia != null ? Number(building.importancia) : 1,
    }).replace(/</g, '\\u003c')}
  </script>
  <script type="module" src="/js/standaloneWorkSheet.js"></script>
</body>
</html>`;
}

function renderNotFoundPage(lang = 'es') {
  const prefix = getLangPrefix(lang);
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <base href="/">
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(getSSRText('not_found_page_title', lang))}</title>
  <meta name="robots" content="noindex, follow">
  <link rel="icon" type="image/png" sizes="48x48" href="${SITE_URL}/icon.png">
  <link rel="icon" type="image/png" sizes="192x192" href="${SITE_URL}/icons/icon-192.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=League+Spartan:wght@700;800;900&display=swap" as="style" onload="this.onload=null;this.rel='stylesheet'">
  <noscript>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=League+Spartan:wght@700;800;900&display=swap">
  </noscript>
  <style>
    :root {
      --bg: #F8F1DF;
      --bg-card: #FFFFFF;
      --bg-elevated: #F0E9D2;
      --ink: #141411;
      --ink-dim: #6B6B6B;
      --border: #D8D6CE;
      --brand: #EA560D;
      --font-display: 'League Spartan', sans-serif;
      --font-body: 'Inter', sans-serif;
      --radius-sm: 6px;
      --radius-md: 12px;
      --shadow-md: 0 4px 20px rgba(0, 0, 0, 0.06);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #141411;
        --bg-card: #1B1B18;
        --bg-elevated: #242420;
        --ink: #F4F1EA;
        --ink-dim: #9E9E94;
        --border: rgba(255, 255, 255, 0.12);
        --shadow-md: 0 4px 20px rgba(0, 0, 0, 0.4);
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: var(--font-body);
      font-size: 15px;
      line-height: 1.55;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .page {
      width: min(100% - 32px, 720px);
      margin: 0 auto;
      padding: 32px 0 64px;
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .site-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }
    .brand-logo {
      color: var(--ink);
      font-family: var(--font-display);
      font-size: 26px;
      font-weight: 900;
      letter-spacing: -0.03em;
      text-decoration: none;
    }
    .brand-logo .dot { color: var(--brand); }
    .not-found-card {
      margin-top: 48px;
      border: 1px solid var(--border);
      background: var(--bg-card);
      padding: 36px 32px;
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-md);
    }
    .not-found-tag {
      display: inline-block;
      font-family: var(--font-display);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--brand);
      margin-bottom: 12px;
    }
    .not-found-title {
      margin: 0 0 16px;
      font-family: var(--font-display);
      font-size: clamp(32px, 5.5vw, 48px);
      font-weight: 900;
      letter-spacing: -0.02em;
      line-height: 1.1;
      color: var(--ink);
    }
    .not-found-text {
      margin: 0 0 28px;
      color: var(--ink-dim);
      font-size: 15px;
      max-width: 52ch;
      line-height: 1.6;
    }
    .map-link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 22px;
      border-radius: var(--radius-sm);
      background: var(--brand);
      color: #FFFFFF;
      font-family: var(--font-display);
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-decoration: none;
      text-transform: uppercase;
      box-shadow: 0 3px 12px rgba(234, 86, 13, 0.28);
      transition: transform 0.12s ease, box-shadow 0.12s ease;
    }
    .map-link:hover {
      transform: translateY(-2px);
      box-shadow: 0 5px 16px rgba(234, 86, 13, 0.4);
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="site-header">
      <a href="${SITE_URL}${prefix}/" class="brand-logo">nolli<span class="dot">.</span></a>
      <span style="font-size:12px;color:var(--ink-dim);">${escapeHtml(getSSRText('tagline', lang))}</span>
    </header>
    <div class="not-found-card">
      <span class="not-found-tag">${escapeHtml(getSSRText('not_found_tag', lang))}</span>
      <h1 class="not-found-title">${escapeHtml(getSSRText('not_found_title', lang))}</h1>
      <p class="not-found-text">${escapeHtml(getSSRText('not_found_text', lang))}</p>
      <a class="map-link" href="${SITE_URL}${prefix}/">${escapeHtml(getSSRText('go_to_map', lang))} <span aria-hidden="true">&#8599;</span></a>
    </div>
  </main>
</body>
</html>`;
}

module.exports = async (request, response) => {
  const lang = detectServerLanguage(request);
  const isIndexable = lang === 'es';
  response.setHeader('X-Robots-Tag', isIndexable ? 'index, follow' : 'noindex, follow');

  // 1. Rate limiting defensivo por IP en caso de cache MISS
  const rate = checkRateLimit(request, response);
  if (rate.limited) {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    return response.status(429).send(`<!DOCTYPE html><html><head><title>Too Many Requests</title></head><body style="font-family:'Inter',sans-serif;padding:40px;text-align:center;"><h1>429 - Límite de solicitudes excedido</h1><p>Has realizado demasiadas consultas. Por favor, espera un momento.</p></body></html>`);
  }

  try {
    const id = String(request.query?.id || '').trim();
    if (!id) {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
      response.setHeader('Vercel-Cache-Tag', 'obra-404,catalog');
      response.setHeader('Cache-Tag', 'obra-404,catalog');
      return response.status(404).send(renderNotFoundPage(lang));
    }

    const building = await fetchPublicBuilding(id);
    if (!building) {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
      response.setHeader('Vercel-Cache-Tag', 'obra-404,catalog');
      response.setHeader('Cache-Tag', 'obra-404,catalog');
      return response.status(404).send(renderNotFoundPage(lang));
    }

    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Cache Edge CDN y navegador: 1h en cliente (3600s), 24h en CDN (86400s), 7d stale-while-revalidate
    response.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
    // Tags granulares para invalidación selectiva por ID de obra sin purgar todo el catálogo
    const cacheTag = `building-${id},obra-${id},catalog`;
    response.setHeader('Vercel-Cache-Tag', cacheTag);
    response.setHeader('Cache-Tag', cacheTag);
    const discoveryData = await fetchDiscoverySections(building);
    return response.status(200).send(renderBuildingPage(building, lang, discoveryData));
  } catch (error) {
    console.error('No se pudo generar la página de obra:', error);
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
    return response.status(500).send('No se pudo cargar la obra.');
  }
};

module.exports.renderBuildingPage = renderBuildingPage;
module.exports.renderNotFoundPage = renderNotFoundPage;
module.exports.fetchDiscoverySections = fetchDiscoverySections;
module.exports.fetchSimilarBuildings = fetchSimilarBuildings;
module.exports.renderObraCardHtml = renderObraCardHtml;