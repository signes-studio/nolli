-- =========================================================================
-- NOLLI ARCHITECTURE ATLAS — MIGRATION 015 (FASE 1 - BLOQUE 5)
-- Función are_friends() y Políticas RLS Base (profiles, friendships, follows)
-- Proyecto Supabase: ldtfvpjigzvcagtciipn
-- =========================================================================

-- 1. Función canónica are_friends() de alto rendimiento
CREATE OR REPLACE FUNCTION public.are_friends(user_a UUID, user_b UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
PARALLEL SAFE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_friendships
        WHERE status = 'accepted'
          AND user_id_1 = LEAST(user_a, user_b)
          AND user_id_2 = GREATEST(user_a, user_b)
    );
$$;

GRANT EXECUTE ON FUNCTION public.are_friends(UUID, UUID) TO authenticated, anon;

-- 2. Políticas RLS en public.profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Limpieza de políticas antiguas de lectura/actualización en profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

-- Política de lectura: Únicamente el propio usuario autenticado o administradores
-- El resto del mundo (y anónimos) debe consultar obligatoriamente public_profiles
CREATE POLICY "profiles_select_own"
ON public.profiles FOR SELECT
TO authenticated
USING (
    id = auth.uid()
    OR public.is_admin()
);

-- Política de actualización: Únicamente el propio usuario autenticado o administradores
CREATE POLICY "profiles_update_own"
ON public.profiles FOR UPDATE
TO authenticated
USING (
    id = auth.uid()
    OR public.is_admin()
)
WITH CHECK (
    id = auth.uid()
    OR public.is_admin()
);

-- Revocar SELECT anónimo directo en profiles para blindar datos privados
REVOKE SELECT ON TABLE public.profiles FROM anon;

-- 3. Políticas RLS en public.user_friendships
ALTER TABLE public.user_friendships ENABLE ROW LEVEL SECURITY;

-- Revocación total para anónimos (cero acceso)
REVOKE ALL ON TABLE public.user_friendships FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_friendships TO authenticated;

DROP POLICY IF EXISTS "friendships_select_involved" ON public.user_friendships;
DROP POLICY IF EXISTS "friendships_insert_involved" ON public.user_friendships;
DROP POLICY IF EXISTS "friendships_update_involved" ON public.user_friendships;
DROP POLICY IF EXISTS "friendships_delete_involved" ON public.user_friendships;

CREATE POLICY "friendships_select_involved"
ON public.user_friendships FOR SELECT
TO authenticated
USING (auth.uid() = user_id_1 OR auth.uid() = user_id_2);

CREATE POLICY "friendships_insert_involved"
ON public.user_friendships FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = action_user_id 
    AND (auth.uid() = user_id_1 OR auth.uid() = user_id_2)
    AND status = 'pending'
);

CREATE POLICY "friendships_update_involved"
ON public.user_friendships FOR UPDATE
TO authenticated
USING (auth.uid() = user_id_1 OR auth.uid() = user_id_2)
WITH CHECK (auth.uid() = user_id_1 OR auth.uid() = user_id_2);

CREATE POLICY "friendships_delete_involved"
ON public.user_friendships FOR DELETE
TO authenticated
USING (auth.uid() = user_id_1 OR auth.uid() = user_id_2);

-- 4. Reafirmar permisos en public.user_follows
ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "follows_select_public" ON public.user_follows;
DROP POLICY IF EXISTS "follows_insert_own" ON public.user_follows;
DROP POLICY IF EXISTS "follows_delete_own" ON public.user_follows;

CREATE POLICY "follows_select_public"
ON public.user_follows FOR SELECT
TO public
USING (true);

COMMENT ON POLICY "follows_select_public" ON public.user_follows IS 
  'Decisión de producto deliberada y consciente: el grafo de seguimiento asimétrico (seguidos/seguidores) es de lectura pública universal (incluyendo usuarios anónimos), permitiendo mostrar seguidores en perfiles públicos sin autenticación previa, similar a Twitter/Instagram.';

CREATE POLICY "follows_insert_own"
ON public.user_follows FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "follows_delete_own"
ON public.user_follows FOR DELETE
TO authenticated
USING (auth.uid() = follower_id);
