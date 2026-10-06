/**
 * api/_lib/supabaseEnv.js
 * Centralización segura de variables de entorno de Supabase para funciones serverless.
 * Soporta múltiples alias estándar de Vercel para evitar fallos por nomenclatura.
 */

const FALLBACK_SUPABASE_URL = 'https://ldtfvpjigzvcagtciipn.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY = 'sb_publishable_kYQ7Fa8nBsrkp1f8C4AuAg_4-5uBFm0';

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL 
    || process.env.NEXT_PUBLIC_SUPABASE_URL 
    || FALLBACK_SUPABASE_URL;

  // Busca la clave de servicio en los nombres de variable habituales en Vercel
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_KEY
    || process.env.SERVICE_ROLE_KEY
    || (process.env.SUPABASE_KEY && !process.env.SUPABASE_KEY.startsWith('sb_publishable_') ? process.env.SUPABASE_KEY : '')
    || '';

  // Clave API válida para validar tokens de usuario en Supabase Auth /auth/v1/user
  const apiKey = serviceRoleKey
    || process.env.SUPABASE_ANON_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || (process.env.SUPABASE_KEY ? process.env.SUPABASE_KEY : '')
    || FALLBACK_SUPABASE_ANON_KEY;

  return {
    supabaseUrl,
    serviceRoleKey,
    apiKey,
    hasServiceRoleKey: Boolean(serviceRoleKey && serviceRoleKey.length > 20),
  };
}

module.exports = {
  getSupabaseConfig,
  FALLBACK_SUPABASE_URL,
  FALLBACK_SUPABASE_ANON_KEY,
};

