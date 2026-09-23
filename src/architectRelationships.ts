/* =========================================================================
   ARCHITECTRELATIONSHIPS.TS — Registro y Motor de Relaciones Arquitecto-Estudio
   Soporte de herencia direccional asimétrica y composición de colectivos.
   ========================================================================= */

export interface StudioRelationship {
  id: string;                               // Slug canónico identificador (ej: 'vam10', 'gradoli-sanz')
  studio: string;                           // Nombre canónico del estudio (ej: 'VAM10', 'Gradolí & Sanz')
  members: string[];                        // Nombres canónicos de sus integrantes individuales
  aliases?: string[];                       // Variaciones ortográficas o firmas colectivas en la BD
  memberAliases?: Record<string, string[]>; // Variaciones de nombre para integrantes específicos
}

/**
 * Normaliza cualquier nombre o slug de arquitecto para comparaciones robustas.
 * Elimina diacríticos (tildes), signos de puntuación, '&' y genera kebab-case.
 */
export function normalizeArchitectKey(text: string): string {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Registro semilla de colectivos, estudios y asociaciones de arquitectura.
 */
export const SEED_STUDIO_RELATIONSHIPS: StudioRelationship[] = [
  {
    id: 'team4',
    studio: 'Team 4',
    members: ['Norman Foster', 'Richard Rogers', 'Su Rogers', 'Wendy Cheesman'],
    aliases: [
      'Team 4',
      'Team IV',
      'Team 4 Architects',
    ],
    memberAliases: {
      'Norman Foster': ['Sir Norman Foster', 'Lord Norman Foster'],
      'Richard Rogers': ['Lord Richard Rogers', 'Richard Rogers Partnership'],
    },
  },
  {
    id: 'vam10',
    studio: 'VAM10',
    members: ['Miguel del Rey', 'Antonio Gallud'],
    aliases: [
      'VAM 10',
      'VAM10 Arquitectura',
      'VAM10 Arquitectos',
      'VAM 10 Arquitectura',
      'VAM10 - Miguel del Rey, Antonio Gallud',
    ],
    memberAliases: {
      'Miguel del Rey': ['Miguel del Rey Aynat'],
      'Antonio Gallud': ['Antonio Gallud Martínez'],
    },
  },
  {
    id: 'gradoli-sanz',
    studio: 'Gradolí & Sanz',
    members: ['Carmel Gradolí', 'Arturo Sanz'],
    aliases: [
      'Gradolí & Sanz arquitectes',
      'Gradolí & Sanz Arquitectes',
      'Gradolí y Sanz',
      'Gradoli & Sanz',
      'Gradoli y Sanz',
      'Gradolí & Sanz Arquitectos',
      'Gradolí i Sanz',
      'Carmel Gradolí y Arturo Sanz',
      'Carmel Gradolí i Arturo Sanz',
    ],
    memberAliases: {
      'Carmel Gradolí': ['Carmel Gradoli', 'Carmel Gradolí Martínez'],
      'Arturo Sanz': ['Arturo Sanz Martínez'],
    },
  },
  {
    id: 'cruz-ortiz',
    studio: 'Cruz y Ortiz Arquitectos',
    members: ['Antonio Cruz', 'Antonio Ortiz'],
    aliases: [
      'Cruz y Ortiz',
      'Cruz & Ortiz',
      'Cruz y Ortiz Arquitectura',
      'Cruz & Ortiz Arquitectos',
    ],
  },
  {
    id: 'rcr-arquitectes',
    studio: 'RCR Arquitectes',
    members: ['Rafael Aranda', 'Carme Pigem', 'Ramón Vilalta'],
    aliases: [
      'RCR',
      'RCR Arquitectos',
      'RCR d\'Arquitectura',
    ],
  },
  {
    id: 'sanaa',
    studio: 'SANAA',
    members: ['Kazuyo Sejima', 'Ryue Nishizawa'],
    aliases: [
      'Sejima and Nishizawa and Associates',
      'SANAA - Sejima and Nishizawa and Associates',
      'Kazuyo Sejima + Ryue Nishizawa / SANAA',
    ],
  },
  {
    id: 'selgascano',
    studio: 'Selgascano',
    members: ['José Selgas', 'Lucía Cano'],
    aliases: [
      'SelgasCano',
      'Selgas Cano',
      'Selgas & Cano',
      'Selgascano Arquitectos',
      'Selgas-Cano',
    ],
  },
  {
    id: 'abalos-herreros',
    studio: 'Ábalos & Herreros',
    members: ['Iñaki Ábalos', 'Juan Herreros'],
    aliases: [
      'Ábalos y Herreros',
      'Abalos & Herreros',
      'Abalos y Herreros',
      'Ábalos + Herreros',
      'Abalos + Herreros',
    ],
  },
  {
    id: 'miralles-tagliabue-embt',
    studio: 'Miralles Tagliabue EMBT',
    members: ['Enric Miralles', 'Benedetta Tagliabue'],
    aliases: [
      'EMBT',
      'Miralles Tagliabue',
      'EMBT Arquitectes',
      'Miralles Tagliabue EMBT Arquitectes',
      'Miralles / Tagliabue - EMBT',
    ],
  },
  {
    id: 'flores-prats',
    studio: 'Flores & Prats',
    members: ['Eva Prats', 'Ricardo Flores'],
    aliases: [
      'Flores y Prats',
      'Flores & Prats Arquitectos',
      'Flores & Prats arquitectes',
      'Flores i Prats',
    ],
  },
  {
    id: 'barozzi-veiga',
    studio: 'Barozzi Veiga',
    members: ['Fabrizio Barozzi', 'Alberto Veiga'],
    aliases: [
      'Barozzi / Veiga',
      'EBV Barozzi Veiga',
      'Barozzi Veiga Arquitectos',
    ],
  },
  {
    id: 'mansilla-tunon',
    studio: 'Mansilla + Tuñón Arquitectos',
    members: ['Luis Moreno Mansilla', 'Emilio Tuñón'],
    aliases: [
      'Mansilla + Tuñón',
      'Mansilla y Tuñón',
      'Mansilla + Tuñón Arquitectura',
      'Luis Moreno Mansilla, Emilio Tuñón',
    ],
  },
  {
    id: 'harquitectes',
    studio: 'Harquitectes',
    members: ['David Lorente', 'Josep Ricart', 'Xavier Ros', 'Roger Tudó'],
    aliases: [
      'H Arquitectes',
      'HArquitectes',
      'H Arquitectes d\'edificació',
    ],
  },
  {
    id: 'nieto-sobejano',
    studio: 'Nieto Sobejano Arquitectos',
    members: ['Fuensanta Nieto', 'Enrique Sobejano'],
    aliases: [
      'Nieto Sobejano',
      'Nieto Sobejano Arquitectura',
    ],
  },
  {
    id: 'foster-partners',
    studio: 'Foster + Partners',
    members: ['Norman Foster'],
    aliases: [
      'Foster and Partners',
      'Foster & Partners',
      'Foster + Partners Architects',
    ],
  },
  {
    id: 'oma',
    studio: 'OMA',
    members: ['Rem Koolhaas'],
    aliases: [
      'Office for Metropolitan Architecture',
      'OMA - Office for Metropolitan Architecture',
      'OMA / Rem Koolhaas',
    ],
  },
  {
    id: 'big',
    studio: 'BIG',
    members: ['Bjarke Ingels'],
    aliases: [
      'Bjarke Ingels Group',
      'BIG - Bjarke Ingels Group',
      'BIG (Bjarke Ingels Group)',
    ],
  },
  {
    id: 'mvrdv',
    studio: 'MVRDV',
    members: ['Winy Maas', 'Jacob van Rijs', 'Nathalie de Vries'],
    aliases: [
      'MVRDV Architects',
    ],
  },
  {
    id: 'herzog-de-meuron',
    studio: 'Herzog & de Meuron',
    members: ['Jacques Herzog', 'Pierre de Meuron'],
    aliases: [
      'Herzog and de Meuron',
      'HdM',
      'Herzog & de Meuron Basel',
    ],
  },
  {
    id: 'diller-scofidio-renfro',
    studio: 'Diller Scofidio + Renfro',
    members: ['Elizabeth Diller', 'Ricardo Scofidio', 'Charles Renfro'],
    aliases: [
      'DS+R',
      'Diller Scofidio Renfro',
      'Diller + Scofidio',
    ],
  },
  {
    id: 'vetges-tu',
    studio: 'Vetges Tu i Mediterrània',
    members: ['Carles Dolç', 'Luis Perdigón', 'Enrique Mínguez'],
    aliases: [
      'Vetges Tu',
      'Vetges Tú',
      'Vetges Tu i Mediterrania',
      'Vetges Tu i Mediterranea',
    ],
  },
  {
    id: 'b720',
    studio: 'b720 Fermín Vázquez Arquitectos',
    members: ['Fermín Vázquez'],
    aliases: [
      'b720',
      'b720 Arquitectos',
      'b720 Fermin Vazquez Arquitectos',
    ],
  },
  {
    id: 'campo-baeza',
    studio: 'Estudio Campo Baeza',
    members: ['Alberto Campo Baeza'],
    aliases: [
      'Campo Baeza Arquitectos',
    ],
  },
  {
    id: 'moneo-brock',
    studio: 'Moneo Brock',
    members: ['Belén Moneo', 'Jeff Brock'],
    aliases: [
      'Moneo Brock Studio',
    ],
  },
];

/**
 * Clave de almacenamiento local para relaciones dinámicas añadidas o editadas por administradores.
 */
export const LOCAL_RELATIONSHIPS_KEY = 'nolli_admin_custom_relationships_v1';

/**
 * Conjunto activo en memoria de relaciones arquitecto-estudio.
 * Inicializado con el registro semilla y actualizado en caliente con las relaciones locales/remotas.
 */
export const STUDIO_RELATIONSHIPS: StudioRelationship[] = [...SEED_STUDIO_RELATIONSHIPS];

/**
 * Carga y unifica las relaciones personalizadas (guardadas en localStorage o remotas)
 * con el catálogo semilla base, resolviendo duplicados por slug canónico.
 */
export function reloadRelationships(): StudioRelationship[] {
  if (typeof window === 'undefined') return STUDIO_RELATIONSHIPS;

  try {
    const raw = localStorage.getItem(LOCAL_RELATIONSHIPS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const map = new Map<string, StudioRelationship>();

        // 1. Cargar semillas
        SEED_STUDIO_RELATIONSHIPS.forEach((rel) => {
          const key = normalizeArchitectKey(rel.id || rel.studio);
          map.set(key, { ...rel });
        });

        // 2. Sobrescribir o añadir relaciones personalizadas del administrador
        parsed.forEach((rel: StudioRelationship) => {
          if (rel && (rel.studio || rel.id)) {
            const key = normalizeArchitectKey(rel.id || rel.studio);
            map.set(key, { ...rel, id: rel.id || key });
          }
        });

        STUDIO_RELATIONSHIPS.length = 0;
        STUDIO_RELATIONSHIPS.push(...map.values());
        return STUDIO_RELATIONSHIPS;
      }
    }
  } catch (err) {
    console.warn('[architectRelationships] Error cargando relaciones locales:', err);
  }

  // Fallback si no hay datos en localStorage
  if (STUDIO_RELATIONSHIPS.length === 0) {
    STUDIO_RELATIONSHIPS.push(...SEED_STUDIO_RELATIONSHIPS);
  }
  return STUDIO_RELATIONSHIPS;
}

