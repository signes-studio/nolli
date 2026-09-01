-- Migration: 001_optimize_buildings_schema.sql
-- Description: Agregar índices, funciones normalizadas y columnas generadas en Buildings
-- Phase: CRÍTICA - Optimización de datos y puntuación

-- 1. Crear función normalizadora de categoría (lado servidor)
create or replace function public.normalize_categoria(value text)
returns text language plpgsql immutable as $$
declare
  v text := lower(coalesce(value, ''));
begin
  if v like '%resid%' or v like '%vivienda%' or v like '%casa%' or v like '%hogar%' then return 'residencial'; end if;
  if v like '%equip%' or v like '%educ%' or v like '%escuela%' or v like '%museo%' or v like '%hospital%' then return 'dotacional_equipamiento'; end if;
  if v like '%industrial%' or v like '%logist%' or v like '%fabrica%' or v like '%taller%' then return 'industrial_logistico'; end if;
  if v like '%relig%' or v like '%funer%' or v like '%iglesia%' or v like '%capilla%' then return 'religioso_funerario'; end if;
  if v like '%comercial%' or v like '%oficina%' or v like '%hotel%' or v like '%tienda%' or v like '%negocio%' then return 'comercial_terciario'; end if;
  if v like '%parque%' or v like '%plaza%' or v like '%paisaje%' or v like '%verde%' or v like '%jardin%' then return 'espacio_publico_paisaje'; end if;
  if v like '%infraestruct%' or v like '%puente%' or v like '%urban%' or v like '%viaducto%' or v like '%estacion%' then return 'infraestructura_urbanismo'; end if;
  return 'otro';
end $$;

-- 2. Habilitar extensiones necesarias
create extension if not exists pg_trgm;
create extension if not exists postgis;

-- 3. Agregar columnas generadas si no existen
alter table public."Buildings"
  add column if not exists categoria_norm text generated always as (public.normalize_categoria(categoria)) stored;

-- Solo agregar geom si postgis está disponible
do $$
begin
  alter table public."Buildings"
    add column if not exists geom geography(point, 4326)
      generated always as (
        case
          when latitud is not null and longitud is not null
          then st_setsrid(st_makepoint(longitud, latitud), 4326)::geography
          else null
        end
      ) stored;
exception when others then
  raise notice 'PostGIS geography column skipped: %', sqlerrm;
end $$;

-- 4. Crear índices de filtrado público (estado_revision, importancia, categoría, año)
create index if not exists idx_buildings_public_filters
  on public."Buildings" (estado_revision, importancia, categoria_norm)
  where estado_revision = 'publicada' or estado_revision is null;

-- 5. Índice para búsqueda rápida por estado + importancia (admin)
create index if not exists idx_buildings_admin_filters
  on public."Buildings" (estado_revision, importancia, año_construccion desc);

-- 6. Índice de año de construcción (para itinerarios por época)
create index if not exists idx_buildings_year
  on public."Buildings" (año_construccion)
  where año_construccion is not null;

-- 7. Índice geoespacial si postgis está habilitado
do $$
begin
  create index if not exists idx_buildings_geom
    on public."Buildings" using gist (geom)
    where estado_revision = 'publicada' or estado_revision is null;
exception when others then
  raise notice 'GiST geometry index skipped: %', sqlerrm;
end $$;

-- 8. Índice trigram para búsqueda de arquitecto por LIKE
create index if not exists idx_buildings_architecto_trgm
  on public."Buildings" using gin (lower(arquitecto) gin_trgm_ops);

-- 9. Índice para búsqueda de nombre de obra
create index if not exists idx_buildings_nombre_trgm
  on public."Buildings" using gin (lower(nombre_obra) gin_trgm_ops);

-- 10. Índice para lugar/ciudad
create index if not exists idx_buildings_place_trgm
  on public."Buildings" using gin (lower(place) gin_trgm_ops);

-- Comentarios documentales
comment on function public.normalize_categoria(text) is 'Normaliza categoría de obra a valor estándar. Ejecutada en el servidor para consistencia.';
comment on column public."Buildings".categoria_norm is 'Categoría normalizada, generada automáticamente de categoria para indexación eficiente.';
comment on column public."Buildings".geom is 'Geometría GIS (point) en WGS84 para consultas geoespaciales. Generada automáticamente de latitud/longitud.';
