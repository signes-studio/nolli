/* =========================================================================
   ITINERARIESCONFIG.JS — Configuración y rutas curatoriales de Nolli
   ========================================================================= */

export const CURATED_ROUTES = [
  {
    id: 'route-docomomo',
    title: 'DOCOMOMO IBÉRICO',
    subtitle: 'Registro y documentación de la arquitectura del Movimiento Moderno',
    tag: 'REGISTRO OFICIAL',
    color: '#E84E1B',
    stops: 'CATÁLOGO',
    addedByFilter: 'DOCOMOMO'
  },
  {
    id: 'route-gatepac',
    title: 'GATEPAC · RACIONALISMO ESPAÑOL',
    subtitle: 'El núcleo del Movimiento Moderno en España, 1927-1937',
    tag: 'MOVIMIENTO MODERNO',
    color: '#C0392B',
    stops: '~23 OBRAS',
    yearRange: [1927, 1937],
    architectsFilter: ['Sert', 'Torres Clavé', 'Subirana', 'Illescas', 'García Mercadal', 'Sánchez Arcas', 'Lacasa', 'Fernández-Shaw', 'Bergamín']
  },
  {
    id: 'route-racionalismo-valenciano',
    title: 'RACIONALISMO VALENCIANO',
    subtitle: 'Arquitectura moderna en la Comunitat Valenciana, 1925-1936',
    tag: 'MOVIMIENTO MODERNO',
    color: '#D35400',
    stops: '~76 OBRAS',
    yearRange: [1925, 1936],
    bboxFilter: { latMin: 37.85, latMax: 40.75, lonMin: -1.55, lonMax: 0.75 }
  },
  {
    id: 'route-modernisme-catala',
    title: 'MODERNISME CATALÀ',
    subtitle: 'Gaudí, Domènech i Montaner, Puig i Cadafalch y el modernismo en Cataluña, 1888-1911',
    tag: 'MODERNISMO',
    color: '#8E44AD',
    stops: '~118 OBRAS',
    yearRange: [1888, 1911],
    bboxFilter: { latMin: 40.5, latMax: 42.9, lonMin: 0.15, lonMax: 3.35 }
  },
  {
    id: 'route-escuela-madrid',
    title: 'ESCUELA DE MADRID',
    subtitle: 'Organicismo y modernidad de posguerra: Sáenz de Oiza, Corrales y Molezún, Fisac, Sota, Higueras',
    tag: 'POSGUERRA',
    color: '#2C3E50',
    stops: '~150 OBRAS',
    yearRange: [1949, 1975],
    architectsFilter: ['Sáenz de Oiza', 'Corrales', 'Molezún', 'Fisac', 'Sota', 'Aburto', 'Higueras', 'Cano Lasso']
  },
  {
    id: 'route-grup-r',
    title: 'GRUP R · ESCOLA DE BARCELONA',
    subtitle: 'Coderch, Bohigas, Martorell y la renovación moderna catalana de posguerra, 1949-1970',
    tag: 'POSGUERRA',
    color: '#16A085',
    stops: '~74 OBRAS',
    yearRange: [1949, 1970],
    architectsFilter: ['Coderch', 'Moragas', 'Sostres', 'Bohigas', 'Martorell', 'Mitjans', 'Ribas Piera', 'Pratmarsó']
  },
  {
    id: 'route-regionalismo-vasco',
    title: 'REGIONALISMO VASCO',
    subtitle: 'Historicismo y arquitectura regional en el País Vasco, 1890-1936',
    tag: 'HISTORICISMO',
    color: '#7F8C8D',
    stops: '~68 OBRAS',
    yearRange: [1890, 1936],
    bboxFilter: { latMin: 42.85, latMax: 43.45, lonMin: -3.5, lonMax: -1.7 }
  },
  {
    id: 'route-arquitectura-canaria',
    title: 'ARQUITECTURA CANARIA',
    subtitle: 'Néstor y Miguel Martín-Fernández de la Torre y el regionalismo atlántico, 1900-1950',
    tag: 'REGIONALISMO',
    color: '#F39C12',
    stops: '~44 OBRAS',
    yearRange: [1900, 1950],
    bboxFilter: { latMin: 27.6, latMax: 29.5, lonMin: -18.2, lonMax: -13.4 }
  },
  {
    id: 'route-contemporanea-espana',
    title: 'ARQUITECTURA CONTEMPORÁNEA ESPAÑOLA',
    subtitle: 'Moneo, RCR, Nieto Sobejano, Mansilla+Tuñón, Campo Baeza y la escena actual, 1985-2025',
    tag: 'CONTEMPORÁNEA',
    color: '#E84E1B',
    stops: '~150 OBRAS',
    yearRange: [1985, 2025],
    architectsFilter: ['Moneo', 'Nieto', 'Sobejano', 'Mansilla', 'Tuñón', 'RCR', 'Souto de Moura', 'Siza', 'Campo Baeza', 'Ábalos', 'Herreros']
  },
  {
    id: 'route-escola-porto',
    title: 'ESCOLA DO PORTO',
    subtitle: 'Siza, Souto de Moura, Távora y la modernidad silenciosa portuguesa',
    tag: 'ESCUELA PORTUGUESA',
    color: '#2980B9',
    stops: '~66 OBRAS',
    yearRange: [1955, 2015],
    architectsFilter: ['Siza', 'Souto de Moura', 'Távora', 'Soutinho']
  },
  {
    id: 'route-estado-novo-portugal',
    title: 'ARQUITECTURA DO ESTADO NOVO',
    subtitle: 'Monumentalidad y regionalismo crítico bajo el régimen portugués, 1930-1955',
    tag: 'HISTORICISMO',
    color: '#7F8C8D',
    stops: '~25 OBRAS',
    yearRange: [1930, 1955],
    architectsFilter: ['Cottinelli Telmo', 'Cristino da Silva', 'Pardal Monteiro', 'Keil do Amaral']
  },
  {
    id: 'route-mouvement-moderne-francais',
    title: 'MOUVEMENT MODERNE FRANÇAIS',
    subtitle: 'Le Corbusier, Perret, Mallet-Stevens y los orígenes del racionalismo francés',
    tag: 'MOVIMIENTO MODERNO',
    color: '#C0392B',
    stops: '~30 OBRAS',
    architectsFilter: ['Le Corbusier', 'Perret', 'Mallet-Stevens', 'Lurçat', 'Chareau']
  },
  {
    id: 'route-french-touch',
    title: 'FRENCH TOUCH CONTEMPORÁNEA',
    subtitle: 'Lacaton & Vassal, Perrault, Nouvel y la arquitectura francesa reciente, 1995-2025',
    tag: 'CONTEMPORÁNEA',
    color: '#16A085',
    stops: '~62 OBRAS',
    yearRange: [1995, 2025],
    architectsFilter: ['Lacaton & Vassal', 'Perrault', 'Nouvel', 'Ricciotti', 'Bruther', 'LAN']
  }
];

