const FALLBACK_SUPABASE_URL = 'https://ldtfvpjigzvcagtciipn.supabase.co';
const FALLBACK_SUPABASE_KEY = 'sb_publishable_kYQ7Fa8nBsrkp1f8C4AuAg_4-5uBFm0';

module.exports = async function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL || FALLBACK_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || FALLBACK_SUPABASE_KEY;

  const pageSize = 1000;
  const fields = 'id,nombre_obra,foto_url,enlace_url,arquitecto,año_construccion,importancia,categoria,estado_acceso,visitable,añadido_por,longitud,latitud,place';
  const params = new URLSearchParams({
    select: fields,
    order: 'id.asc',
    or: '(estado_revision.eq.publicada,estado_revision.is.null)',
  });

  const allBuildings = [];
  let start = 0;

  try {
    while (true) {
      const response = await fetch(`${supabaseUrl}/rest/v1/Buildings?${params.toString()}`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          Range: `${start}-${start + pageSize - 1}`,
        },
      });

      if (!response.ok) {
        if (response.status === 416) break;
        break;
      }

      const page = await response.json();
      if (!Array.isArray(page) || page.length === 0) break;
      allBuildings.push(...page);
      if (page.length < pageSize) break;
      start += pageSize;
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json(allBuildings);
  } catch (error) {
    console.error('Error al generar catálogo en edge:', error);
    return res.status(500).json({ error: 'Error al obtener catálogo de edificios' });
  }
};
