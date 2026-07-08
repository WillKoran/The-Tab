-- Guest accounts: let a tab_guests row be claimed by a real auth user,
-- and grant that user scoped, non-host access to the tab they belong to.

ALTER TABLE public.tab_guests
  ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN claim_token UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX tab_guests_claim_token_key ON public.tab_guests(claim_token);

-- SECURITY DEFINER helpers: bypass RLS on their internal query so member-scoped
-- policies below don't self-reference tab_guests and trigger infinite recursion.
CREATE OR REPLACE FUNCTION public.is_tab_member(p_tab_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tab_guests g WHERE g.tab_id = p_tab_id AND g.user_id = auth.uid()
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_tab_member(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_tab_member(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_tab_member_via_item(p_item_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_tab_member((SELECT tab_id FROM public.tab_items WHERE id = p_item_id));
$$;
REVOKE EXECUTE ON FUNCTION public.is_tab_member_via_item(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_tab_member_via_item(UUID) TO authenticated;

-- Members can see the tab itself
CREATE POLICY "member select tabs" ON public.tabs FOR SELECT
  USING (public.is_tab_member(id));

-- Members can see the guest roster
CREATE POLICY "member select guests" ON public.tab_guests FOR SELECT
  USING (public.is_tab_member(tab_id));

-- Members can see and edit item details (name/price/quantity), not add/remove items
CREATE POLICY "member select items" ON public.tab_items FOR SELECT
  USING (public.is_tab_member(tab_id));
CREATE POLICY "member update items" ON public.tab_items FOR UPDATE
  USING (public.is_tab_member(tab_id))
  WITH CHECK (public.is_tab_member(tab_id));

-- Members can see all assignments, but only claim/unclaim their OWN guest row
CREATE POLICY "member select assignments" ON public.tab_item_assignments FOR SELECT
  USING (public.is_tab_member_via_item(item_id));
CREATE POLICY "member claim own assignment" ON public.tab_item_assignments FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.tab_guests g WHERE g.id = guest_id AND g.user_id = auth.uid()));
CREATE POLICY "member unclaim own assignment" ON public.tab_item_assignments FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.tab_guests g WHERE g.id = guest_id AND g.user_id = auth.uid()));

-- Members can read the host's profile (needed for the host's venmo handle on Settle Up)
CREATE POLICY "member select host profile" ON public.profiles FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.tabs t WHERE t.user_id = profiles.id AND public.is_tab_member(t.id)));

-- Atomic claim: exchanges a claim_token for membership on the caller's account.
-- Single UPDATE...RETURNING avoids a race between a read-then-write.
CREATE OR REPLACE FUNCTION public.claim_guest_seat(p_token UUID)
RETURNS TABLE(tab_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  UPDATE public.tab_guests
  SET user_id = auth.uid()
  WHERE claim_token = p_token AND (user_id IS NULL OR user_id = auth.uid())
  RETURNING tab_guests.tab_id INTO tab_id;

  IF tab_id IS NOT NULL THEN
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT true INTO v_exists FROM public.tab_guests WHERE claim_token = p_token;
  IF v_exists IS NULL THEN
    RAISE EXCEPTION 'Invite link not found';
  ELSE
    RAISE EXCEPTION 'This invite has already been used';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_guest_seat(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_guest_seat(UUID) TO authenticated;

-- Realtime: host and guests see each other's changes live
ALTER TABLE public.tab_items REPLICA IDENTITY FULL;
ALTER TABLE public.tab_item_assignments REPLICA IDENTITY FULL;
ALTER TABLE public.tab_guests REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tab_items, public.tab_item_assignments, public.tab_guests;
