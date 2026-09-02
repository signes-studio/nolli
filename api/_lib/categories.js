const CATEGORIES = {
  residencial: { label: 'Residencial', class: 'residential' },
  dotacional_equipamiento: { label: 'Dotacional / Equipamiento', class: 'institutional' },
  industrial_logistico: { label: 'Industrial / Logístico', class: 'industrial' },
  religioso_funerario: { label: 'Religioso / Funerario', class: 'religious' },
  comercial_terciario: { label: 'Comercial / Terciario', class: 'commercial' },
  espacio_publico_paisaje: { label: 'Espacio Público / Paisaje', class: 'public-space' },
  infraestructura_urbanismo: { label: 'Infraestructura / Urbanismo', class: 'infrastructure' },
};

function categoryClass(category) {
  return CATEGORIES[category]?.class || 'other';
}

function categoryLabel(category) {
  return CATEGORIES[category]?.label || 'Otros';
}

function isValidCategory(slug) {
  return Boolean(CATEGORIES[slug]);
}

function getCategorySlugs() {
  return Object.keys(CATEGORIES);
}

module.exports = {
  CATEGORIES,
  categoryClass,
  categoryLabel,
  isValidCategory,
  getCategorySlugs,
};
