const crypto = require('crypto');

const FALLBACK_SUPABASE_URL = 'https://ldtfvpjigzvcagtciipn.supabase.co';
const FALLBACK_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkdGZ2cGppZ3p2Y2FndGNpaXBuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzU3OTg2NywiZXhwIjoyMTAzMTU1ODY3fQ.iRn-X5EzmW9eoKqL5qdW3s6I7NfcLfnJRmXTNwjCNnY';

// Tipos MIME de imagen permitidos
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
  'image/svg+xml',
]);

function uriEncode(str, encodeSlash = true) {
  let result = encodeURIComponent(str).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  if (!encodeSlash) {
    result = result.replace(/%2F/g, '/');
  }
  return result;
}

function sha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function hmac(key, str) {
  return crypto.createHmac('sha256', key).update(str, 'utf8').digest();
}

function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = hmac('AWS4' + key, dateStamp);
  const kRegion = hmac(kDate, regionName);
  const kService = hmac(kRegion, serviceName);
  const kSigning = hmac(kService, 'aws4_request');
  return kSigning;
}

/**
 * Genera una URL prefirmada PUT compatible con AWS SigV4 para Cloudflare R2
 */
function generateR2PresignedPutUrl({
  accountId,
  accessKeyId,
  secretAccessKey,
  bucketName,
  key,
  contentType,
  expiresIn = 900, // 15 minutos por defecto
  region = 'auto',
}) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substring(0, 8);
  const service = 's3';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const host = `${accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${bucketName}/${uriEncode(key, false)}`;

  const queryParams = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresIn),
    'X-Amz-SignedHeaders': 'host',
  };

  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(queryParams[k])}`)
    .join('&');

  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = 'host';
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n');

  const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, service);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

  const presignedUrl = `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
  return presignedUrl;
}

module.exports = async function handler(req, res) {
  // Configuración de cabeceras CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: `Método ${req.method} no permitido.` });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || FALLBACK_SERVICE_ROLE_KEY;

    // 1. Autenticación de usuario
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim() || req.body?.sessionToken;

    if (!token) {
      return res.status(401).json({ error: 'No autorizado: sesión no proporcionada.' });
    }

    const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${token}`,
      },
    });

    if (!authRes.ok) {
      return res.status(401).json({ error: 'No autorizado: token inválido o expirado.' });
    }

    const user = await authRes.json();
    if (!user || !user.id) {
      return res.status(401).json({ error: 'No autorizado: perfil de usuario no encontrado.' });
    }

    // 2. Validación de payload
    const { filename, contentType, buildingId, visitId, photoType } = req.body || {};

    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({ error: 'Parámetro "filename" requerido.' });
    }

    const cleanContentType = (contentType || 'image/jpeg').toLowerCase().trim();
    if (!ALLOWED_MIME_TYPES.has(cleanContentType)) {
      return res.status(400).json({
        error: `Tipo de contenido no permitido (${cleanContentType}). Se permiten imágenes (JPEG, PNG, WebP, AVIF, HEIC, SVG).`,
      });
    }

    // 3. Verificación de credenciales de Cloudflare R2
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucketName = process.env.R2_BUCKET_NAME || 'nolli-photos';
    const publicDomain = (process.env.R2_PUBLIC_DOMAIN || 'https://photos.nollimap.app').replace(/\/$/, '');

    if (!accountId || !accessKeyId || !secretAccessKey) {
      return res.status(503).json({
        error: 'R2_CONFIG_PENDING',
        message: 'Las credenciales de Cloudflare R2 (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) no están configuradas en el entorno.',
        configured: false,
      });
    }

    // 4. Construcción de clave S3
    const extMatch = filename.match(/\.([a-zA-Z0-9]+)$/);
    const ext = extMatch ? extMatch[1].toLowerCase() : (cleanContentType.split('/')[1] || 'jpg');
    const safeBase = filename
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .substring(0, 40);
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    const timestamp = Date.now();

    const folderPrefix = buildingId ? `visits/${buildingId}` : `visits/general`;
    const objectKey = `${folderPrefix}/${user.id}/${timestamp}_${randomSuffix}_${safeBase}.${ext}`;

    // 5. Generación de URL prefirmada PUT
    const expiresIn = 900; // 15 minutos
    const uploadUrl = generateR2PresignedPutUrl({
      accountId,
      accessKeyId,
      secretAccessKey,
      bucketName,
      key: objectKey,
      contentType: cleanContentType,
      expiresIn,
    });

    const publicUrl = `${publicDomain}/${objectKey}`;

    return res.status(200).json({
      success: true,
      configured: true,
      uploadUrl,
      publicUrl,
      key: objectKey,
      expiresIn,
      photoType: photoType || 'standard',
      userId: user.id,
    });
  } catch (err) {
    console.error('Error generando URL prefirmada R2:', err);
    return res.status(500).json({
      error: 'Error interno del servidor al preparar la subida de foto.',
      details: err.message,
    });
  }
};
