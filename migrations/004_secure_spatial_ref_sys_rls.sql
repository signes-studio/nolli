-- spatial_ref_sys es una tabla de referencia de la extensión PostGIS.
-- Sus metadatos pueden leerse públicamente, pero la API no debe poder mutarlos.

ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read spatial reference systems" ON public.spatial_ref_sys;

CREATE POLICY "Public can read spatial reference systems"
  ON public.spatial_ref_sys FOR SELECT
  TO anon, authenticated
  USING (true);