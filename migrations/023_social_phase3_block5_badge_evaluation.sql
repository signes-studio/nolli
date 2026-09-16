-- =========================================================================
-- NOLLI ARCHITECTURE ATLAS — MIGRATION 023 (FASE 3 - BLOQUE 5)
-- Motor de evaluación y otorgamiento de insignias: check_and_award_badges()
-- Proyecto Supabase: ldtfvpjigzvcagtciipn
-- =========================================================================

-- 1. Función principal SECURITY DEFINER de evaluación y adjudicación de insignias
CREATE OR REPLACE FUNCTION public.check_and_award_badges(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_points INTEGER;
  r_badge RECORD;
  v_rule_type TEXT;
  v_threshold INTEGER;
  v_awarded BOOLEAN;
  v_progress JSONB;

  -- Variables para soporte de colecciones curatoriales (itinerarios / rutas)
  v_route_slug TEXT;
  v_visited_count INTEGER;
  v_total_route_works INTEGER;
  v_required_ratio NUMERIC;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  -- 1. Obtener puntuación consolidada del perfil
  SELECT total_points INTO v_total_points
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_total_points IS NULL THEN
    RETURN;
  END IF;

  -- 2. Iterar sobre las insignias que el usuario todavía NO ha obtenido
  FOR r_badge IN
    SELECT gb.id, gb.title, gb.points_bonus, gb.criteria_rule
    FROM public.gamification_badges gb
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_badges ub 
      WHERE ub.user_id = p_user_id AND ub.badge_id = gb.id
    )
  LOOP
    v_awarded := false;
    v_progress := '{}'::jsonb;
    v_rule_type := r_badge.criteria_rule->>'type';

    -- CRITERIO TIPO A: Umbral de Puntos Totales ('total_points')
    IF v_rule_type = 'total_points' THEN
      v_threshold := COALESCE((r_badge.criteria_rule->>'threshold')::integer, 0);
      
      IF v_total_points >= v_threshold THEN
        v_awarded := true;
        v_progress := jsonb_build_object(
          'type', 'total_points',
          'current_points', v_total_points,
          'threshold', v_threshold,
          'qualified_at', now()
        );
      END IF;

    -- CRITERIO TIPO B: Colección Curatorial / Itinerario ('curated_collection')
    -- Estructura preparada: evalúa visitas a obras pertenecientes a una ruta temática (public.itineraries)
    ELSIF v_rule_type = 'curated_collection' THEN
      v_route_slug := r_badge.criteria_rule->>'route_slug';
      v_required_ratio := COALESCE((r_badge.criteria_rule->>'required_ratio')::numeric, 1.0);

      IF v_route_slug IS NOT NULL THEN
        -- Contar total de obras en la ruta
        SELECT jsonb_array_length(COALESCE(work_ids, '[]'::jsonb))
        INTO v_total_route_works
        FROM public.itineraries
        WHERE id = v_route_slug;

        IF v_total_route_works > 0 THEN
          -- Contar obras únicas visitadas por el usuario que pertenezcan a la ruta
          SELECT COUNT(DISTINCT bv.building_id)
          INTO v_visited_count
          FROM public.building_visits bv
          WHERE bv.user_id = p_user_id
            AND bv.building_id IN (
              SELECT jsonb_array_elements_text(COALESCE(it.work_ids, '[]'::jsonb))
              FROM public.itineraries it
              WHERE it.id = v_route_slug
            );

          -- Verificar si cumple con el ratio requerido (por defecto 100% de la ruta completada)
          IF (v_visited_count::numeric / v_total_route_works::numeric) >= v_required_ratio THEN
            v_awarded := true;
            v_progress := jsonb_build_object(
              'type', 'curated_collection',
              'route_slug', v_route_slug,
              'visited_count', v_visited_count,
              'total_route_works', v_total_route_works,
              'completion_ratio', round((v_visited_count::numeric / v_total_route_works::numeric), 2),
              'qualified_at', now()
            );
          END IF;
        END IF;
      END IF;
    END IF;

    -- 3. Si se cumple el criterio, insertar atómicamente en user_badges
    IF v_awarded THEN
      INSERT INTO public.user_badges (
        user_id,
        badge_id,
        awarded_at,
        progress_data
      )
      VALUES (
        p_user_id,
        r_badge.id,
        now(),
        v_progress
      )
      ON CONFLICT (user_id, badge_id) DO NOTHING;

      -- Si la insignia incluye bonificación adicional de puntos (points_bonus > 0),
      -- se otorga de forma complementaria al perfil
      IF COALESCE(r_badge.points_bonus, 0) > 0 THEN
        UPDATE public.profiles
        SET points_visitor = points_visitor + r_badge.points_bonus,
            updated_at = now()
        WHERE id = p_user_id;
      END IF;
    END IF;

  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.check_and_award_badges(UUID) IS
  'Evalúa las reglas de insignias pendientes (puntos totales o rutas curatoriales) para un usuario e inserta las alcanzadas.';

-- 2. Asegurar que los triggers de los bloques 1 y 2 disparen check_and_award_badges

-- Hook Bloque 1: building_visits -> profiles.points_visitor + check_and_award_badges
CREATE OR REPLACE FUNCTION public.trg_fn_award_visit_points()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pts INTEGER;
BEGIN
  v_pts := GREATEST(COALESCE(NEW.points_awarded, 10), 0);

  UPDATE public.profiles
  SET points_visitor = points_visitor + v_pts,
      updated_at = now()
  WHERE id = NEW.user_id;

  -- Evaluación inmediata de insignias
  PERFORM public.check_and_award_badges(NEW.user_id);

  RETURN NEW;
END;
$$;

-- Hook Bloque 2: Buildings -> profiles.points_contributor + check_and_award_badges
CREATE OR REPLACE FUNCTION public.trg_fn_award_contributor_points()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_uuid UUID;
  v_pts CONSTANT INTEGER := 25;
BEGIN
  IF (OLD.estado_revision IS DISTINCT FROM 'publicada' 
      AND NEW.estado_revision = 'publicada' 
      AND NEW.propuesto_por IS NOT NULL) THEN
    
    BEGIN
      v_user_uuid := NEW.propuesto_por::uuid;
    EXCEPTION WHEN OTHERS THEN
      RETURN NEW;
    END;

    IF v_user_uuid IS NOT NULL THEN
      UPDATE public.profiles
      SET points_contributor = points_contributor + v_pts,
          updated_at = now()
      WHERE id = v_user_uuid;

      -- Evaluación inmediata de insignias
      PERFORM public.check_and_award_badges(v_user_uuid);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Permisos de ejecución
GRANT EXECUTE ON FUNCTION public.check_and_award_badges(UUID) TO authenticated, anon, service_role;
