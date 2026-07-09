-- Global guest identity: a phone number identifies one person across every
-- tab they're added to, instead of each tab_guests row being an island that
-- can only ever be claimed on its own. Claiming one invite now claims every
-- tab that phone number has an outstanding seat on, so guests don't pile up
-- half-claimed across tabs.
--
-- Wrapped in a transaction, and guarded with IF NOT EXISTS / DROP-then-CREATE
-- where cheap, so this file is safe to re-run if an earlier attempt failed
-- partway through.

BEGIN;

CREATE TABLE IF NOT EXISTS public.guest_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL UNIQUE CHECK (phone_number ~ '^\+[1-9]\d{6,14}$'),
  display_name TEXT,
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Must exist before the RLS policy below, which references it.
ALTER TABLE public.tab_guests
  ADD COLUMN IF NOT EXISTS guest_identity_id UUID REFERENCES public.guest_identities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tab_guests_guest_identity_id_idx ON public.tab_guests(guest_identity_id);

ALTER TABLE public.guest_identities ENABLE ROW LEVEL SECURITY;

-- Visible to the person it belongs to once claimed, and to anyone who can
-- already see a tab this identity has a seat on (host or fellow member).
DROP POLICY IF EXISTS "read own or tab-linked guest identity" ON public.guest_identities;
CREATE POLICY "read own or tab-linked guest identity" ON public.guest_identities FOR SELECT
  USING (
    auth_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.tab_guests g
      JOIN public.tabs t ON t.id = g.tab_id
      WHERE g.guest_identity_id = guest_identities.id
        AND (t.user_id = auth.uid() OR public.is_tab_member(t.id))
    )
  );
-- No INSERT/UPDATE policy: identities are only ever created/read through the
-- upsert_guest_identity and claim_guest_seat SECURITY DEFINER functions below.

-- Upsert-by-phone: returns the existing identity unchanged if the phone
-- number is already known, otherwise creates a new (unclaimed) one.
-- LANGUAGE sql (not plpgsql): a plpgsql function with RETURNS TABLE(phone_number ...)
-- auto-declares a local `phone_number` variable, which collides with the bare
-- (unqualifiable) `phone_number` in ON CONFLICT (phone_number) below and raises
-- "column reference is ambiguous". Plain SQL functions have no such variable.
CREATE OR REPLACE FUNCTION public.upsert_guest_identity(p_phone_number TEXT, p_display_name TEXT DEFAULT NULL)
RETURNS TABLE(id UUID, phone_number TEXT, display_name TEXT, auth_user_id UUID, created_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.guest_identities AS gi (phone_number, display_name)
  VALUES (p_phone_number, p_display_name)
  ON CONFLICT (phone_number) DO UPDATE SET phone_number = gi.phone_number
  RETURNING gi.id, gi.phone_number, gi.display_name, gi.auth_user_id, gi.created_at;
$$;
REVOKE EXECUTE ON FUNCTION public.upsert_guest_identity(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_guest_identity(TEXT, TEXT) TO authenticated, service_role;

-- Claiming a seat now also claims every other unclaimed tab_guests row that
-- shares the same phone-linked identity, in one call. The primary token
-- lookup stays a single atomic UPDATE...RETURNING (as before) to avoid a
-- read-then-write race on that specific token; the identity-wide fan-out
-- that follows only ever touches rows that were already unclaimed.
CREATE OR REPLACE FUNCTION public.claim_guest_seat(p_token UUID)
RETURNS TABLE(tab_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tab_id UUID;
  v_guest_identity_id UUID;
  v_exists BOOLEAN;
BEGIN
  UPDATE public.tab_guests
  SET user_id = auth.uid()
  WHERE claim_token = p_token AND (user_id IS NULL OR user_id = auth.uid())
  RETURNING tab_guests.tab_id, tab_guests.guest_identity_id INTO v_tab_id, v_guest_identity_id;

  IF v_tab_id IS NULL THEN
    SELECT true INTO v_exists FROM public.tab_guests WHERE claim_token = p_token;
    IF v_exists IS NULL THEN
      RAISE EXCEPTION 'Invite link not found';
    ELSE
      RAISE EXCEPTION 'This invite has already been used';
    END IF;
  END IF;

  IF v_guest_identity_id IS NULL THEN
    tab_id := v_tab_id;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.guest_identities
  SET auth_user_id = auth.uid()
  WHERE id = v_guest_identity_id AND (auth_user_id IS NULL OR auth_user_id = auth.uid());

  RETURN QUERY
  UPDATE public.tab_guests
  SET user_id = auth.uid()
  WHERE guest_identity_id = v_guest_identity_id
    AND (user_id IS NULL OR user_id = auth.uid())
  RETURNING tab_guests.tab_id;
END;
$$;

COMMIT;
