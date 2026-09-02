-- Restringe la tabla expuesta por la API REST pública.
-- Ejecutar en el proyecto ldtfvpjigzvcagtciipn antes del 2 de octubre de 2026.

ALTER TABLE public."Buildings" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read published buildings" ON public."Buildings";
DROP POLICY IF EXISTS "Authors can read own pending buildings" ON public."Buildings";
DROP POLICY IF EXISTS "Authenticated users can propose buildings" ON public."Buildings";
DROP POLICY IF EXISTS "Admins can update buildings" ON public."Buildings";
DROP POLICY IF EXISTS "Admins can delete buildings" ON public."Buildings";

CREATE POLICY "Public can read published buildings"
  ON public."Buildings" FOR SELECT
  USING (
    estado_revision = 'publicada'
    OR estado_revision IS NULL
    OR propuesto_por = auth.uid()
    OR public.is_admin()
  );

CREATE POLICY "Authenticated users can propose buildings"
  ON public."Buildings" FOR INSERT
  TO authenticated
  WITH CHECK (
    (propuesto_por = auth.uid() AND estado_revision = 'pendiente')
    OR public.is_admin()
  );

CREATE POLICY "Admins can update buildings"
  ON public."Buildings" FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete buildings"
  ON public."Buildings" FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- Comprobación posterior a la ejecución (debe devolver true):
-- SELECT relrowsecurity
-- FROM pg_class
-- WHERE oid = 'public."Buildings"'::regclass;