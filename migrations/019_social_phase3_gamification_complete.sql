-- =========================================================================
-- NOLLI ARCHITECTURE ATLAS — CONSOLIDATED MIGRATION: FASE 3 (PUNTOS E INSIGNIAS)
-- Proyecto Supabase: ldtfvpjigzvcagtciipn
-- Ejecutar este archivo completo en el Editor SQL de Supabase para desplegar
-- todos los bloques (1 al 6) en una sola operación transaccional limpia.
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- BLOQUE 3: ENUMS Y TABLA "gamification_badges" (CATÁLOGO DE INSIGNIAS)
-- -------------------------------------------------------------------------

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'badge_tier') THEN
    CREATE TYPE public.badge_tier AS ENUM ('bronze', 'silver', 'gold', 'platinum');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'badge_category') THEN
    CREATE TYPE public.badge_category AS ENUM ('visits', 'curation', 'contribution', 'special');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.gamification_badges (
    id TEXT PRIMARY KEY, -- Slug semántico inmutable (ej. 'urbanista-curioso')
    title TEXT NOT NULL,
    description TEXT,
    tier public.badge_tier NOT NULL DEFAULT 'bronze',
    category public.badge_category NOT NULL DEFAULT 'visits',
    icon_url TEXT,
    points_bonus INTEGER NOT NULL DEFAULT 0,
    criteria_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gamification_badges_tier ON public.gamification_badges(tier);
CREATE INDEX IF NOT EXISTS idx_gamification_badges_category ON public.gamification_badges(category);

ALTER TABLE public.gamification_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gamification_badges_public_select" ON public.gamification_badges;
DROP POLICY IF EXISTS "gamification_badges_admin_insert" ON public.gamification_badges;
DROP POLICY IF EXISTS "gamification_badges_admin_update" ON public.gamification_badges;
DROP POLICY IF EXISTS "gamification_badges_admin_delete" ON public.gamification_badges;

-- Catálogo maestro público: visible para cualquier visitante o usuario (anon y auth)
CREATE POLICY "gamification_badges_public_select"
ON public.gamification_badges FOR SELECT
USING (true);

CREATE POLICY "gamification_badges_admin_insert"
ON public.gamification_badges FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "gamification_badges_admin_update"
ON public.gamification_badges FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "gamification_badges_admin_delete"
ON public.gamification_badges FOR DELETE
TO authenticated
USING (public.is_admin());

GRANT SELECT ON TABLE public.gamification_badges TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.gamification_badges TO authenticated;
GRANT ALL ON TABLE public.gamification_badges TO service_role;


-- -------------------------------------------------------------------------
-- BLOQUE 4: TABLA "user_badges" (INSIGNIAS OBTENIDAS POR USUARIOS)
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    badge_id TEXT NOT NULL REFERENCES public.gamification_badges(id) ON DELETE CASCADE,
    awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    progress_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT uq_user_badges_user_badge UNIQUE (user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON public.user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_badge_id ON public.user_badges(badge_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_awarded_at ON public.user_badges(awarded_at DESC);

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_badges_public_select" ON public.user_badges;
DROP POLICY IF EXISTS "user_badges_admin_insert" ON public.user_badges;
DROP POLICY IF EXISTS "user_badges_admin_update" ON public.user_badges;
DROP POLICY IF EXISTS "user_badges_admin_delete" ON public.user_badges;

-- Lectura pública para perfiles de usuario y leaderboard social
CREATE POLICY "user_badges_public_select"
ON public.user_badges FOR SELECT
USING (true);

-- Asignación restringida: NUNCA inserción directa por usuarios web.
-- Solo mediante función SECURITY DEFINER en el servidor o admins
CREATE POLICY "user_badges_admin_insert"
ON public.user_badges FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "user_badges_admin_update"
ON public.user_badges FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "user_badges_admin_delete"
ON public.user_badges FOR DELETE
TO authenticated
USING (public.is_admin());

GRANT SELECT ON TABLE public.user_badges TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.user_badges TO authenticated;
GRANT ALL ON TABLE public.user_badges TO service_role;


-- -------------------------------------------------------------------------
-- BLOQUE 5: FUNCIÓN DE EVALUACIÓN Y ADJUDICACIÓN DE INSIGNIAS
-- -------------------------------------------------------------------------

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

  -- Variables para itinerarios y colecciones curatoriales
  v_route_slug TEXT;
  v_visited_count INTEGER;
  v_total_route_works INTEGER;
  v_required_ratio NUMERIC;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT total_points INTO v_total_points
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_total_points IS NULL THEN
    RETURN;
  END IF;

  -- Iterar sobre insignias aún no conseguidas
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

    -- CRITERIO A: total_points
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

    -- CRITERIO B: curated_collection (itinerarios de public.itineraries)
    ELSIF v_rule_type = 'curated_collection' THEN
      v_route_slug := r_badge.criteria_rule->>'route_slug';
      v_required_ratio := COALESCE((r_badge.criteria_rule->>'required_ratio')::numeric, 1.0);

      IF v_route_slug IS NOT NULL THEN
        SELECT jsonb_array_length(COALESCE(work_ids, '[]'::jsonb))
        INTO v_total_route_works
        FROM public.itineraries
        WHERE id = v_route_slug;

        IF v_total_route_works > 0 THEN
          SELECT COUNT(DISTINCT bv.building_id)
          INTO v_visited_count
          FROM public.building_visits bv
          WHERE bv.user_id = p_user_id
            AND bv.building_id IN (
              SELECT jsonb_array_elements_text(COALESCE(it.work_ids, '[]'::jsonb))
              FROM public.itineraries it
              WHERE it.id = v_route_slug
            );

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

    -- Otorgar si califica
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

      -- Aplicar bonus si corresponde
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

GRANT EXECUTE ON FUNCTION public.check_and_award_badges(UUID) TO authenticated, anon, service_role;


-- -------------------------------------------------------------------------
-- BLOQUE 1: TRIGGER DE PUNTOS POR VISITA (building_visits -> profiles)
-- -------------------------------------------------------------------------

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

DROP TRIGGER IF EXISTS trg_award_visit_points ON public.building_visits;
CREATE TRIGGER trg_award_visit_points
AFTER INSERT ON public.building_visits
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_award_visit_points();


-- -------------------------------------------------------------------------
-- BLOQUE 2: TRIGGER DE PUNTOS POR CONTRIBUCIÓN (Buildings -> profiles)
-- -------------------------------------------------------------------------

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
  -- Solo en la transición estricta a 'publicada' con propuesto_por presente
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

DROP TRIGGER IF EXISTS trg_award_contributor_points ON public."Buildings";
CREATE TRIGGER trg_award_contributor_points
AFTER UPDATE OF estado_revision ON public."Buildings"
FOR EACH ROW
WHEN (OLD.estado_revision IS DISTINCT FROM 'publicada' 
      AND NEW.estado_revision = 'publicada' 
      AND NEW.propuesto_por IS NOT NULL)
EXECUTE FUNCTION public.trg_fn_award_contributor_points();


-- -------------------------------------------------------------------------
-- BLOQUE 6: INSIGNIAS INICIALES DE EJEMPLO
-- -------------------------------------------------------------------------

INSERT INTO public.gamification_badges (
  id,
  title,
  description,
  tier,
  category,
  icon_url,
  points_bonus,
  criteria_rule
)
VALUES
  (
    'urbanista-curioso',
    'Urbanista Curioso',
    'Alcanza tus primeros 100 puntos descubriendo obras arquitectónicas y documentando la ciudad.',
    'bronze',
    'visits',
    '/icons/badges/badge-urbanista-curioso.svg',
    0,
    '{"type": "total_points", "threshold": 100}'::jsonb
  ),
  (
    'explorador',
    'Explorador',
    'Supera los 250 puntos trazando tus propios recorridos y ampliando tu radio urbano.',
    'silver',
    'visits',
    '/icons/badges/badge-explorador.svg',
    0,
    '{"type": "total_points", "threshold": 250}'::jsonb
  ),
  (
    'rastreador',
    'Rastreador',
    'Supera los 500 puntos catalogando y verificando patrimonio sobre el terreno.',
    'silver',
    'visits',
    '/icons/badges/badge-rastreador.svg',
    0,
    '{"type": "total_points", "threshold": 500}'::jsonb
  ),
  (
    'leyenda-local',
    'Leyenda Local',
    'Alcanza los 1000 puntos convirtiéndote en una referencia viva del atlas arquitectónico.',
    'gold',
    'visits',
    '/icons/badges/badge-leyenda-local.svg',
    50,
    '{"type": "total_points", "threshold": 1000}'::jsonb
  ),
  (
    'gran-contribuidor',
    'Gran Contribuidor',
    'Supera los 2000 puntos aportando y verificando nuevas obras maestras al atlas abierto.',
    'platinum',
    'contribution',
    '/icons/badges/badge-gran-contribuidor.svg',
    100,
    '{"type": "total_points", "threshold": 2000}'::jsonb
  )
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  tier = EXCLUDED.tier,
  category = EXCLUDED.category,
  icon_url = EXCLUDED.icon_url,
  points_bonus = EXCLUDED.points_bonus,
  criteria_rule = EXCLUDED.criteria_rule,
  updated_at = now();

COMMIT;