export function matchWorksForRoute(route, sourceList = []) {
  const list = Array.isArray(sourceList) ? sourceList : [];
  if (!list || !list.length) return [];

  // Si la ruta tiene obras añadidas a mano explícitamente (work_ids), devolverlas respetando el orden manual
  const manualIds = route.work_ids || route.workIds;
  if (Array.isArray(manualIds) && manualIds.length > 0) {
    const idSet = new Set(manualIds.map(String));
    const matched = list.filter((o) => idSet.has(String(o.id)));
    const mapById = new Map(matched.map((o) => [String(o.id), o]));
    const ordered = [];
    manualIds.forEach((id) => {
      const item = mapById.get(String(id));
      if (item) ordered.push(item);
    });
    return ordered.length > 0 ? ordered : matched;
  }

  if (route.addedByFilter) {
    return list.filter((o) => {
      const addedBy = String(o.añadido_por || o.anadido_por || '').toUpperCase();
      return addedBy.includes(route.addedByFilter.toUpperCase());
    });
  }
  if (route.architectFilter) {
    return list.filter((o) => (o.arquitectos || o.arquitecto || '').toLowerCase().includes(route.architectFilter.toLowerCase()));
  }
  if (route.decadeFilter) {
    return list.filter((o) => {
      const y = Number(o.año_construccion);
      const dec = Number(route.decadeFilter);
      return y >= dec && y < dec + 10;
    });
  }
  if (route.categoryFilter) {
    return list.filter((o) => String(o.categoria || '').toLowerCase() === route.categoryFilter.toLowerCase());
  }
  if (route.architectsFilter && route.architectsFilter.length) {
    return list.filter((o) => {
      const arq = (o.arquitectos || o.arquitecto || '').toLowerCase();
      return route.architectsFilter.some((name) => arq.includes(name.toLowerCase()));
    });
  }
  if (route.yearRange && route.yearRange.length === 2) {
    return list.filter((o) => {
      const y = Number(o.año_construccion);
      return y >= route.yearRange[0] && y <= route.yearRange[1];
    });
  }
  if (route.bboxFilter) {
    const { latMin, latMax, lonMin, lonMax } = route.bboxFilter;
    return list.filter((o) => {
      const coords = Array.isArray(o.coordenadas) ? o.coordenadas : [Number(o.longitud), Number(o.latitud)];
      const [lon, lat] = coords;
      return lat >= latMin && lat <= latMax && lon >= lonMin && lon <= lonMax;
    });
  }
  if (route.keywords && route.keywords.length) {
    return list.filter((o) => {
      const text = `${o.nombre_obra} ${o.arquitectos || o.arquitecto || ''} ${o.place || ''}`.toLowerCase();
      return route.keywords.some((kw) => text.includes(kw.toLowerCase()));
    });
  }
  return [];
}

