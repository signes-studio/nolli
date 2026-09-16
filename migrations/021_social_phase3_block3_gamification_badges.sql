-- =========================================================================
-- NOLLI ARCHITECTURE ATLAS — MIGRATION 021 (FASE 3 - BLOQUE 3)
-- Tabla gamification_badges: catálogo público de insignias y reglas con RLS
-- Proyecto Supabase: ldtfvpjigzvcagtciipn
-- =========================================================================

-- 1. Crear tipos ENUM si no existen
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'badge_tier') THEN
    CREATE TYPE public.badge_tier AS ENUM ('bronze', 'silver', 'gold', 'platinum');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'badge_category') THEN
    CREATE TYPE public.badge_category AS ENUM ('visits', 'curation', 'contribution', 'special');
  END IF;
END $$;

-- 2. Crear tabla gamification_badges
CREATE TABLE IF NOT EXISTS public.gamification_badges (
    id TEXT PRIMARY KEY, -- Slug semántico inmutable (ej. 'urbanista-curioso')
    title TEXT NOT NULL,
    description TEXT,
    tier public.badge_tier NOT NULL DEFAULT 'bronze',
    category public.badge_category NOT NULL DEFAULT 'visits',
    icon_url TEXT,
    points_bonus INTEGER NOT NULL DEFAULT 0,
    criteria_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Índices de consulta y filtrado
CREATE INDEX IF NOT EXISTS idx_gamification_badges_tier ON public.gamification_badges(tier);
CREATE INDEX IF NOT EXISTS idx_gamification_badges_category ON public.gamification_badges(category);

-- 4. Habilitar y configurar Row Level Security (RLS)
ALTER TABLE public.gamification_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gamification_badges_public_select" ON public.gamification_badges;
DROP POLICY IF EXISTS "gamification_badges_admin_insert" ON public.gamification_badges;
DROP POLICY IF EXISTS "gamification_badges_admin_update" ON public.gamification_badges;
DROP POLICY IF EXISTS "gamification_badges_admin_delete" ON public.gamification_badges;

-- NOTA ARQUITECTÓNICA DE VISIBILIDAD:
-- gamification_badges es el catálogo de especificaciones del juego (nombres, niveles, iconos
-- y reglas para conseguirlas). No almacena PII ni datos de usuario. Su lectura es intencionalmente
-- pública (USING true) tanto para anon como authenticated, permitiendo mostrar qué insignias existen
-- antes o después del login.
CREATE POLICY "gamification_badges_public_select"
ON public.gamification_badges FOR SELECT
USING (true);

-- Solo administradores pueden gestionar el catálogo de insignias
CREATE POLICY "gamification_badges_admin_insert"
ON public.gamification_badges FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "gamification_badges_admin_update"
ON public.gamification_badges FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "gamification_badges_admin_delete"
ON public.gamification_badges FOR DELETE
TO authenticated
USING (public.is_admin());

-- 5. Privilegios de PostgreSQL
GRANT SELECT ON TABLE public.gamification_badges TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.gamification_badges TO authenticated;
GRANT ALL ON TABLE public.gamification_badges TO service_role;

COMMENT ON TABLE public.gamification_badges IS 
  'Catálogo maestro de insignias disponibles en Nolli. Consulta abierta pública para anon y auth.';
