const crypto = require('crypto');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { getSupabaseConfig } = require('./_lib/supabaseEnv.js');

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

/**
 * Genera una URL prefirmada PUT con AWS SDK oficial compatible con Cloudflare R2
 */
async function generateR2PresignedPutUrl({
  accountId,
  accessKeyId,
  secretAccessKey,
  bucketName,
  key,
  contentType,
  expiresIn = 900,
}) {
  const cleanContentType = (contentType || 'image/jpeg').toLowerCase().trim();

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: cleanContentType,
  });

  const presignedUrl = await getSignedUrl(s3, command, {
    expiresIn,
    signableHeaders: new Set(['host', 'content-type']),
  });

  return presignedUrl;
}

module.exports = async function handler(req, res) {
  // Configuración de cabeceras CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    const accountId = (process.env.R2_ACCOUNT_ID || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    const accessKeyId = (process.env.R2_ACCESS_KEY_ID || '').trim();
    const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || '').trim();
    const bucketName = (process.env.R2_BUCKET_NAME || 'nolli-photos').trim();
    const publicDomain = ((process.env.R2_PUBLIC_DOMAIN || 'https://photos.nollimap.app').trim()).replace(/\/$/, '');

    const baseDiagnostics = {
      status: 'ok',
      hasAccountId: Boolean(accountId),
      accountIdLength: accountId ? accountId.length : 0,
      hasAccessKeyId: Boolean(accessKeyId),
      accessKeyIdType: accessKeyId.startsWith('cfat_') ? 'warning_user_api_token_instead_of_s3_key' : 'standard',
      accessKeyIdPrefix: accessKeyId ? accessKeyId.substring(0, 4) + '...' : null,
      accessKeyIdLength: accessKeyId ? accessKeyId.length : 0,
      hasSecretAccessKey: Boolean(secretAccessKey),
      secretAccessKeyLength: secretAccessKey ? secretAccessKey.length : 0,
      bucketName,
      publicDomain,
      allCredentialsConfigured: Boolean(accountId && accessKeyId && secretAccessKey),
    };

    if (req.query?.test === '1' || req.query?.test === 'true') {
      try {
        const s3 = new S3Client({
          region: 'auto',
          endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
          credentials: { accessKeyId, secretAccessKey },
          forcePathStyle: true,
          requestChecksumCalculation: 'WHEN_REQUIRED',
          responseChecksumValidation: 'WHEN_REQUIRED',
        });

        const testKey = `_healthcheck/test_${Date.now()}.txt`;
        const putCmd = new PutObjectCommand({
          Bucket: bucketName,
          Key: testKey,
          Body: 'test',
          ContentType: 'text/plain',
        });
        await s3.send(putCmd);

        const presignedUrl = await generateR2PresignedPutUrl({
          accountId,
          accessKeyId,
          secretAccessKey,
          bucketName,
          key: testKey,
          contentType: 'text/plain',
        });

        const presignedRes = await fetch(presignedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'text/plain' },
          body: 'presigned-test',
        });

        return res.status(200).json({
          ...baseDiagnostics,
          testResults: {
            s3DirectUpload: 'SUCCESS',
            presignedUrlPutStatus: presignedRes.status,
            presignedUrlPutOk: presignedRes.ok,
            presignedUrlPutBody: await presignedRes.text().catch(() => ''),
          },
        });
      } catch (testErr) {
        return res.status(200).json({
          ...baseDiagnostics,
          testError: {
            name: testErr.name,
            message: testErr.message,
            code: testErr.$metadata?.httpStatusCode,
            fault: testErr.$fault,
          },
        });
      }
    }

    return res.status(200).json(baseDiagnostics);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: `Método ${req.method} no permitido.` });
  }

  try {
    const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();

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
    const { filename, contentType, buildingId, visitId, photoType, uploadType } = req.body || {};

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
    const accountId = (process.env.R2_ACCOUNT_ID || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    const accessKeyId = (process.env.R2_ACCESS_KEY_ID || '').trim();
    const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || '').trim();
    const bucketName = (process.env.R2_BUCKET_NAME || 'nolli-photos').trim();
    const publicDomain = ((process.env.R2_PUBLIC_DOMAIN || 'https://photos.nollimap.app').trim()).replace(/\/$/, '');

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

    let folderPrefix = buildingId ? `visits/${buildingId}` : `visits/general`;
    let objectKey = `${folderPrefix}/${user.id}/${timestamp}_${randomSuffix}_${safeBase}.${ext}`;

    if (uploadType === 'avatar') {
      folderPrefix = `avatars/${user.id}`;
      objectKey = `${folderPrefix}/${timestamp}_${randomSuffix}_avatar.${ext}`;
    } else if (uploadType === 'building') {
      folderPrefix = buildingId ? `buildings/${buildingId}` : `buildings/new/${user.id}`;
      objectKey = `${folderPrefix}/${timestamp}_${randomSuffix}_${safeBase}.${ext}`;
    }

    // 5. Generación de URL prefirmada PUT
    const expiresIn = 900; // 15 minutos
    const uploadUrl = await generateR2PresignedPutUrl({
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

