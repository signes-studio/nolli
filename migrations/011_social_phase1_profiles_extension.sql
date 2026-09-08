-- =========================================================================
-- NOLLI ARCHITECTURE ATLAS — MIGRATION 011 (FASE 1 - BLOQUE 1)
-- Extensión de public.profiles y creación del tipo ENUM visibility_level
-- Proyecto Supabase: ldtfvpjigzvcagtciipn
-- =========================================================================

-- 1. Crear ENUM visibility_level si no existe
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'visibility_level') THEN
    CREATE TYPE public.visibility_level AS ENUM ('public', 'friends', 'private');
  END IF;
END $$;

-- 2. Añadir nuevas columnas a public.profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS school TEXT,
  ADD COLUMN IF NOT EXISTS is_verified_pro BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_pro_title TEXT,
  ADD COLUMN IF NOT EXISTS points_visitor INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS points_contributor INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_points INTEGER GENERATED ALWAYS AS (points_visitor + points_contributor) STORED,
  ADD COLUMN IF NOT EXISTS privacy_default_visits public.visibility_level NOT NULL DEFAULT 'friends',
  ADD COLUMN IF NOT EXISTS privacy_default_photos public.visibility_level NOT NULL DEFAULT 'friends',
  ADD COLUMN IF NOT EXISTS privacy_blur_recent_location BOOLEAN NOT NULL DEFAULT false;

-- 3. Índice para acelerar consultas de clasificación / leaderboards por puntuación
CREATE INDEX IF NOT EXISTS idx_profiles_total_points ON public.profiles(total_points DESC);
