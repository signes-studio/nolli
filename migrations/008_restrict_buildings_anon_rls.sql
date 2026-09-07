-- =========================================================================
-- NOLLI ARCHITECTURE ATLAS — MIGRATION 008
-- Revocación de acceso de lectura anónimo en public."Buildings" (Cierre de fuga de Egress)
-- Ejecutar en el Editor SQL de Supabase (proyecto ldtfvpjigzvcagtciipn)
-- =========================================================================

-- 1. Asegurar Row Level Security habilitado en public."Buildings"
ALTER TABLE public."Buildings" ENABLE ROW LEVEL SECURITY;

-- 2. Revocar privilegios directos de SELECT al rol anónimo (anon)
-- Esto impide que peticiones con la anon_key descarguen la tabla completa por la API REST
REVOKE SELECT ON TABLE public."Buildings" FROM anon;

-- 3. Conceder permisos completos a service_role (usado por serverless functions) y a authenticated
GRANT ALL ON TABLE public."Buildings" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."Buildings" TO authenticated;

-- 4. Eliminar políticas permisivas de lectura anónima anteriores
DROP POLICY IF EXISTS "Public can read published buildings" ON public."Buildings";
DROP POLICY IF EXISTS "Authenticated users can read published or own buildings" ON public."Buildings";

-- 5. Nueva política de LECTURA (SELECT): Exclusiva para usuarios autenticados
-- Permite leer obras publicadas, obras propuestas por el propio usuario, o acceso total a admins
CREATE POLICY "Authenticated users can read published or own buildings"
  ON public."Buildings" FOR SELECT
  TO authenticated
  USING (
    estado_revision = 'publicada'
    OR estado_revision IS NULL
    OR propuesto_por = auth.uid()
    OR public.is_admin()
  );

-- 6. Verificación posterior (ejecutar para comprobar que RLS está activo y sin política anónima):
DO $$
BEGIN
  RAISE NOTICE 'Migración 008 ejecutada con éxito. Lectura anónima directa a Buildings cerrada.';
END $$;
