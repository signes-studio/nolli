-- =========================================================================
-- NOLLI ARCHITECTURE ATLAS — MIGRATION 017 (FASE 2 - BLOQUE 3)
-- Tabla building_visits con RLS según visibility_level y are_friends()
-- Proyecto Supabase: ldtfvpjigzvcagtciipn
-- =========================================================================

-- 1. Crear ENUM visibility_level si no existe
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'visibility_level') THEN
    CREATE TYPE public.visibility_level AS ENUM ('public', 'friends', 'private');
  END IF;
END $$;

-- 2. Crear tabla building_visits
CREATE TABLE IF NOT EXISTS public.building_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    building_id BIGINT NOT NULL REFERENCES public.Buildings(id) ON DELETE CASCADE,
    visited_at DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    rating SMALLINT CHECK (rating >= 1 AND rating <= 5),
    visibility public.visibility_level NOT NULL DEFAULT 'friends',
    is_location_blurred BOOLEAN NOT NULL DEFAULT false,
    points_awarded INTEGER NOT NULL DEFAULT 10,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_building_visits_user_id ON public.building_visits(user_id);
CREATE INDEX IF NOT EXISTS idx_building_visits_building_id ON public.building_visits(building_id);
CREATE INDEX IF NOT EXISTS idx_building_visits_visited_at ON public.building_visits(visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_building_visits_visibility ON public.building_visits(visibility);

-- 4. Políticas RLS en building_visits
ALTER TABLE public.building_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "building_visits_select_policy" ON public.building_visits;
DROP POLICY IF EXISTS "building_visits_insert_policy" ON public.building_visits;
DROP POLICY IF EXISTS "building_visits_update_policy" ON public.building_visits;
DROP POLICY IF EXISTS "building_visits_delete_policy" ON public.building_visits;

-- A) POLÍTICA SELECT
-- SELECT permitido si visibility='public', o si visibility='friends' Y are_friends(auth.uid(), user_id),
-- o si es el propio autor (auth.uid() = user_id), o is_admin().
-- Anon NO tiene acceso salvo cuando visibility='public'.
CREATE POLICY "building_visits_select_policy"
ON public.building_visits FOR SELECT
USING (
  visibility = 'public'
  OR (
    auth.uid() IS NOT NULL AND (
      auth.uid() = user_id
      OR (visibility = 'friends' AND public.are_friends(auth.uid(), user_id))
      OR public.is_admin()
    )
  )
);

-- B) POLÍTICA INSERT
-- Solo el propio usuario autenticado como autor
CREATE POLICY "building_visits_insert_policy"
ON public.building_visits FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
);

-- C) POLÍTICA UPDATE
-- Solo el autor de la visita
CREATE POLICY "building_visits_update_policy"
ON public.building_visits FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
)
WITH CHECK (
  auth.uid() = user_id
);

-- D) POLÍTICA DELETE
-- Solo el autor de la visita
CREATE POLICY "building_visits_delete_policy"
ON public.building_visits FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
);

-- 5. Permisos de tabla
GRANT SELECT ON TABLE public.building_visits TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.building_visits TO authenticated;
