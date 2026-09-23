-- =========================================================================
-- NOLLI ARCHITECT RELATIONSHIPS — STUDIO & COLLECTIVES DATABASE MIGRATION
-- Permite persistir y sincronizar relaciones y colectivos entre administradores
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.architect_relationships (
  id TEXT PRIMARY KEY,
  studio TEXT NOT NULL,
  members JSONB NOT NULL DEFAULT '[]'::jsonb,
  aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  member_aliases JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_architect_relationships_studio ON public.architect_relationships(studio);

ALTER TABLE public.architect_relationships ENABLE ROW LEVEL SECURITY;

-- 1. Lectura pública para cualquier usuario (catálogo, buscador y fichas)
DROP POLICY IF EXISTS "Public can view architect relationships" ON public.architect_relationships;
CREATE POLICY "Public can view architect relationships" ON public.architect_relationships
  FOR SELECT USING (true);

-- 2. Gestión exclusiva para administradores y editores
DROP POLICY IF EXISTS "Admins can manage architect relationships" ON public.architect_relationships;
CREATE POLICY "Admins can manage architect relationships" ON public.architect_relationships
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'superadmin', 'editor')
    )
  );

-- 3. Trigger para actualizar automáticamente updated_at
CREATE OR REPLACE FUNCTION update_architect_relationships_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_architect_relationships_updated_at ON public.architect_relationships;
CREATE TRIGGER trg_architect_relationships_updated_at
  BEFORE UPDATE ON public.architect_relationships
  FOR EACH ROW
  EXECUTE FUNCTION update_architect_relationships_updated_at();

