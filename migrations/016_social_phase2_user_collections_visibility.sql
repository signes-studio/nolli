-- =========================================================================
-- NOLLI ARCHITECTURE ATLAS — MIGRATION 016 (FASE 2 - BLOQUE 1)
-- Migración de user_collections a visibility_level unificado, consolidación RLS
-- y soporte para listas de deseos (is_wishlist) y colaborativas.
-- Proyecto Supabase: ldtfvpjigzvcagtciipn
-- =========================================================================

-- 1. Crear ENUM visibility_level si no existe
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'visibility_level') THEN
    CREATE TYPE public.visibility_level AS ENUM ('public', 'friends', 'private');
  END IF;
END $$;

-- 2. Añadir nuevas columnas a public.user_collections
ALTER TABLE public.user_collections
  ADD COLUMN IF NOT EXISTS visibility public.visibility_level NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS is_wishlist BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_collaborative BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cover_photo_url TEXT;

-- 3. Migrar datos existentes (status='public' o is_public=true -> visibility='public')
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_collections' AND column_name = 'status'
  ) OR EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_collections' AND column_name = 'is_public'
  ) THEN
    -- Migrar filas públicas
    UPDATE public.user_collections
    SET visibility = 'public'
    WHERE (
      (status = 'public') 
      OR (is_public = true)
    );

    -- Asegurar que el resto quede como 'private' si no tuviera valor
    UPDATE public.user_collections
    SET visibility = 'private'
    WHERE visibility IS NULL;
  END IF;
END $$;

-- 4. Eliminar trigger y función heredada de sincronización de status
DROP TRIGGER IF EXISTS trg_sync_user_collections_status ON public.user_collections;
DROP FUNCTION IF EXISTS public.sync_user_collections_status();

-- 5. Eliminar columnas deprecadas tras auditar y actualizar frontend
ALTER TABLE public.user_collections
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS is_public;

-- 6. Índices optimizados
DROP INDEX IF EXISTS public.idx_user_collections_status;
DROP INDEX IF EXISTS public.idx_user_collections_is_public;

CREATE INDEX IF NOT EXISTS idx_user_collections_visibility ON public.user_collections(visibility);
CREATE INDEX IF NOT EXISTS idx_user_collections_user_id ON public.user_collections(user_id);
CREATE INDEX IF NOT EXISTS idx_user_collections_is_wishlist ON public.user_collections(is_wishlist) WHERE is_wishlist = true;

-- 7. Consolidación limpia de Políticas RLS
ALTER TABLE public.user_collections ENABLE ROW LEVEL SECURITY;

-- Limpieza exhaustiva de políticas previas redundantes o duplicadas
DROP POLICY IF EXISTS "Users can view own collections or public collections" ON public.user_collections;
DROP POLICY IF EXISTS "Users can view own collections" ON public.user_collections;
DROP POLICY IF EXISTS "collections_select_own" ON public.user_collections;
DROP POLICY IF EXISTS "Users can manage own collections" ON public.user_collections;
DROP POLICY IF EXISTS "collections_manage_own" ON public.user_collections;
DROP POLICY IF EXISTS "collections_insert_own" ON public.user_collections;
DROP POLICY IF EXISTS "collections_update_own" ON public.user_collections;
DROP POLICY IF EXISTS "collections_delete_own" ON public.user_collections;
DROP POLICY IF EXISTS "user_collections_select_policy" ON public.user_collections;
DROP POLICY IF EXISTS "user_collections_insert_policy" ON public.user_collections;
DROP POLICY IF EXISTS "user_collections_update_policy" ON public.user_collections;
DROP POLICY IF EXISTS "user_collections_delete_policy" ON public.user_collections;

-- A) POLÍTICA CANÓNICA SELECT
-- Visible para anon y authenticated si visibility = 'public'.
-- Si visibility = 'friends', solo authenticated si son amigos comprobados mediante are_friends().
-- El dueño (auth.uid() = user_id) y administradores tienen acceso total de lectura a sus listas.
CREATE POLICY "user_collections_select_policy"
ON public.user_collections FOR SELECT
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

-- B) POLÍTICA CANÓNICA INSERT
-- Solo usuarios autenticados creando colecciones con su propio user_id o administradores.
CREATE POLICY "user_collections_insert_policy"
ON public.user_collections FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  OR public.is_admin()
);

-- C) POLÍTICA CANÓNICA UPDATE
-- Solo el autor de la colección o administradores.
CREATE POLICY "user_collections_update_policy"
ON public.user_collections FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_admin()
)
WITH CHECK (
  auth.uid() = user_id
  OR public.is_admin()
);

-- D) POLÍTICA CANÓNICA DELETE
-- Solo el autor de la colección o administradores.
CREATE POLICY "user_collections_delete_policy"
ON public.user_collections FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_admin()
);

-- 8. Permisos a roles de Supabase
GRANT SELECT ON TABLE public.user_collections TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.user_collections TO authenticated;
