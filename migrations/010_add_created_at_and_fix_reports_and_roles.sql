-- =========================================================================
-- NOLLI ARCHITECTURE ATLAS — MIGRATION 010
-- 1. Columna created_at en tabla Buildings (fecha y hora de alta para ordenación)
-- 2. Eliminación definitiva de rol 'tester' y habilitación de 'editor' en public.profiles
-- 3. Concesión de privilegios y políticas RLS para gestión del buzón de incidencias
-- Ejecutar en el Editor SQL de Supabase (proyecto ldtfvpjigzvcagtciipn)
-- =========================================================================

-- 1. COLUMNA CREATED_AT EN BUILDINGS
ALTER TABLE public."Buildings"
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

-- Inicializar created_at en obras existentes que lo tengan NULL
UPDATE public."Buildings"
SET created_at = COALESCE(updated_at, timezone('utc'::text, now()))
WHERE created_at IS NULL;

-- Índice para ordenación eficiente por obras más recientes
CREATE INDEX IF NOT EXISTS idx_buildings_created_at ON public."Buildings"(created_at DESC);

-- 2. ELIMINACIÓN DE ROL 'TESTER' Y REGULARIZACIÓN DE 'EDITOR' EN PROFILES
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles' AND table_schema = 'public') THEN
    -- Migrar usuarios con rol 'tester' a 'user'
    UPDATE public.profiles SET role = 'user' WHERE role = 'tester';
    
    -- Actualizar restricción CHECK a ('user', 'editor', 'admin', 'superadmin')
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
      CHECK (role IN ('user', 'editor', 'admin', 'superadmin'));
  END IF;
END $$;

-- 3. POLÍTICA DE ACTUALIZACIÓN DE ROLES EN PROFILES (Permitir a administradores cambiar roles sin recursión RLS)
DROP POLICY IF EXISTS "Admins can update user roles" ON public.profiles;
CREATE POLICY "Admins can update user roles"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = id 
    OR public.is_admin()
  )
  WITH CHECK (
    auth.uid() = id 
    OR public.is_admin()
  );

-- 4. PERMISOS Y GESTIÓN DEL BUZÓN DE INCIDENCIAS (building_reports)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.building_reports TO authenticated;
GRANT ALL ON TABLE public.building_reports TO service_role;

-- Limpiar políticas anteriores conflictivas en building_reports
DROP POLICY IF EXISTS "Admins can view and manage building_reports" ON public.building_reports;
DROP POLICY IF EXISTS "Curators and admins can view and manage building_reports" ON public.building_reports;

-- Permitir a administradores y editores ver, actualizar (resolver/descartar) y eliminar reportes
CREATE POLICY "Curators and admins can view and manage building_reports"
  ON public.building_reports FOR ALL
  TO authenticated
  USING (public.is_editor())
  WITH CHECK (public.is_editor());

-- 5. Mensaje de éxito
DO $$
BEGIN
  RAISE NOTICE 'Migración 010 ejecutada correctamente: created_at en Buildings, rol editor sin tester y buzón de incidencias habilitado.';
END $$;