// Inicialización automática y reactiva en entorno navegador
if (typeof window !== 'undefined') {
  reloadRelationships();

  // Sincronización entre diferentes pestañas del navegador
  window.addEventListener('storage', (e) => {
    if (e.key === LOCAL_RELATIONSHIPS_KEY) {
      reloadRelationships();
      document.dispatchEvent(new CustomEvent('radar:relationships-changed'));
    }
  });

  // Sincronización en la misma ventana (ej: guardado desde admin.html)
  document.addEventListener('radar:relationships-changed', () => {
    reloadRelationships();
  });
}


/**
 * Busca si un nombre o slug corresponde a un estudio registrado (por ID, nombre o alias).
 */
export function findStudioByNameOrSlug(input: string): StudioRelationship | undefined {
  if (!input) return undefined;
  const key = normalizeArchitectKey(input);
  if (!key) return undefined;

  return STUDIO_RELATIONSHIPS.find((rel) => {
    if (rel.id === key) return true;
    if (normalizeArchitectKey(rel.studio) === key) return true;
    if (rel.aliases && rel.aliases.some((alias) => normalizeArchitectKey(alias) === key)) return true;
    return false;
  });
}

/**
 * Busca todos los estudios en los que participa un arquitecto (por nombre o alias).
 */
export function findStudiosForMember(input: string): StudioRelationship[] {
  if (!input) return [];
  const key = normalizeArchitectKey(input);
  if (!key) return [];

  return STUDIO_RELATIONSHIPS.filter((rel) => {
    return rel.members.some((member) => {
      if (normalizeArchitectKey(member) === key) return true;
      const aliases = rel.memberAliases?.[member];
      if (aliases && aliases.some((a) => normalizeArchitectKey(a) === key)) return true;
      return false;
    });
  });
}

