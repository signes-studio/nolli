-- =========================================================================
-- NOLLI ARCHITECTURE ATLAS — MIGRATION 022 (FASE 3 - BLOQUE 4)
-- Tabla user_badges: insignias obtenidas por usuarios, constraint UNIQUE y RLS
-- Proyecto Supabase: ldtfvpjigzvcagtciipn
-- =========================================================================

-- 1. Crear tabla user_badges
CREATE TABLE IF NOT EXISTS public.user_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    badge_id TEXT NOT NULL REFERENCES public.gamification_badges(id) ON DELETE CASCADE,
    awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    progress_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT uq_user_badges_user_badge UNIQUE (user_id, badge_id)
);

-- 2. Índices de consulta y rendimiento
CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON public.user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_badge_id ON public.user_badges(badge_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_awarded_at ON public.user_badges(awarded_at DESC);

-- 3. Habilitar y configurar Row Level Security (RLS)
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_badges_public_select" ON public.user_badges;
DROP POLICY IF EXISTS "user_badges_admin_insert" ON public.user_badges;
DROP POLICY IF EXISTS "user_badges_admin_update" ON public.user_badges;
DROP POLICY IF EXISTS "user_badges_admin_delete" ON public.user_badges;

-- DECISIÓN ARQUITECTÓNICA DE VISIBILIDAD:
-- Dado que profiles.total_points ya es público a través de public_profiles para el leaderboard,
-- las insignias obtenidas siguen la misma convención: son logros públicos del perfil del usuario.
-- RLS permite SELECT abierto a cualquier usuario (anon y authenticated).
CREATE POLICY "user_badges_public_select"
ON public.user_badges FOR SELECT
USING (true);

-- SEGURIDAD DE ASIGNACIÓN (ANTI-TRAMPAS):
-- Los clientes web (incluido el propio usuario autenticado) NO pueden auto-asignarse insignias directamente.
-- Las insignias SOLO se otorgan mediante la función SECURITY DEFINER del servidor (check_and_award_badges).
-- La política INSERT solo permite mutaciones manuales a administradores con is_admin().
CREATE POLICY "user_badges_admin_insert"
ON public.user_badges FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "user_badges_admin_update"
ON public.user_badges FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "user_badges_admin_delete"
ON public.user_badges FOR DELETE
TO authenticated
USING (public.is_admin());

-- 4. Privilegios de PostgreSQL
-- Anon y Authenticated pueden leer (SELECT).
-- Anon NO tiene privilegio INSERT (rechazo inmediato a nivel PostgreSQL).
-- Authenticated solo puede insertar si cumple is_admin() (rechazado por RLS para usuarios normales).
GRANT SELECT ON TABLE public.user_badges TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.user_badges TO authenticated;
GRANT ALL ON TABLE public.user_badges TO service_role;

COMMENT ON TABLE public.user_badges IS 
  'Registro de insignias otorgadas a usuarios. Lectura pública, inserción restringida a lógica del servidor o admins.';
