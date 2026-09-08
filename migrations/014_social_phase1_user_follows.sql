-- =========================================================================
-- NOLLI ARCHITECTURE ATLAS — MIGRATION 014 (FASE 1 - BLOQUE 4)
-- Tabla user_follows con política de lectura pública documentada
-- Proyecto Supabase: ldtfvpjigzvcagtciipn
-- =========================================================================

-- 1. Crear tabla user_follows
CREATE TABLE IF NOT EXISTS public.user_follows (
    follower_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (follower_id, following_id),
    CONSTRAINT chk_no_self_follow CHECK (follower_id <> following_id)
);

-- Índice para consultar rápidamente los seguidores de un usuario
CREATE INDEX IF NOT EXISTS idx_follows_following ON public.user_follows(following_id);

-- 2. Habilitar RLS
ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;

-- 3. Limpiar políticas anteriores si existieran
DROP POLICY IF EXISTS "follows_select_public" ON public.user_follows;
DROP POLICY IF EXISTS "follows_insert_own" ON public.user_follows;
DROP POLICY IF EXISTS "follows_delete_own" ON public.user_follows;

-- 4. Política de LECTURA: Deliberadamente pública
CREATE POLICY "follows_select_public"
    ON public.user_follows FOR SELECT
    TO public
    USING (true);

-- Documentación explícita para auditorías de seguridad
COMMENT ON POLICY "follows_select_public" ON public.user_follows IS 
  'Decisión de producto deliberada y consciente: el grafo de seguimiento asimétrico (seguidos/seguidores) es de lectura pública universal (incluyendo usuarios anónimos), permitiendo mostrar seguidores en perfiles públicos sin autenticación previa, similar a Twitter/Instagram.';

-- 5. Políticas de ESCRITURA: Exclusivas del propio usuario seguidor autenticado
CREATE POLICY "follows_insert_own"
    ON public.user_follows FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "follows_delete_own"
    ON public.user_follows FOR DELETE
    TO authenticated
    USING (auth.uid() = follower_id);

-- 6. Conceder privilegios
GRANT SELECT ON TABLE public.user_follows TO anon, authenticated;
GRANT INSERT, DELETE ON TABLE public.user_follows TO authenticated;
