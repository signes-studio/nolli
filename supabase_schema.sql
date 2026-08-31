-- =========================================================================
-- NOLLI ARCHITECTURE ATLAS — SUPABASE DATABASE MIGRATION & SECURITY POLICIES
-- Roles, Privacidad, Reportes, Colecciones Públicas y Monetización
-- =========================================================================

-- 1. EXTENSIONES NECESARIAS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- 2. ENUM / CHECK DE ROLES (INCLUYENDO TESTER)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles') THEN
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
      CHECK (role IN ('user', 'tester', 'admin', 'superadmin'));
  END IF;
END $$;

-- 3. TABLA DE REPORTES DE OBRAS (ERROR / DUPLICADO / UBICACIÓN)
-- Tabla principal: building_reports
CREATE TABLE IF NOT EXISTS public.building_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  building_id BIGINT REFERENCES public.Buildings(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  descripcion TEXT,
  estado TEXT DEFAULT 'pendiente'
);

CREATE INDEX IF NOT EXISTS idx_building_reports_building_id ON public.building_reports(building_id);
CREATE INDEX IF NOT EXISTS idx_building_reports_user_id ON public.building_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_building_reports_estado ON public.building_reports(estado);

ALTER TABLE public.building_reports ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para building_reports:
-- A) Cualquier usuario (anónimo o autenticado) puede enviar un reporte de obra
DROP POLICY IF EXISTS "Allow insert building_reports for all" ON public.building_reports;
CREATE POLICY "Allow insert building_reports for all" ON public.building_reports
  FOR INSERT WITH CHECK (true);

-- B) Solo administradores y superadministradores pueden ver y gestionar reportes
DROP POLICY IF EXISTS "Admins can view and manage building_reports" ON public.building_reports;
CREATE POLICY "Admins can view and manage building_reports" ON public.building_reports
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- Compatibilidad: Tabla reports (alias / alternativa)
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  building_id BIGINT REFERENCES public.Buildings(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  report_type TEXT DEFAULT 'error_datos',
  description TEXT,
  status TEXT DEFAULT 'pending'
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create reports" ON public.reports;
CREATE POLICY "Users can create reports" ON public.reports
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view and manage reports" ON public.reports;
CREATE POLICY "Admins can view and manage reports" ON public.reports
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- 4. COLECCIONES PÚBLICAS Y PRIVACIDAD EN USER_COLLECTIONS
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_collections') THEN
    ALTER TABLE public.user_collections 
      ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_collections_is_public ON public.user_collections(is_public);

-- Políticas RLS para user_collections:
-- A) Lectura: El dueño puede ver sus colecciones Y todo el mundo puede ver las colecciones públicas
DROP POLICY IF EXISTS "Users can view own collections or public collections" ON public.user_collections;
CREATE POLICY "Users can view own collections or public collections" ON public.user_collections
  FOR SELECT USING (
    is_public = true 
    OR auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- B) Modificación: Solo el dueño puede crear/actualizar/borrar sus colecciones
DROP POLICY IF EXISTS "Users can manage own collections" ON public.user_collections;
CREATE POLICY "Users can manage own collections" ON public.user_collections
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. VISIBILIDAD DE ETIQUETAS Y NOTAS PRIVADAS PARA SUPERADMIN
CREATE TABLE IF NOT EXISTS public.user_private_labels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  building_id BIGINT REFERENCES public.Buildings(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  notes TEXT,
  color TEXT DEFAULT '#E84E1B'
);

ALTER TABLE public.user_private_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own private labels, superadmin sees all" ON public.user_private_labels;
CREATE POLICY "Users see own private labels, superadmin sees all" ON public.user_private_labels
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'superadmin'
    )
  );

-- Vista relacional para Superadmin con datos del autor original
CREATE OR REPLACE VIEW public.view_superadmin_private_labels AS
SELECT 
  upl.id AS label_id,
  upl.created_at,
  upl.building_id,
  b.nombre_obra AS building_name,
  upl.label,
  upl.notes,
  upl.color,
  upl.user_id AS author_id,
  p.email AS author_email,
  p.nick AS author_nick,
  p.first_name || ' ' || COALESCE(p.last_name, '') AS author_full_name,
  p.role AS author_role
FROM public.user_private_labels upl
LEFT JOIN public.Buildings b ON upl.building_id = b.id
LEFT JOIN public.profiles p ON upl.user_id = p.id;

-- Asegurar que la vista ejecute con el contexto y políticas RLS del usuario invocador
ALTER VIEW public.view_superadmin_private_labels SET (security_invoker = true);

