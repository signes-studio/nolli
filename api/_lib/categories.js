const CATEGORIES = {
  residencial: {
    label: { es: 'Residencial', en: 'Residential', ca: 'Residencial' },
    class: 'residential',
  },
  dotacional_equipamiento: {
    label: { es: 'Dotacional / Equipamiento', en: 'Civic / Institutional', ca: 'Dotacional / Equipament' },
    class: 'institutional',
  },
  industrial_logistico: {
    label: { es: 'Industrial / Logístico', en: 'Industrial / Logistics', ca: 'Industrial / Logístic' },
    class: 'industrial',
  },
  religioso_funerario: {
    label: { es: 'Religioso / Funerario', en: 'Religious / Funerary', ca: 'Religiós / Funerari' },
    class: 'religious',
  },
  comercial_terciario: {
    label: { es: 'Comercial / Terciario', en: 'Commercial / Services', ca: 'Comercial / Terciari' },
    class: 'commercial',
  },
  espacio_publico_paisaje: {
    label: { es: 'Espacio Público / Paisaje', en: 'Public Space / Landscape', ca: 'Espai Públic / Paisatge' },
    class: 'public-space',
  },
  infraestructura_urbanismo: {
    label: { es: 'Infraestructura / Urbanismo', en: 'Infrastructure / Urbanism', ca: 'Infraestructura / Urbanisme' },
    class: 'infrastructure',
  },
};

function categoryClass(category) {
  return CATEGORIES[category]?.class || 'other';
}

function categoryLabel(category, lang = 'es') {
  const cat = CATEGORIES[category];
  if (!cat) return lang === 'en' ? 'Other' : (lang === 'ca' ? 'Altres' : 'Otros');
  if (typeof cat.label === 'object') {
    return cat.label[lang] || cat.label.es || 'Otros';
  }
  return cat.label || 'Otros';
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
