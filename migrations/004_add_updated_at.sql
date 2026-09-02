-- =========================================================================
-- Migration: 004_add_updated_at.sql
-- Description: Columna updated_at, trigger automático y default para estado_revision
-- =========================================================================

-- 1. Añadir columna updated_at si no existe
ALTER TABLE public."Buildings" 
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Función para asignar updated_at en cada UPDATE
CREATE OR REPLACE FUNCTION public.set_buildings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS 
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
;

-- 3. Trigger BEFORE UPDATE en public."Buildings"
DROP TRIGGER IF EXISTS trg_buildings_updated_at ON public."Buildings";
CREATE TRIGGER trg_buildings_updated_at
  BEFORE UPDATE ON public."Buildings"
  FOR EACH ROW
  EXECUTE FUNCTION public.set_buildings_updated_at();

-- 4. Actualizar valor por defecto de estado_revision a 'pendiente'
ALTER TABLE public."Buildings" 
  ALTER COLUMN estado_revision SET DEFAULT 'pendiente';
