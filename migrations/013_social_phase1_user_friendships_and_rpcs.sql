-- =========================================================================
-- NOLLI ARCHITECTURE ATLAS — MIGRATION 013 (FASE 1 - BLOQUE 3)
-- Tabla user_friendships con orden canónico y funciones RPC seguras
-- Proyecto Supabase: ldtfvpjigzvcagtciipn
-- =========================================================================

-- 1. Crear ENUM friendship_status si no existe
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'friendship_status') THEN
    CREATE TYPE public.friendship_status AS ENUM ('pending', 'accepted', 'declined', 'blocked');
  END IF;
END $$;

-- 2. Crear tabla user_friendships
CREATE TABLE IF NOT EXISTS public.user_friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id_1 UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    user_id_2 UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status public.friendship_status NOT NULL DEFAULT 'pending',
    action_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_canonical_pair CHECK (user_id_1 < user_id_2),
    CONSTRAINT uq_friendship_pair UNIQUE (user_id_1, user_id_2)
);

-- Índices optimizados para lookup rápido de relaciones
CREATE INDEX IF NOT EXISTS idx_friendships_accepted_1 ON public.user_friendships(user_id_1) WHERE status = 'accepted';
CREATE INDEX IF NOT EXISTS idx_friendships_accepted_2 ON public.user_friendships(user_id_2) WHERE status = 'accepted';
CREATE INDEX IF NOT EXISTS idx_friendships_pending ON public.user_friendships(action_user_id) WHERE status = 'pending';

-- 3. Función RPC: request_friendship (Orden canónico automático en backend)
CREATE OR REPLACE FUNCTION public.request_friendship(target_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_user_1 UUID;
    v_user_2 UUID;
    v_existing public.user_friendships%ROWTYPE;
    v_friendship_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'No autenticado: debes iniciar sesión para solicitar amistad';
    END IF;

    IF target_user_id IS NULL THEN
        RAISE EXCEPTION 'El identificador de usuario objetivo no puede ser nulo';
    END IF;

    IF target_user_id = v_caller_id THEN
        RAISE EXCEPTION 'No puedes enviarte una solicitud de amistad a ti mismo';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user_id) THEN
        RAISE EXCEPTION 'El usuario especificado no existe';
    END IF;

    -- Cálculo canónico interno garantizado
    v_user_1 := LEAST(v_caller_id, target_user_id);
    v_user_2 := GREATEST(v_caller_id, target_user_id);

    -- Comprobación explícita de registros existentes con mensajes semánticos
    SELECT * INTO v_existing
    FROM public.user_friendships
    WHERE user_id_1 = v_user_1 AND user_id_2 = v_user_2;

    IF FOUND THEN
        IF v_existing.status = 'accepted' THEN
            RAISE EXCEPTION 'Ya sois amigos';
        ELSIF v_existing.status = 'pending' THEN
            IF v_existing.action_user_id = v_caller_id THEN
                RAISE EXCEPTION 'Ya has enviado una solicitud de amistad a este usuario';
            ELSE
                RAISE EXCEPTION 'Este usuario ya te ha enviado una solicitud de amistad pendiente';
            END IF;
        ELSIF v_existing.status = 'blocked' THEN
            RAISE EXCEPTION 'No es posible enviar la solicitud de amistad en este momento';
        ELSIF v_existing.status = 'declined' THEN
            UPDATE public.user_friendships
            SET status = 'pending',
                action_user_id = v_caller_id,
                updated_at = now()
            WHERE id = v_existing.id
            RETURNING id INTO v_friendship_id;
            RETURN v_friendship_id;
        END IF;
    END IF;

    INSERT INTO public.user_friendships (user_id_1, user_id_2, status, action_user_id)
    VALUES (v_user_1, v_user_2, 'pending', v_caller_id)
    RETURNING id INTO v_friendship_id;

    RETURN v_friendship_id;
END;
$$;

-- 4. Función RPC: respond_friendship (Aceptar o rechazar solicitud)
CREATE OR REPLACE FUNCTION public.respond_friendship(friendship_id UUID, accept BOOLEAN)
RETURNS public.friendship_status
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_row public.user_friendships%ROWTYPE;
    v_new_status public.friendship_status;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'No autenticado: debes iniciar sesión para responder a una solicitud';
    END IF;

    SELECT * INTO v_row
    FROM public.user_friendships
    WHERE id = friendship_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Solicitud de amistad no encontrada';
    END IF;

    IF v_caller_id <> v_row.user_id_1 AND v_caller_id <> v_row.user_id_2 THEN
        RAISE EXCEPTION 'No tienes permiso para responder a esta solicitud de amistad';
    END IF;

    IF v_caller_id = v_row.action_user_id THEN
        RAISE EXCEPTION 'No puedes responder a tu propia solicitud de amistad';
    END IF;

    IF v_row.status <> 'pending' THEN
        RAISE EXCEPTION 'La solicitud no está en estado pendiente (estado actual: %)', v_row.status;
    END IF;

    v_new_status := CASE WHEN accept THEN 'accepted'::public.friendship_status ELSE 'declined'::public.friendship_status END;

    UPDATE public.user_friendships
    SET status = v_new_status,
        action_user_id = v_caller_id,
        updated_at = now()
    WHERE id = friendship_id;

    RETURN v_new_status;
END;
$$;

-- 5. Privilegios de ejecución para usuarios autenticados
REVOKE EXECUTE ON FUNCTION public.request_friendship(UUID) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.respond_friendship(UUID, BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.request_friendship(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_friendship(UUID, BOOLEAN) TO authenticated;
