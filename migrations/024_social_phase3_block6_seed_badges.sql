-- =========================================================================
-- NOLLI ARCHITECTURE ATLAS — MIGRATION 024 (FASE 3 - BLOQUE 6)
-- Seed de insignias iniciales en gamification_badges
-- Proyecto Supabase: ldtfvpjigzvcagtciipn
-- =========================================================================

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
