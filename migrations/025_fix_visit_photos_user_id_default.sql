-- =========================================================================
-- NOLLI ARCHITECTURE ATLAS — MIGRATION 025
-- Blindaje RLS y asignación automática de user_id en visit_photos
-- Proyecto Supabase: ldtfvpjigzvcagtciipn
-- =========================================================================

-- 1. Establecer auth.uid() como valor por defecto de user_id
ALTER TABLE public.visit_photos ALTER COLUMN user_id SET DEFAULT auth.uid();

-- 2. Trigger de respaldo para autoasignar user_id desde auth.uid() si llega nulo
CREATE OR REPLACE FUNCTION public.handle_visit_photos_user_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_visit_photos_user_id ON public.visit_photos;
CREATE TRIGGER trg_visit_photos_user_id
BEFORE INSERT ON public.visit_photos
FOR EACH ROW
EXECUTE FUNCTION public.handle_visit_photos_user_id();

-- 3. Actualizar política INSERT de visit_photos para máxima compatibilidad
DROP POLICY IF EXISTS "visit_photos_insert_policy" ON public.visit_photos;
CREATE POLICY "visit_photos_insert_policy"
ON public.visit_photos FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id OR user_id IS NULL
);

-- 4. Asegurar permisos para authenticated
GRANT INSERT, UPDATE, DELETE ON TABLE public.visit_photos TO authenticated;
GRANT SELECT ON TABLE public.visit_photos TO anon, authenticated;
