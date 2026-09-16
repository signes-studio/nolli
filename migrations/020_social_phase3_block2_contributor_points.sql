-- =========================================================================
-- NOLLI ARCHITECTURE ATLAS — MIGRATION 020 (FASE 3 - BLOQUE 2)
-- Trigger atómico de puntos por contribución al catálogo: Buildings -> profiles.points_contributor
-- Proyecto Supabase: ldtfvpjigzvcagtciipn
-- =========================================================================

-- 1. Función del trigger para incrementar points_contributor de forma atómica
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
  -- Verificar condición de transición estricta:
  -- Solo sumar cuando pasa de NO publicada a 'publicada' y cuenta con propuesto_por válido
  IF (OLD.estado_revision IS DISTINCT FROM 'publicada' 
      AND NEW.estado_revision = 'publicada' 
      AND NEW.propuesto_por IS NOT NULL) THEN
    
    -- Conversión segura a UUID (maneja tanto columnas de tipo UUID como TEXT)
    BEGIN
      v_user_uuid := NEW.propuesto_por::uuid;
    EXCEPTION WHEN OTHERS THEN
      -- Si propuesto_por no es un UUID válido (ej. texto genérico 'administrador'),
      -- salir limpiamente sin abortar la transacción de publicación
      RETURN NEW;
    END;

    IF v_user_uuid IS NOT NULL THEN
      -- Incremento atómico en profiles para prevenir condiciones de carrera
      -- NOTA: profiles.total_points es una columna STORED generada automáticamente (points_visitor + points_contributor)
      UPDATE public.profiles
      SET points_contributor = points_contributor + v_pts,
          updated_at = now()
      WHERE id = v_user_uuid;

      -- Disparar evaluación inmediata de insignias en el mismo ciclo transaccional
      PERFORM public.check_and_award_badges(v_user_uuid);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Crear Trigger AFTER UPDATE en public."Buildings"
-- Se acota a actualizaciones de la columna estado_revision y se filtra con WHEN
DROP TRIGGER IF EXISTS trg_award_contributor_points ON public."Buildings";
CREATE TRIGGER trg_award_contributor_points
AFTER UPDATE OF estado_revision ON public."Buildings"
FOR EACH ROW
WHEN (OLD.estado_revision IS DISTINCT FROM 'publicada' 
      AND NEW.estado_revision = 'publicada' 
      AND NEW.propuesto_por IS NOT NULL)
EXECUTE FUNCTION public.trg_fn_award_contributor_points();

COMMENT ON FUNCTION public.trg_fn_award_contributor_points() IS
  'Incrementa atómicamente profiles.points_contributor (+25 pts) cuando una obra pasa a estado publicada y evalúa insignias.';

COMMENT ON TRIGGER trg_award_contributor_points ON public."Buildings" IS 
  'Dispara la asignación de 25 puntos de contribución al autor original únicamente en la transición a publicada.';
