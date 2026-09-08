-- =========================================================================
-- NOLLI ARCHITECTURE ATLAS — MIGRATION 012 (FASE 1 - BLOQUE 2)
-- Reemplazo de vista segura public_profiles con campos de perfil social
-- Proyecto Supabase: ldtfvpjigzvcagtciipn
-- =========================================================================

-- 1. Reemplazar vista public_profiles proyectando los nuevos campos públicos
-- EXCLUYE TAJANTEMENTE: email, role, last_seen_at, y privacy_default_*
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT 
    id,
    nick,
    first_name,
    city,
    country,
    bio,
    website,
    avatar_url,
    school,
    is_verified_pro,
    verified_pro_title,
    total_points,
    points_visitor,
    points_contributor
FROM public.profiles;

-- 2. Conceder permisos de lectura a roles anónimos y autenticados
-- DECISIÓN DE PRODUCTO CONSCIENTE:
-- El acceso de lectura público (anon y authenticated) es intencional y necesario
-- para renderizar fichas de perfiles públicos (public-profile.html) y la futura
-- clasificación / leaderboard de puntos sin requerir inicio de sesión forzoso.
GRANT SELECT ON public.public_profiles TO anon, authenticated;

COMMENT ON VIEW public.public_profiles IS 
  'Vista segura de perfiles de usuario públicos. Permite acceso SELECT a anon y authenticated para perfiles públicos y rankings globales.';
