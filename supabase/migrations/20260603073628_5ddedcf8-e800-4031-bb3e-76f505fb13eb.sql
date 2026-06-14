
-- =========== COMPANIES: KYC, subscription, suspension ===========
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS kyc_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS kyc_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS registration_number text,
  ADD COLUMN IF NOT EXISTS years_experience integer,
  ADD COLUMN IF NOT EXISTS project_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS suspended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'self';

-- =========== PROFILES: username, names, KYC, suspension ===========
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text UNIQUE,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS kyc_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS kyc_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS suspended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deactivated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;

-- =========== PAGE PERMISSIONS: active flag (for company default pages) ===========
ALTER TABLE public.page_permissions
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- =========== SUBSCRIPTIONS ===========
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  plan text NOT NULL DEFAULT 'free',
  active boolean NOT NULL DEFAULT false,
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscriptions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone views subscriptions" ON public.subscriptions
  FOR SELECT USING (true);
CREATE POLICY "Admins manage subscriptions" ON public.subscriptions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========== AUDIT LOGS ===========
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  actor_email text,
  action text NOT NULL,
  resource_type text,
  resource_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view audit logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated insert own audit log" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- =========== JOB APPLICATIONS ===========
CREATE TABLE IF NOT EXISTS public.job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'applied',
  match_score integer,
  cover_letter text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_applications TO authenticated;
GRANT ALL ON public.job_applications TO service_role;
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own applications" ON public.job_applications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Job owners view applications" ON public.job_applications
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.posted_by = auth.uid()));
CREATE POLICY "Admins view all applications" ON public.job_applications
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users insert own applications" ON public.job_applications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own applications" ON public.job_applications
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- =========== INDEXES FOR PERFORMANCE ===========
CREATE INDEX IF NOT EXISTS idx_jobs_status_type_created ON public.jobs (status, posting_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_company_id ON public.jobs (company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_posted_by ON public.jobs (posted_by);
CREATE INDEX IF NOT EXISTS idx_jobs_has_pending_edit ON public.jobs (has_pending_edit) WHERE has_pending_edit = true;
CREATE INDEX IF NOT EXISTS idx_page_permissions_user_key ON public.page_permissions (user_id, page_key);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON public.audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_user ON public.job_applications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_job ON public.job_applications (job_id);

-- =========== JOBS: stricter edit policy — approved jobs require admin update ===========
DROP POLICY IF EXISTS "Owners update own pending jobs" ON public.jobs;
CREATE POLICY "Owners update own non-approved jobs"
  ON public.jobs FOR UPDATE
  USING (auth.uid() = posted_by AND status <> 'approved');

-- =========== Update handle_new_user to populate names + username ===========
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_full text;
  v_first text;
  v_last text;
  v_base text;
  v_username text;
  v_n int := 0;
  v_role app_role;
BEGIN
  v_full := coalesce(new.raw_user_meta_data->>'full_name', new.email);
  v_first := coalesce(new.raw_user_meta_data->>'first_name', split_part(v_full, ' ', 1));
  v_last := coalesce(new.raw_user_meta_data->>'last_name', NULLIF(substring(v_full from position(' ' in v_full) + 1), ''));
  v_base := lower(regexp_replace(coalesce(v_first, '') || coalesce(v_last, ''), '[^a-z0-9]', '', 'g'));
  IF v_base = '' THEN v_base := 'user'; END IF;
  v_username := v_base;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = v_username) LOOP
    v_n := v_n + 1;
    v_username := v_base || v_n::text;
  END LOOP;

  INSERT INTO public.profiles (id, email, full_name, first_name, last_name, username)
  VALUES (new.id, new.email, v_full, v_first, v_last, v_username);

  v_role := COALESCE((new.raw_user_meta_data->>'role')::app_role, 'jobseeker');
  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, v_role);

  IF v_role = 'jobseeker' THEN
    INSERT INTO public.jobseeker_preferences (user_id) VALUES (new.id);
  END IF;
  RETURN new;
END;
$function$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
