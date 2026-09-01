-- Seguridad: public.profiles contiene email, rol y otros datos personales; la vista limita la exposicion anonima a la identidad publica minima.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Instalaciones anteriores pueden no tener todavía los datos de identidad pública.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nick TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile or admins all profiles" ON public.profiles;

CREATE POLICY "Users can view own profile or admins all profiles"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.is_admin());

CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = false)
AS
  SELECT id, nick, avatar_url
  FROM public.profiles;

REVOKE SELECT ON TABLE public.profiles FROM anon;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT SELECT ON TABLE public.profiles_public TO anon, authenticated;
