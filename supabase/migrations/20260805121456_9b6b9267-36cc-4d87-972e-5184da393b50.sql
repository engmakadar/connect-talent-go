-- Services: extra captured details
ALTER TABLE public.skill_workers
  ADD COLUMN IF NOT EXISTS national_id text,
  ADD COLUMN IF NOT EXISTS years_experience integer,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS bookings_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.skill_workers ALTER COLUMN user_id DROP NOT NULL;

DROP POLICY IF EXISTS "Workers manage own profile" ON public.skill_workers;
CREATE POLICY "Workers view own profile" ON public.skill_workers
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.bump_worker_bookings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.skill_workers
    SET bookings_count = bookings_count + 1
    WHERE id = NEW.worker_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_worker_bookings ON public.service_bookings;
CREATE TRIGGER trg_bump_worker_bookings
AFTER INSERT ON public.service_bookings
FOR EACH ROW EXECUTE FUNCTION public.bump_worker_bookings();

-- Freelancer profiles
CREATE TABLE IF NOT EXISTS public.freelancer_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  summary text,
  expertise text,
  skills text[] NOT NULL DEFAULT '{}',
  experience jsonb NOT NULL DEFAULT '[]'::jsonb,
  hourly_rate numeric,
  currency text NOT NULL DEFAULT 'USD',
  photo_url text,
  location text,
  available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.freelancer_profiles TO authenticated;
GRANT SELECT ON public.freelancer_profiles TO anon;
GRANT ALL ON public.freelancer_profiles TO service_role;

ALTER TABLE public.freelancer_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone views freelancer profiles" ON public.freelancer_profiles
  FOR SELECT USING (true);
CREATE POLICY "Freelancers manage own profile" ON public.freelancer_profiles
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins manage freelancer profiles" ON public.freelancer_profiles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_freelancer_profiles_updated ON public.freelancer_profiles;
CREATE TRIGGER trg_freelancer_profiles_updated
BEFORE UPDATE ON public.freelancer_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Contract lifecycle fields on freelance orders
ALTER TABLE public.freelance_orders
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS amount_paid numeric NOT NULL DEFAULT 0;