-- 6. TRIGGER DE SEGURIDAD Y MODERACIÓN AUTOMÁTICA DE OBRAS
-- Fuerza automáticamente estado_revision = 'pendiente' para cualquier rol no administrativo,
-- impidiendo que peticiones manipuladas a la API REST publiquen obras directamente.
CREATE OR REPLACE FUNCTION public.enforce_building_revision_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_role TEXT;
BEGIN
  -- Obtener el rol del usuario autenticado actual desde public.profiles
  SELECT role INTO v_user_role
  FROM public.profiles
  WHERE id = auth.uid();

  -- Si el usuario no está autenticado o su rol no es 'admin' ni 'superadmin'
  IF v_user_role IS NULL OR v_user_role NOT IN ('admin', 'superadmin') THEN
    -- En inserción, forzar siempre estado 'pendiente'
    IF TG_OP = 'INSERT' THEN
      NEW.estado_revision := 'pendiente';
    -- En actualización por usuario regular, bloquear la auto-aprobación
    ELSIF TG_OP = 'UPDATE' THEN
      IF NEW.estado_revision IS DISTINCT FROM OLD.estado_revision THEN
        NEW.estado_revision := OLD.estado_revision;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_building_revision ON public.Buildings;
CREATE TRIGGER trg_enforce_building_revision
  BEFORE INSERT OR UPDATE ON public.Buildings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_building_revision_status();

-- 8. POLÍTICAS RLS ANTI-RECURSIÓN PARA PUBLIC.PROFILES Y HELPER SECURITY DEFINER IS_ADMIN
-- Soluciona el error "infinite recursion detected in policy for relation profiles"
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
  );
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow select for all" ON public.profiles;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

-- Lectura: Perfiles públicos legibles sin subconsulta recursiva
CREATE POLICY "Public profiles are viewable by everyone" 
  ON public.profiles FOR SELECT 
  USING (true);

-- Actualización: Cada usuario puede actualizar su propio perfil (o admin)
CREATE POLICY "Users can update own profile" 
  ON public.profiles FOR UPDATE 
  USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());

-- Inserción: Cada usuario autenticado puede insertar su propio perfil
CREATE POLICY "Users can insert own profile" 
  ON public.profiles FOR INSERT 
  WITH CHECK (auth.uid() = id);

-- 7. FUNCIÓN RPC PARA RADAR GEODÉSICO EN TIEMPO REAL (POSTGIS)
CREATE OR REPLACE FUNCTION public.get_buildings_within_radius(
  user_lat DOUBLE PRECISION,
  user_lon DOUBLE PRECISION,
  radius_meters DOUBLE PRECISION
)
RETURNS TABLE (
  id BIGINT,
  nombre_obra TEXT,
  foto_url TEXT,
  arquitecto TEXT,
  año_construccion INT,
  categoria TEXT,
  place TEXT,
  latitud DOUBLE PRECISION,
  longitud DOUBLE PRECISION,
  distance_meters DOUBLE PRECISION
) 
LANGUAGE sql STABLE
AS $$
  SELECT 
    b.id,
    b.nombre_obra,
    b.foto_url,
    b.arquitecto,
    b.año_construccion,
    b.categoria,
    b.place,
    b.latitud,
    b.longitud,
    ST_DistanceSphere(
      ST_MakePoint(b.longitud, b.latitud),
      ST_MakePoint(user_lon, user_lat)
    ) AS distance_meters
  FROM public.Buildings b
  WHERE 
    b.latitud IS NOT NULL 
    AND b.longitud IS NOT NULL
    AND (b.estado_revision = 'publicada' OR b.estado_revision IS NULL)
    AND ST_DistanceSphere(
      ST_MakePoint(b.longitud, b.latitud),
      ST_MakePoint(user_lon, user_lat)
    ) <= radius_meters
  ORDER BY distance_meters ASC;
$$;

-- 8. GESTIÓN DE PRESENCIA Y ÚLTIMA CONEXIÓN DE USUARIOS (SUPERADMIN DIRECTORY)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles') THEN
    ALTER TABLE public.profiles 
      ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW();
    
    CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at ON public.profiles(last_seen_at DESC);
  END IF;
END $$;

-- Permitir a cada usuario actualizar su presencia y timestamp de última conexión
DROP POLICY IF EXISTS "Users can update own presence" ON public.profiles;
CREATE POLICY "Users can update own presence" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Permitir a administradores y superadministradores leer todos los perfiles con presencia
DROP POLICY IF EXISTS "Admins can view all profiles with presence" ON public.profiles;
CREATE POLICY "Admins can view all profiles with presence" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin')
    )
  );


