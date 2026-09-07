-- =========================================================================
-- NOLLI ARCHITECTURE ATLAS — MIGRATION 009
-- Rol intermedio 'editor': permisos de edición e inserción directa de obras,
-- sin permisos de eliminación y sin acceso al directorio de usuarios.
-- Ejecutar en el Editor SQL de Supabase (proyecto ldtfvpjigzvcagtciipn)
-- =========================================================================

-- 1. Función blindada de verificación de rol editor o superior (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_editor()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT (
    public.is_admin()
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'editor'
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'editor'
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'editor'
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_editor() TO authenticated, anon, service_role;

-- 2. Asegurar Row Level Security en la tabla Buildings
ALTER TABLE public."Buildings" ENABLE ROW LEVEL SECURITY;

-- 3. Conceder privilegios básicos a authenticated
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."Buildings" TO authenticated;

-- 4. Actualizar políticas RLS de inserción directa:
-- Editores y administradores pueden insertar obras directamente con cualquier estado (incluyendo 'publicada').
DROP POLICY IF EXISTS "Authenticated users can propose or admins insert buildings" ON public."Buildings";
DROP POLICY IF EXISTS "Authenticated users can propose or admins and editors insert buildings" ON public."Buildings";

CREATE POLICY "Authenticated users can propose or admins and editors insert buildings"
  ON public."Buildings" FOR INSERT
  TO authenticated
  WITH CHECK (
    (propuesto_por = auth.uid() AND estado_revision = 'pendiente')
    OR public.is_editor()
  );

-- 5. Actualizar políticas RLS de modificación (UPDATE):
-- Editores y administradores pueden modificar cualquier obra del catálogo.
DROP POLICY IF EXISTS "Admins can update buildings" ON public."Buildings";
DROP POLICY IF EXISTS "Admins and editors can update buildings" ON public."Buildings";

CREATE POLICY "Admins and editors can update buildings"
  ON public."Buildings" FOR UPDATE
  TO authenticated
  USING (public.is_editor())
  WITH CHECK (public.is_editor());

-- 6. Política RLS de eliminación (DELETE):
-- ESTRICTAMENTE administradores y superadministradores. Los editores NO pueden eliminar obras.
DROP POLICY IF EXISTS "Admins can delete buildings" ON public."Buildings";

CREATE POLICY "Admins can delete buildings"
  ON public."Buildings" FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- 7. Mensaje informativo de finalización
DO $$
BEGIN
  RAISE NOTICE 'Migración 009 completada con éxito: soporte para rol editor habilitado.';
END $$;
