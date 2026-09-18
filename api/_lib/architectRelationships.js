/* =========================================================================
   API/_LIB/ARCHITECTRELATIONSHIPS.JS — Registro y Motor de Relaciones Arquitecto-Estudio
   Soporte de herencia direccional asimétrica y composición de colectivos (CommonJS / Node).
   ========================================================================= */

function normalizeArchitectKey(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const STUDIO_RELATIONSHIPS = [
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

function findStudioByNameOrSlug(input) {
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

function findStudiosForMember(input) {
  if (!input) return [];
  const key = normalizeArchitectKey(input);
  if (!key) return [];

  return STUDIO_RELATIONSHIPS.filter((rel) => {
    return rel.members.some((member) => {
      if (normalizeArchitectKey(member) === key) return true;
      const aliases = rel.memberAliases && rel.memberAliases[member];
      if (aliases && aliases.some((a) => normalizeArchitectKey(a) === key)) return true;
      return false;
    });
  });
}

function isStudio(input) {
  return Boolean(findStudioByNameOrSlug(input));
}

function getStudioMembers(input) {
  const studio = findStudioByNameOrSlug(input);
  if (!studio) return [];

  return studio.members.map((name) => ({
    name,
    slug: normalizeArchitectKey(name),
  }));
}

function getMemberStudios(input) {
  const studios = findStudiosForMember(input);
  return studios.map((s) => ({
    studio: s.studio,
    slug: normalizeArchitectKey(s.studio),
  }));
}

function getCanonicalArchitectName(input) {
  if (!input) return '';
  const studio = findStudioByNameOrSlug(input);
  if (studio) return studio.studio;

  const key = normalizeArchitectKey(input);
  for (const rel of STUDIO_RELATIONSHIPS) {
    for (const member of rel.members) {
      if (normalizeArchitectKey(member) === key) return member;
      const aliases = rel.memberAliases && rel.memberAliases[member];
      if (aliases && aliases.some((a) => normalizeArchitectKey(a) === key)) return member;
    }
  }

  return input;
}

function getAssociatedSearchTerms(input) {
  if (!input) return [];
  const studio = findStudioByNameOrSlug(input);

  // CASO 1: Es un estudio -> Únicamente el estudio y sus aliases colectivos
  if (studio) {
    const terms = new Set();
    terms.add(studio.studio);
    if (studio.aliases) {
      studio.aliases.forEach((a) => terms.add(a));
    }
    return [...terms];
  }

  // CASO 2: Es un miembro de uno o varios estudios
  const memberStudios = findStudiosForMember(input);
  if (memberStudios.length > 0) {
    const terms = new Set();
    const canonicalName = getCanonicalArchitectName(input);
    terms.add(canonicalName);

    const key = normalizeArchitectKey(input);
    memberStudios.forEach((s) => {
      s.members.forEach((m) => {
        if (normalizeArchitectKey(m) === key || (s.memberAliases && s.memberAliases[m] && s.memberAliases[m].some((a) => normalizeArchitectKey(a) === key))) {
          terms.add(m);
          if (s.memberAliases && s.memberAliases[m]) {
            s.memberAliases[m].forEach((a) => terms.add(a));
          }
        }
      });
      terms.add(s.studio);
      if (s.aliases) {
        s.aliases.forEach((alias) => terms.add(alias));
      }
    });

    return [...terms];
  }

  // CASO 3: Autor independiente no registrado
  return [input];
}

module.exports = {
  STUDIO_RELATIONSHIPS,
  normalizeArchitectKey,
  findStudioByNameOrSlug,
  findStudiosForMember,
  isStudio,
  getStudioMembers,
  getMemberStudios,
  getCanonicalArchitectName,
  getAssociatedSearchTerms,
};