/**
 * Determina si el nombre o slug corresponde a un estudio de arquitectura.
 */
export function isStudio(input: string): boolean {
  return Boolean(findStudioByNameOrSlug(input));
}

/**
 * Devuelve la lista de integrantes de un estudio con sus nombres canónicos y slugs.
 */
export function getStudioMembers(input: string): { name: string; slug: string }[] {
  const studio = findStudioByNameOrSlug(input);
  if (!studio) return [];

  return studio.members.map((name) => ({
    name,
    slug: normalizeArchitectKey(name),
  }));
}

/**
 * Devuelve la lista de estudios a los que pertenece un arquitecto con nombres y slugs.
 */
export function getMemberStudios(input: string): { studio: string; slug: string }[] {
  const studios = findStudiosForMember(input);
  return studios.map((s) => ({
    studio: s.studio,
    slug: normalizeArchitectKey(s.studio),
  }));
}

/**
 * Obtiene el nombre canónico de un arquitecto o estudio si está registrado.
 */
export function getCanonicalArchitectName(input: string): string {
  if (!input) return '';
  const studio = findStudioByNameOrSlug(input);
  if (studio) return studio.studio;

  const key = normalizeArchitectKey(input);
  for (const rel of STUDIO_RELATIONSHIPS) {
    for (const member of rel.members) {
      if (normalizeArchitectKey(member) === key) return member;
      const aliases = rel.memberAliases?.[member];
      if (aliases && aliases.some((a) => normalizeArchitectKey(a) === key)) return member;
    }
  }

  return input;
}

