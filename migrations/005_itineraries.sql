-- =========================================================================
-- NOLLI ITINERARIES — CURATED ROUTES & MOVEMENTS DATABASE MIGRATION
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.itineraries (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  tag TEXT DEFAULT 'MOVIMIENTO MODERNO',
  color TEXT DEFAULT '#E84E1B',
  stops TEXT,
  work_ids JSONB DEFAULT '[]'::jsonb,
  year_range JSONB,
  decade_filter INTEGER,
  architects_filter JSONB,
  architect_filter TEXT,
  category_filter TEXT,
  added_by_filter TEXT,
  keywords JSONB,
  bbox_filter JSONB,
  active BOOLEAN DEFAULT true,
  order_num INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_itineraries_active ON public.itineraries(active);
CREATE INDEX IF NOT EXISTS idx_itineraries_order ON public.itineraries(order_num);

ALTER TABLE public.itineraries ENABLE ROW LEVEL SECURITY;

-- 1. Lectura pública para itinerarios activos (y todo para administradores)
DROP POLICY IF EXISTS "Public can view active itineraries" ON public.itineraries;
CREATE POLICY "Public can view active itineraries" ON public.itineraries
  FOR SELECT USING (active = true OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'superadmin')
  ));

-- 2. Gestión completa exclusiva para administradores
DROP POLICY IF EXISTS "Admins can manage itineraries" ON public.itineraries;
CREATE POLICY "Admins can manage itineraries" ON public.itineraries
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- 3. Trigger para actualizar timestamp updated_at
CREATE OR REPLACE FUNCTION update_itineraries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_itineraries_updated_at ON public.itineraries;
CREATE TRIGGER trg_itineraries_updated_at
  BEFORE UPDATE ON public.itineraries
  FOR EACH ROW
  EXECUTE FUNCTION update_itineraries_updated_at();

