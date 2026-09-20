/* =========================================================================
   API/_LIB/IMPORTANCE.JS — Utilidades de Niveles de Importancia (SSR)
   Niveles disciplinares de Nolli:
   - 0: Obra Maestra (Obra Cumbre / Rombo 45°)
   - 1: Imprescindible (Círculo con punto central)
   - 2: Recomendada (Círculo macizo con contorno)
   - 3: Documentada (Círculo con contorno sutil)
   ========================================================================= */

function normalizeImportance(val) {
  const num = Number(val);
  if (Number.isFinite(num) && num >= 0 && num <= 3) return num;
  return 1;
}

const IMPORTANCE_TEXTS = {
  es: {
    0: { label: 'Obra Maestra', desc: 'Obra maestra: hito patrimonial indiscutible' },
    1: { label: 'Imprescindible', desc: 'Imprescindible: parada obligatoria en cualquier ruta' },
    2: { label: 'Recomendada', desc: 'Recomendada: de gran interés arquitectónico' },
    3: { label: 'Documentada', desc: 'Documentada: obra catalogada en el mapa' },
  },
  en: {
    0: { label: 'Masterpiece', desc: 'Masterpiece: landmark of architectural excellence' },
    1: { label: 'Essential', desc: 'Essential: must-see architecture' },
    2: { label: 'Recommended', desc: 'Recommended: high architectural value' },
    3: { label: 'Documented', desc: 'Documented: cataloged architecture' },
  },
  ca: {
    0: { label: 'Obra Mestra', desc: 'Obra mestra: fita patrimonial indiscutible' },
    1: { label: 'Imprescindible', desc: 'Imprescindible: parada obligatòria en qualsevol ruta' },
    2: { label: 'Recomanada', desc: 'Recomanada: de gran interès arquitectònic' },
    3: { label: 'Documentada', desc: 'Documentada: obra catalogada al mapa' },
  },
};

/**
 * Genera el icono SVG geométrico que replica el lenguaje de chinchetas del mapa.
 */
function getImportanceIconSvg(level) {
  if (level === 0) {
    // Rombo / Diamante patrimonial (45°)
    return `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" class="imp-icon-svg" aria-hidden="true"><rect x="5" y="0.8" width="5.8" height="5.8" transform="rotate(45 5 0.8)" fill="#EA560D" stroke="#141411" stroke-width="1.2"/><circle cx="5" cy="5" r="1.1" fill="#141411"/></svg>`;
  }
  if (level === 1) {
    // Círculo macizo con punto central
    return `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" class="imp-icon-svg" aria-hidden="true"><circle cx="5" cy="5" r="3.8" fill="#141411" stroke="#F8F1DF" stroke-width="1"/><circle cx="5" cy="5" r="1.3" fill="#F8F1DF"/></svg>`;
  }
  if (level === 2) {
    // Círculo macizo con contorno firme (sin punto central)
    return `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" class="imp-icon-svg" aria-hidden="true"><circle cx="5" cy="5" r="3.6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
  }
  // Nivel 3: Círculo con contorno sutil
  return `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" class="imp-icon-svg" aria-hidden="true"><circle cx="5" cy="5" r="3.4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 1.5"/></svg>`;
}

function getImportanceInfo(val, lang = 'es') {
  const level = normalizeImportance(val);
  const dict = IMPORTANCE_TEXTS[lang] || IMPORTANCE_TEXTS.es;
  const current = dict[level] || dict[1];
  const iconSvg = getImportanceIconSvg(level);

  return {
    level,
    label: current.label,
    desc: current.desc,
    badgeClass: `imp-${level}`,
    iconSvg,
  };
}

module.exports = {
  normalizeImportance,
  getImportanceInfo,
  getImportanceIconSvg,
  IMPORTANCE_TEXTS,
};
