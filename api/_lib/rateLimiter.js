/**
 * API/_LIB/RATELIMITER.JS — Rate Limiting en memoria para Edge y Serverless
 *
 * Implementa una ventana deslizante basada en la IP del cliente (con fallback seguro).
 * Actúa como DEFENSA EN PROFUNDIDAD: solo consume límite cuando la CDN experimenta
 * un cache MISS y la petición alcanza el contenedor Node.js.
 */

function createRateLimiter({
  windowMs = 60 * 1000, // 1 minuto por defecto
  maxRequests = 60,     // 60 peticiones por ventana
  maxEntries = 5000,    // Límite máximo de IPs en memoria para evitar leaks
} = {}) {
  const store = new Map();

  return function checkRateLimit(req, res, customLimit = null) {
    const limit = customLimit || maxRequests;
    const clientIp = (
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.headers['x-real-ip'] ||
      req.socket?.remoteAddress ||
      'anonymous'
    );

    const now = Date.now();

    // Limpieza preventiva si el mapa crece en exceso
    if (store.size > maxEntries) {
      for (const [k, v] of store.entries()) {
        if (now > v.resetAt) store.delete(k);
      }
    }

    let record = store.get(clientIp);
    if (!record || now > record.resetAt) {
      record = { count: 1, resetAt: now + windowMs };
      store.set(clientIp, record);
    } else {
      record.count++;
    }

    const limited = record.count > limit;
    const remaining = Math.max(0, limit - record.count);
    const resetSeconds = Math.ceil(record.resetAt / 1000);

    if (res && typeof res.setHeader === 'function') {
      res.setHeader('X-RateLimit-Limit', String(limit));
      res.setHeader('X-RateLimit-Remaining', String(remaining));
      res.setHeader('X-RateLimit-Reset', String(resetSeconds));
    }

    if (limited && res && typeof res.setHeader === 'function') {
      const retryAfter = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
    }

    return {
      limited,
      remaining,
      resetAt: record.resetAt,
      clientIp,
    };
  };
}

module.exports = {
  createRateLimiter,
};
