-- =========================================================================
-- NOLLI ARCHITECTURE ATLAS — MIGRATION 019 (FASE 3 - BLOQUE 1)
-- Trigger atómico de suma de puntos por visita en building_visits -> profiles.points_visitor
-- Proyecto Supabase: ldtfvpjigzvcagtciipn
-- =========================================================================

-- 1. Stub seguro de check_and_award_badges para evitar errores de referencia en tiempo de ejecución
-- antes de la implementación completa del Bloque 5
CREATE OR REPLACE FUNCTION public.check_and_award_badges(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Stub seguro. La lógica completa se vincula en el Bloque 5.
  NULL;
END;
$$;

-- 2. Función del trigger para incrementar points_visitor de forma atómica
CREATE OR REPLACE FUNCTION public.trg_fn_award_visit_points()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pts INTEGER;
BEGIN
  -- Garantizar que se asignan al menos los puntos por defecto si viene NULL o menor a 0
  v_pts := GREATEST(COALESCE(NEW.points_awarded, 10), 0);

  -- Incremento atómico en profiles para prevenir condiciones de carrera (race conditions)
  -- NOTA: profiles.total_points es una columna STORED generada automáticamente (points_visitor + points_contributor)
  UPDATE public.profiles
  SET points_visitor = points_visitor + v_pts,
      updated_at = now()
  WHERE id = NEW.user_id;

  -- Disparar evaluación inmediata de insignias en el mismo ciclo transaccional
  PERFORM public.check_and_award_badges(NEW.user_id);

  RETURN NEW;
END;
$$;

-- 3. Crear Trigger AFTER INSERT en public.building_visits
DROP TRIGGER IF EXISTS trg_award_visit_points ON public.building_visits;
CREATE TRIGGER trg_award_visit_points
AFTER INSERT ON public.building_visits
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_award_visit_points();

COMMENT ON FUNCTION public.trg_fn_award_visit_points() IS
  'Incrementa atómicamente profiles.points_visitor al insertar una fila en building_visits y llama a check_and_award_badges.';

COMMENT ON TRIGGER trg_award_visit_points ON public.building_visits IS 
  'Incrementa atómicamente profiles.points_visitor al registrarse una visita y evalúa insignias ganadas.';
