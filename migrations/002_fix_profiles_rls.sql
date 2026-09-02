-- =========================================================================
-- NOLLI ARCHITECTURE ATLAS — SUPABASE DATABASE MIGRATION
-- Seguridad y Solución de Recursión RLS en public.profiles y Roles
-- =========================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nick TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

-- 1. Limpiar todas las políticas conflictivas o recursivas anteriores
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile or admins all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow select for all" ON public.profiles;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

-- 2. Función helper blindada is_admin (No recursiva, consulta metadata y JWT primero)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT (
    (auth.jwt() ->> 'email') = 'studio.signes@gmail.com'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'superadmin')
    OR (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'superadmin')
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );
$$;

-- 3. Políticas limpias en public.profiles
CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (
    auth.uid() = id 
    OR (auth.jwt() ->> 'email') = 'studio.signes@gmail.com'
    OR public.is_admin()
  )
  WITH CHECK (
    auth.uid() = id 
    OR (auth.jwt() ->> 'email') = 'studio.signes@gmail.com'
    OR public.is_admin()
  );

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (
    auth.uid() = id 
    OR (auth.jwt() ->> 'email') = 'studio.signes@gmail.com'
    OR public.is_admin()
  );

-- 4. Fijar rol de superadmin a la cuenta fundadora
UPDATE public.profiles 
SET role = 'superadmin' 
WHERE email = 'studio.signes@gmail.com';

CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = false)
AS
  SELECT id, nick, avatar_url
  FROM public.profiles;

GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated, anon;
GRANT SELECT ON TABLE public.profiles_public TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;
