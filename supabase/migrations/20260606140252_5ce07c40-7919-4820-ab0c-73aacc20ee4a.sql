
-- 1. Subscription plan catalog
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  billing_interval text NOT NULL CHECK (billing_interval IN ('monthly','annual','none')),
  description text,
  is_active boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subscription_plans TO anon, authenticated;
GRANT ALL ON public.subscription_plans TO service_role;

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Plans are viewable by everyone" ON public.subscription_plans FOR SELECT USING (true);
CREATE POLICY "Admins manage plans" ON public.subscription_plans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_subscription_plans_updated BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed: Free is active; paid tiers exist but inactive until billing is wired
INSERT INTO public.subscription_plans (code, name, price_cents, billing_interval, description, is_active, sort_order) VALUES
  ('free',         'Free Plan',         0,    'none',    'Get started with limited postings.',                 true,  0),
  ('starter_m',    'Starter Monthly',   1500, 'monthly', '$15 / month — small teams hiring occasionally.',     false, 10),
  ('starter_y',    'Starter Annual',    15000,'annual',  '$15/mo billed annually (2 months free).',            false, 11),
  ('growth_m',     'Growth Monthly',    2000, 'monthly', '$20 / month — active hiring with priority review.', false, 20),
  ('growth_y',     'Growth Annual',     20000,'annual',  '$20/mo billed annually (2 months free).',            false, 21),
  ('pro_m',        'Pro Monthly',       4000, 'monthly', '$40 / month — unlimited postings & analytics.',     false, 30),
  ('pro_y',        'Pro Annual',        40000,'annual',  '$40/mo billed annually (2 months free).',            false, 31)
ON CONFLICT (code) DO NOTHING;

-- 2. Guard: a user cannot hold both 'admin' and 'employer' roles.
CREATE OR REPLACE FUNCTION public.enforce_admin_employer_exclusion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conflict_role app_role;
BEGIN
  IF NEW.role = 'admin' THEN conflict_role := 'employer';
  ELSIF NEW.role = 'employer' THEN conflict_role := 'admin';
  ELSE RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.user_id AND role = conflict_role) THEN
    RAISE EXCEPTION 'A user cannot be both Super Admin and Employer.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_roles_exclusion ON public.user_roles;
CREATE TRIGGER trg_user_roles_exclusion BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_admin_employer_exclusion();
