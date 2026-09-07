const FALLBACK_SUPABASE_URL = 'https://ldtfvpjigzvcagtciipn.supabase.co';
const FALLBACK_SUPABASE_KEY = 'sb_publishable_kYQ7Fa8nBsrkp1f8C4AuAg_4-5uBFm0';

// Rate limiting in-memory map (por IP en el container edge)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutos
const RATE_LIMIT_MAX_REQUESTS = 20; // Máximo 20 peticiones por ventana de 10 min

function checkRateLimit(ip) {
  const now = Date.now();
  if (rateLimitMap.size > 2000) {
    for (const [k, v] of rateLimitMap.entries()) {
      if (now > v.resetAt) rateLimitMap.delete(k);
    }
  }

  let record = rateLimitMap.get(ip);
  if (!record || now > record.resetAt) {
    record = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimitMap.set(ip, record);
    return {
      limited: false,
      remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - 1),
      resetAt: record.resetAt,
    };
  }

  record.count++;
  const limited = record.count > RATE_LIMIT_MAX_REQUESTS;
  return {
    limited,
    remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - record.count),
    resetAt: record.resetAt,
  };
}

module.exports = async function handler(req, res) {
  // 1. Rate limiting por IP
  const clientIp = (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'anonymous'
  );

  const rate = checkRateLimit(clientIp);
  res.setHeader('X-RateLimit-Limit', String(RATE_LIMIT_MAX_REQUESTS));
  res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(rate.resetAt / 1000)));

  if (rate.limited) {
    const retryAfter = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({
      error: 'Too Many Requests',
      message: 'Has superado el límite de solicitudes de catálogo. Por favor, espera unos minutos.',
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL || FALLBACK_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || FALLBACK_SUPABASE_KEY;

  const pageSize = 1000;
  // Excluir enlace_url y añadido_por reduce ~932 KB (-17.1% Brotli) sin afectar pines, filtros ni buscador.
  // Modo ligero opcional (?light=true) para pines mínimos: solo id, nombre, categoria, importancia, coordenadas (-49.8%).
  const isLight = req.query?.light === 'true' || req.query?.light === '1';
  const fields = isLight
    ? 'id,nombre_obra,categoria,importancia,longitud,latitud'
    : 'id,nombre_obra,foto_url,arquitecto,año_construccion,importancia,categoria,estado_acceso,visitable,longitud,latitud,place';

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
    // Etiquetas para invalidación/purga granular en Vercel Edge y Cloudflare CDN
    res.setHeader('Vercel-Cache-Tag', 'catalog');
    res.setHeader('Cache-Tag', 'catalog');
    // Cabecera Edge CDN compartida a nivel mundial: 1 hora fresca (s-maxage=3600), 2 horas revalidación
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
    return res.status(200).json(allBuildings);
  } catch (error) {
    console.error('Error al generar catálogo en edge:', error);
    return res.status(500).json({ error: 'Error al obtener catálogo de edificios' });
  }
};
