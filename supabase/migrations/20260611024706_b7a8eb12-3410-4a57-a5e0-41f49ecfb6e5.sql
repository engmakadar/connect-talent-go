
CREATE TABLE public.company_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_teams TO authenticated;
GRANT ALL ON public.company_teams TO service_role;
ALTER TABLE public.company_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage all teams" ON public.company_teams FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Company members read own teams" ON public.company_teams FOR SELECT TO authenticated
  USING (public.user_in_company(auth.uid(), company_id));
CREATE TRIGGER company_teams_updated_at BEFORE UPDATE ON public.company_teams
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.company_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.company_teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role_in_team text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_team_members TO authenticated;
GRANT ALL ON public.company_team_members TO service_role;
ALTER TABLE public.company_team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage all team members" ON public.company_team_members FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Company members read own team members" ON public.company_team_members FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.company_teams t WHERE t.id = team_id AND public.user_in_company(auth.uid(), t.company_id)));

CREATE TYPE public.company_role AS ENUM ('owner', 'manager', 'recruiter', 'viewer');
CREATE TABLE public.company_member_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.company_role NOT NULL DEFAULT 'viewer',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_member_roles TO authenticated;
GRANT ALL ON public.company_member_roles TO service_role;
ALTER TABLE public.company_member_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage all company roles" ON public.company_member_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Members view own company roles" ON public.company_member_roles FOR SELECT TO authenticated
  USING (public.user_in_company(auth.uid(), company_id));

CREATE OR REPLACE FUNCTION public.has_company_role(_user_id uuid, _company_id uuid, _role public.company_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.company_member_roles
    WHERE user_id = _user_id AND company_id = _company_id AND role = _role)
$$;

CREATE TABLE public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  plan_id uuid REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  method text NOT NULL,
  reference text,
  receipt_url text,
  status text NOT NULL DEFAULT 'pending',
  confirmed_by uuid,
  confirmed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_transactions TO authenticated;
GRANT ALL ON public.payment_transactions TO service_role;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own transactions" ON public.payment_transactions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users create own transactions" ON public.payment_transactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins manage transactions" ON public.payment_transactions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER payment_transactions_updated_at BEFORE UPDATE ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.user_preferences (
  user_id uuid PRIMARY KEY,
  language text NOT NULL DEFAULT 'en',
  region text NOT NULL DEFAULT 'SO',
  theme text NOT NULL DEFAULT 'system',
  smart_notifications jsonb NOT NULL DEFAULT '{"new_jobs":true,"new_tenders":true,"application_updates":true,"company_updates":true}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;
GRANT ALL ON public.user_preferences TO service_role;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own preferences" ON public.user_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER user_preferences_updated_at BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.user_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  ip text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.user_activity_log TO authenticated;
GRANT ALL ON public.user_activity_log TO service_role;
ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own activity" ON public.user_activity_log FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users insert own activity" ON public.user_activity_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE INDEX user_activity_log_user_id_created_at_idx ON public.user_activity_log (user_id, created_at DESC);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='subscription_plans' AND policyname='Anyone reads active plans') THEN
    EXECUTE 'CREATE POLICY "Anyone reads active plans" ON public.subscription_plans FOR SELECT TO anon, authenticated USING (is_active IS TRUE)';
  END IF;
END $$;
GRANT SELECT ON public.subscription_plans TO anon;
