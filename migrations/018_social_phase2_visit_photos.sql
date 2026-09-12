-- =========================================================================
-- NOLLI ARCHITECTURE ATLAS — MIGRATION 018 (FASE 2 - BLOQUE 4)
-- Tabla visit_photos con photo_type, bypass de catálogo y blindaje anti-egress
-- Proyecto Supabase: ldtfvpjigzvcagtciipn
-- =========================================================================

-- 1. Crear ENUM visibility_level si no existe
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'visibility_level') THEN
    CREATE TYPE public.visibility_level AS ENUM ('public', 'friends', 'private');
  END IF;
END $$;

-- 2. Crear ENUM photo_type si no existe
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'photo_type') THEN
    CREATE TYPE public.photo_type AS ENUM (
      'standard',
      'analysis_sketch',
      'analysis_diagram',
      'analysis_detail'
    );
  END IF;
END $$;

-- 3. Crear tabla visit_photos
CREATE TABLE IF NOT EXISTS public.visit_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id UUID REFERENCES public.building_visits(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    building_id TEXT NOT NULL REFERENCES public.Buildings(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    thumbnail_url TEXT,
    photo_type public.photo_type NOT NULL DEFAULT 'standard',
    caption TEXT,
    visibility public.visibility_level NOT NULL DEFAULT 'friends',
    is_featured_in_catalog BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Blindaje de seguridad absoluto: CERO almacenamiento en Supabase Storage para evitar exceso de egress
    CONSTRAINT chk_no_supabase_storage CHECK (photo_url NOT LIKE '%supabase.co/storage%')
);

-- 4. Índices optimizados
CREATE INDEX IF NOT EXISTS idx_visit_photos_visit_id ON public.visit_photos(visit_id);
CREATE INDEX IF NOT EXISTS idx_visit_photos_user_id ON public.visit_photos(user_id);
CREATE INDEX IF NOT EXISTS idx_visit_photos_building_id ON public.visit_photos(building_id);
CREATE INDEX IF NOT EXISTS idx_visit_photos_photo_type ON public.visit_photos(photo_type);
CREATE INDEX IF NOT EXISTS idx_visit_photos_featured ON public.visit_photos(is_featured_in_catalog) WHERE is_featured_in_catalog = true;
CREATE INDEX IF NOT EXISTS idx_visit_photos_visibility ON public.visit_photos(visibility);

-- 5. Políticas RLS en visit_photos
ALTER TABLE public.visit_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "visit_photos_select_policy" ON public.visit_photos;
DROP POLICY IF EXISTS "visit_photos_insert_policy" ON public.visit_photos;
DROP POLICY IF EXISTS "visit_photos_update_policy" ON public.visit_photos;
DROP POLICY IF EXISTS "visit_photos_delete_policy" ON public.visit_photos;

-- A) POLÍTICA SELECT (con bypass explícito de catálogo público)
-- Si is_featured_in_catalog = true, es visible para TODO el mundo (incluyendo anónimos)
-- independientemente de su visibilidad de visita, ya que fue seleccionada para el catálogo general.
-- En los demás casos: visible si visibility='public', o si son amigos confirmados mediante are_friends(),
-- o si es el autor original, o administradores.
CREATE POLICY "visit_photos_select_policy"
ON public.visit_photos FOR SELECT
USING (
  is_featured_in_catalog = true
  OR visibility = 'public'
  OR (
    auth.uid() IS NOT NULL AND (
      auth.uid() = user_id
      OR (visibility = 'friends' AND public.are_friends(auth.uid(), user_id))
      OR public.is_admin()
    )
  )
);

-- B) POLÍTICA INSERT
-- Solo el usuario autenticado para fotos de sus propias visitas/obras
CREATE POLICY "visit_photos_insert_policy"
ON public.visit_photos FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
);

-- C) POLÍTICA UPDATE
-- El propio autor o administradores (por ejemplo para marcar is_featured_in_catalog)
CREATE POLICY "visit_photos_update_policy"
ON public.visit_photos FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_admin()
)
WITH CHECK (
  auth.uid() = user_id
  OR public.is_admin()
);

-- D) POLÍTICA DELETE
-- El propio autor o administradores
CREATE POLICY "visit_photos_delete_policy"
ON public.visit_photos FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_admin()
);

-- 6. Permisos de tabla
GRANT SELECT ON TABLE public.visit_photos TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.visit_photos TO authenticated;
