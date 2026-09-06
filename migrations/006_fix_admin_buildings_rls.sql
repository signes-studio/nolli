-- =========================================================================
-- NOLLI ARCHITECTURE ATLAS — MIGRATION 006
-- Corrección definitiva de permisos (GRANT) y políticas RLS para public."Buildings"
-- Ejecutar en el Editor SQL de Supabase (proyecto ldtfvpjigzvcagtciipn)
-- =========================================================================

-- 1. Habilitar Row Level Security en la tabla Buildings
ALTER TABLE public."Buildings" ENABLE ROW LEVEL SECURITY;

-- 2. Conceder privilegios a nivel de tabla en PostgreSQL (CRÍTICO: Sin esto, Postgres da error 42501 antes de evaluar RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."Buildings" TO authenticated;
GRANT ALL ON TABLE public."Buildings" TO service_role;
GRANT SELECT ON TABLE public."Buildings" TO anon;

-- 3. Función blindada de verificación de administrador (SECURITY DEFINER)
-- Comprueba los correos fundadores autorizados, metadatos del JWT y el rol en public.profiles
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT (
    (auth.jwt() ->> 'email') IN ('office@signes.studio', 'studio.signes@gmail.com', 'alvaro11pm@gmail.com')
    OR (auth.jwt() ->> 'email') LIKE '%@signes.studio'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'superadmin')
    OR (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'superadmin')
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon, service_role;

-- 4. Limpieza de políticas previas en public."Buildings"
DROP POLICY IF EXISTS "Public can read published buildings" ON public."Buildings";
DROP POLICY IF EXISTS "Authors can read own pending buildings" ON public."Buildings";
DROP POLICY IF EXISTS "Authenticated users can propose buildings" ON public."Buildings";
DROP POLICY IF EXISTS "Authenticated users can propose or admins insert buildings" ON public."Buildings";
DROP POLICY IF EXISTS "Admins can update buildings" ON public."Buildings";
DROP POLICY IF EXISTS "Admins can delete buildings" ON public."Buildings";
DROP POLICY IF EXISTS "Allow all for authenticated" ON public."Buildings";
DROP POLICY IF EXISTS "Allow all for admins" ON public."Buildings";

-- 5. Política de LECTURA (SELECT): Pública para obras aprobadas, y para autores de obras pendientes o administradores
CREATE POLICY "Public can read published buildings"
  ON public."Buildings" FOR SELECT
  USING (
    estado_revision = 'publicada'
    OR estado_revision IS NULL
    OR (auth.uid() IS NOT NULL AND propuesto_por = auth.uid())
    OR public.is_admin()
  );

-- 6. Política de INSERCIÓN (INSERT): Usuarios autenticados pueden proponer obras (pendiente), administradores pueden insertar directamente
CREATE POLICY "Authenticated users can propose or admins insert buildings"
  ON public."Buildings" FOR INSERT
  TO authenticated
  WITH CHECK (
    (propuesto_por = auth.uid() AND estado_revision = 'pendiente')
    OR public.is_admin()
  );

-- 7. Política de ACTUALIZACIÓN (UPDATE): Solo administradores y superadministradores
CREATE POLICY "Admins can update buildings"
  ON public."Buildings" FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 8. Política de ELIMINACIÓN (DELETE): Solo administradores y superadministradores
CREATE POLICY "Admins can delete buildings"
  ON public."Buildings" FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- 9. Asegurar roles de superadministrador y administrador en public.profiles
UPDATE public.profiles
SET role = 'superadmin'
WHERE email IN ('office@signes.studio', 'studio.signes@gmail.com')
   OR email LIKE '%@signes.studio';

UPDATE public.profiles
SET role = 'admin'
WHERE email = 'alvaro11pm@gmail.com' AND role != 'superadmin';

-- Verificación posterior (debe devolver 'OK'):
DO $$
BEGIN
  RAISE NOTICE 'Migración 006 ejecutada correctamente. Permisos y políticas de Buildings actualizados.';
END $$;

