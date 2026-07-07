
-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  venmo_handle TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- REGULARS
CREATE TABLE public.regulars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.regulars TO authenticated;
GRANT ALL ON public.regulars TO service_role;
ALTER TABLE public.regulars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own regulars all" ON public.regulars FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- TABS
CREATE TABLE public.tabs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Dinner',
  table_label TEXT DEFAULT '',
  tax_value NUMERIC NOT NULL DEFAULT 0,
  tax_is_percent BOOLEAN NOT NULL DEFAULT true,
  tip_value NUMERIC NOT NULL DEFAULT 20,
  tip_is_percent BOOLEAN NOT NULL DEFAULT true,
  settled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tabs TO authenticated;
GRANT ALL ON public.tabs TO service_role;
ALTER TABLE public.tabs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tabs all" ON public.tabs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- GUESTS on a tab
CREATE TABLE public.tab_guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_id UUID NOT NULL REFERENCES public.tabs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_you BOOLEAN NOT NULL DEFAULT false,
  venmo_handle TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tab_guests TO authenticated;
GRANT ALL ON public.tab_guests TO service_role;
ALTER TABLE public.tab_guests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "guests via own tab" ON public.tab_guests FOR ALL
  USING (EXISTS (SELECT 1 FROM public.tabs t WHERE t.id = tab_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tabs t WHERE t.id = tab_id AND t.user_id = auth.uid()));

-- ITEMS on a tab
CREATE TABLE public.tab_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_id UUID NOT NULL REFERENCES public.tabs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  category TEXT NOT NULL DEFAULT 'food',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tab_items TO authenticated;
GRANT ALL ON public.tab_items TO service_role;
ALTER TABLE public.tab_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "items via own tab" ON public.tab_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.tabs t WHERE t.id = tab_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tabs t WHERE t.id = tab_id AND t.user_id = auth.uid()));

-- ITEM ASSIGNMENTS (many-to-many)
CREATE TABLE public.tab_item_assignments (
  item_id UUID NOT NULL REFERENCES public.tab_items(id) ON DELETE CASCADE,
  guest_id UUID NOT NULL REFERENCES public.tab_guests(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, guest_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tab_item_assignments TO authenticated;
GRANT ALL ON public.tab_item_assignments TO service_role;
ALTER TABLE public.tab_item_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assignments via own tab" ON public.tab_item_assignments FOR ALL
  USING (EXISTS (SELECT 1 FROM public.tab_items i JOIN public.tabs t ON t.id = i.tab_id WHERE i.id = item_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tab_items i JOIN public.tabs t ON t.id = i.tab_id WHERE i.id = item_id AND t.user_id = auth.uid()));

-- Trigger: auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tabs_updated_at BEFORE UPDATE ON public.tabs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