/**
 * HERENCIA DIRECCIONAL ASIMÉTRICA:
 * - Si es un MIEMBRO (ej. "Miguel del Rey"): devuelve su nombre, aliases y TODOS los estudios
 *   a los que pertenece con sus correspondientes aliases.
 * - Si es un ESTUDIO (ej. "VAM10"): devuelve ÚNICAMENTE el estudio y sus aliases.
 *   (NO incluye obras individuales de los miembros ajenas al estudio).
 * - Si no está registrado: devuelve `[input]`.
 */
export function getAssociatedSearchTerms(input: string): string[] {
  if (!input) return [];
  const studio = findStudioByNameOrSlug(input);

  // CASO 1: Es un estudio -> Únicamente el estudio y sus aliases colectivos
  if (studio) {
    const terms = new Set<string>();
    terms.add(studio.studio);
    if (studio.aliases) {
      studio.aliases.forEach((a) => terms.add(a));
    }
    return [...terms];
  }

  // CASO 2: Es un miembro de uno o varios estudios
  const memberStudios = findStudiosForMember(input);
  if (memberStudios.length > 0) {
    const terms = new Set<string>();
    const canonicalName = getCanonicalArchitectName(input);
    terms.add(canonicalName);

    // Añadir aliases del propio miembro si existen
    const key = normalizeArchitectKey(input);
    memberStudios.forEach((s) => {
      s.members.forEach((m) => {
        if (normalizeArchitectKey(m) === key || s.memberAliases?.[m]?.some((a) => normalizeArchitectKey(a) === key)) {
          terms.add(m);
          s.memberAliases?.[m]?.forEach((a) => terms.add(a));
        }
      });
      // Añadir el nombre del estudio y todos sus aliases
      terms.add(s.studio);
      s.aliases?.forEach((alias) => terms.add(alias));
    });

    return [...terms];
  }

  // CASO 3: Autor independiente no registrado
  return [input];
}

