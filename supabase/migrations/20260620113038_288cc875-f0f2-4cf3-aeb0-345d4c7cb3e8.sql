
-- 1. Add 'flagged_fraud' to job_status enum (for suspicious jobs)
ALTER TYPE public.job_status ADD VALUE IF NOT EXISTS 'flagged_fraud';

-- 2. Add flagged_reason to companies (for fraud flagging metadata)
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS flagged_reason text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS flagged_fraud boolean NOT NULL DEFAULT false;

-- 3. Employment types lookup table
CREATE TABLE IF NOT EXISTS public.employment_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.employment_types TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.employment_types TO authenticated;
GRANT ALL ON public.employment_types TO service_role;

ALTER TABLE public.employment_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active employment types"
  ON public.employment_types FOR SELECT
  USING (active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage employment types"
  ON public.employment_types FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER employment_types_updated_at
  BEFORE UPDATE ON public.employment_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed defaults matching existing enum
INSERT INTO public.employment_types (name, slug) VALUES
  ('Full Time', 'full_time'),
  ('Part Time', 'part_time'),
  ('Contract', 'contract'),
  ('Internship', 'internship'),
  ('Remote', 'remote')
ON CONFLICT (slug) DO NOTHING;

-- 4. Helper: company has active subscription
CREATE OR REPLACE FUNCTION public.company_has_active_subscription(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE company_id = _company_id
      AND active = true
      AND (valid_until IS NULL OR valid_until > now())
  );
$$;
