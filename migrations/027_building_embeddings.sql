-- =========================================================================
-- NOLLI BUILDING EMBEDDINGS — PGVECTOR EXTENSION & SIMILARITY SEARCH
-- Almacena representaciones vectoriales semánticas de las obras de Nolli
-- para recomendaciones por afinidad arquitectónica, espacial y estilística.
-- =========================================================================

-- 1. Habilitar extensión pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Tabla building_embeddings
-- Dimensión 1536 correspondiente a text-embedding-3-small (o 512 si se usa voyage-3-lite)
CREATE TABLE IF NOT EXISTS public.building_embeddings (
  building_id TEXT PRIMARY KEY REFERENCES public."Buildings"(id) ON DELETE CASCADE,
  embedding vector(1536) NOT NULL,
  model_version TEXT NOT NULL,
  source_text TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice HNSW para búsqueda aproximada de vecinos más cercanos mediante distancia coseno (<=>)
CREATE INDEX IF NOT EXISTS idx_building_embeddings_hnsw
  ON public.building_embeddings USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_building_embeddings_model
  ON public.building_embeddings(model_version);

-- 3. Row Level Security (RLS)
ALTER TABLE public.building_embeddings ENABLE ROW LEVEL SECURITY;

-- SELECT es intencionalmente público (anon y authenticated) porque los embeddings
-- y sus metadatos asociados son representaciones matemáticas del catálogo público de arquitectura.
-- No contienen datos personales, confidenciales ni relativos a usuarios, y permiten que las vistas
-- públicas y la función de búsqueda consulten similitudes directamente de forma transparente.
DROP POLICY IF EXISTS "Public can view building embeddings" ON public.building_embeddings;
CREATE POLICY "Public can view building embeddings" ON public.building_embeddings
  FOR SELECT USING (true);

-- Solo el rol service_role (backend autenticado y scripts administrativos) tiene permisos
-- de inserción, actualización y borrado sobre los embeddings.
DROP POLICY IF EXISTS "Service role manages building embeddings" ON public.building_embeddings;
CREATE POLICY "Service role manages building embeddings" ON public.building_embeddings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Función de búsqueda híbrida por similitud semántica con boost de categoría
CREATE OR REPLACE FUNCTION match_similar_buildings(
  target_building_id TEXT,
  match_count INT DEFAULT 12,
  same_category_boost FLOAT DEFAULT 0.05
)
RETURNS TABLE (
  id TEXT,
  similarity FLOAT,
  categoria TEXT,
  arquitecto TEXT,
  nombre_obra TEXT,
  año_construccion TEXT,
  place TEXT,
  foto_url TEXT,
  importancia NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  target_embedding vector(1536);
  target_category TEXT;
  target_architect TEXT;
BEGIN
  -- Obtener el embedding y metadatos de la obra de referencia
  SELECT be.embedding, b.categoria, b.arquitecto
  INTO target_embedding, target_category, target_architect
  FROM public.building_embeddings be
  JOIN public."Buildings" b ON b.id = be.building_id
  WHERE be.building_id = target_building_id;

  IF target_embedding IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    b.id,
    (
      -- Similitud coseno: 1 - distancia coseno
      (1 - (be.embedding <=> target_embedding)) +
      -- Boost moderado si comparten categoría tipológica
      CASE WHEN b.categoria IS NOT NULL AND b.categoria = target_category THEN same_category_boost ELSE 0 END
    )::FLOAT AS similarity,
    b.categoria,
    b.arquitecto,
    b.nombre_obra,
    b.año_construccion,
    b.place,
    b.foto_url,
    b.importancia
  FROM public.building_embeddings be
  JOIN public."Buildings" b ON b.id = be.building_id
  WHERE be.building_id != target_building_id
    AND (b.estado_revision = 'publicada' OR b.estado_revision IS NULL)
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;
