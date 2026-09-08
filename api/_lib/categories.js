const CATEGORIES = {
  residencial: {
    label: { es: 'Residencial', en: 'Residential', ca: 'Residencial' },
    class: 'residential',
    description: {
      es: 'Vivienda unifamiliar, vivienda colectiva, rascacielos residenciales y tipologías habitacionales contemporáneas e históricas catalogadas en Nolli.',
      en: 'Single-family houses, collective housing, residential towers, and historical and contemporary living typologies cataloged on Nolli.',
      ca: 'Habitatge unifamiliar, habitatge col·lectiu, gratacels residencials i tipologies residencials contemporànies i històriques catalogades a Nolli.',
    },
  },
  dotacional_equipamiento: {
    label: { es: 'Dotacional / Equipamiento', en: 'Civic / Institutional', ca: 'Dotacional / Equipament' },
    class: 'institutional',
    description: {
      es: 'Museos, centros culturales, bibliotecas, auditorios, escuelas, universidades y edificios cívicos e institucionales de referencia mundial.',
      en: 'Museums, cultural centers, libraries, auditoriums, universities, and world-renowned civic and institutional landmarks.',
      ca: 'Museus, centres culturals, biblioteques, auditoris, universitats i edificis cívics i institucionals de referència mundial.',
    },
  },
  industrial_logistico: {
    label: { es: 'Industrial / Logístico', en: 'Industrial / Logistics', ca: 'Industrial / Logístic' },
    class: 'industrial',
    description: {
      es: 'Fábricas, almacenes, centrales energéticas, silos y patrimonio de arquitectura industrial moderna y contemporánea.',
      en: 'Factories, warehouses, power stations, silos, and heritage of modern and contemporary industrial architecture.',
      ca: 'Fàbriques, magatzems, centrals energètiques, sitges i patrimoni d\'arquitectura industrial moderna i contemporània.',
    },
  },
  religioso_funerario: {
    label: { es: 'Religioso / Funerario', en: 'Religious / Funerary', ca: 'Religiós / Funerari' },
    class: 'religious',
    description: {
      es: 'Templos, iglesias, catedrales, capillas, mezquitas, sinagogas, monasterios y arquitectura funeraria de gran valor patrimonial y espacial.',
      en: 'Temples, churches, cathedrals, chapels, mosques, synagogues, monasteries, and monumental funerary architecture.',
      ca: 'Temples, esglésies, catedrals, capelles, mesquites, sinagogues, monestirs i arquitectura funerària de gran valor patrimonial i espacial.',
    },
  },
  comercial_terciario: {
    label: { es: 'Comercial / Terciario', en: 'Commercial / Services', ca: 'Comercial / Terciari' },
    class: 'commercial',
    description: {
      es: 'Edificios de oficinas, sedes corporativas, centros de negocios, pabellones comerciales y hoteles de autor.',
      en: 'Office towers, corporate headquarters, business centers, commercial pavilions, and designer hotels.',
      ca: 'Edificis d\'oficines, seus corporatives, centres de negocis, pavellons comercials i hotels d\'autor.',
    },
  },
  espacio_publico_paisaje: {
    label: { es: 'Espacio Público / Paisaje', en: 'Public Space / Landscape', ca: 'Espai Públic / Paisatge' },
    class: 'public-space',
    description: {
      es: 'Plazas urbanas, parques, intervenciones paisajísticas, paseos marítimos, miradores y espacio público transformador.',
      en: 'Urban plazas, public parks, landscape architecture, promenades, viewpoints, and transformative civic spaces.',
      ca: 'Places urbanes, parcs, intervencions paisatgístiques, passejos marítims, miradors i espai públic transformador.',
    },
  },
  infraestructura_urbanismo: {
    label: { es: 'Infraestructura / Urbanismo', en: 'Infrastructure / Urbanism', ca: 'Infraestructura / Urbanisme' },
    class: 'infrastructure',
    description: {
      es: 'Puentes, pasarelas, estaciones de tren, terminales de transporte, aeropuertos y planes maestros urbanos.',
      en: 'Bridges, footbridges, railway stations, transit terminals, airports, and urban master plans.',
      ca: 'Ponts, passarel·les, estacions de tren, terminals de transport, aeroports i plans mestres urbans.',
    },
  },
  otro: {
    label: { es: 'Otros / Singulares', en: 'Other / Unique', ca: 'Altres / Singulars' },
    class: 'other',
    description: {
      es: 'Pabellones temporales, instalaciones arquitectónicas efímeras, monumentos y tipologías singulares.',
      en: 'Temporary pavilions, ephemeral architectural installations, monuments, and unique typologies.',
      ca: 'Pavellons temporals, instal·lacions arquitectòniques efímeres, monuments i tipologies singulars.',
    },
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

function categoryDescription(category, lang = 'es') {
  const cat = CATEGORIES[category];
  if (!cat || !cat.description) return '';
  return cat.description[lang] || cat.description.es || '';
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
  categoryDescription,
  isValidCategory,
  getCategorySlugs,
};
