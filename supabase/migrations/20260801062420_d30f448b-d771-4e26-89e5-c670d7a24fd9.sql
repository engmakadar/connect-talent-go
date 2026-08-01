-- ============ 1. ATS columns ============
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS preferred_skills text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS shortlisted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS employer_note text,
  ADD COLUMN IF NOT EXISTS score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS job_applications_job_user_uidx
  ON public.job_applications(job_id, user_id);

DROP TRIGGER IF EXISTS trg_job_applications_updated_at ON public.job_applications;
CREATE TRIGGER trg_job_applications_updated_at
  BEFORE UPDATE ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Company team (not just poster) can see applications for their jobs
DROP POLICY IF EXISTS "Company team views applications" ON public.job_applications;
CREATE POLICY "Company team views applications" ON public.job_applications
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.jobs j
                 WHERE j.id = job_applications.job_id
                   AND public.user_in_company(auth.uid(), j.company_id)));

-- Employers / admins can update application status, shortlist, notes
DROP POLICY IF EXISTS "Employers update applications" ON public.job_applications;
CREATE POLICY "Employers update applications" ON public.job_applications
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.jobs j
               WHERE j.id = job_applications.job_id
                 AND (j.posted_by = auth.uid() OR public.user_in_company(auth.uid(), j.company_id)))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.jobs j
               WHERE j.id = job_applications.job_id
                 AND (j.posted_by = auth.uid() OR public.user_in_company(auth.uid(), j.company_id)))
  );

-- Employers can read the profile + resume of applicants to their jobs
DROP POLICY IF EXISTS "Employers view applicant profiles" ON public.profiles;
CREATE POLICY "Employers view applicant profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.job_applications a
    JOIN public.jobs j ON j.id = a.job_id
    WHERE a.user_id = profiles.id
      AND (j.posted_by = auth.uid() OR public.user_in_company(auth.uid(), j.company_id))
  ));

DROP POLICY IF EXISTS "Employers view applicant resumes" ON public.resumes;
CREATE POLICY "Employers view applicant resumes" ON public.resumes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.job_applications a
    JOIN public.jobs j ON j.id = a.job_id
    WHERE a.user_id = resumes.user_id
      AND (j.posted_by = auth.uid() OR public.user_in_company(auth.uid(), j.company_id))
  ));

DROP POLICY IF EXISTS "Employers view applicant preferences" ON public.jobseeker_preferences;
CREATE POLICY "Employers view applicant preferences" ON public.jobseeker_preferences
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.job_applications a
    JOIN public.jobs j ON j.id = a.job_id
    WHERE a.user_id = jobseeker_preferences.user_id
      AND (j.posted_by = auth.uid() OR public.user_in_company(auth.uid(), j.company_id))
  ));

-- ============ 2. Hand-skill portal ============
CREATE TABLE IF NOT EXISTS public.skill_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  full_name text NOT NULL,
  trades text[] NOT NULL DEFAULT '{}',
  bio text,
  phone text,
  location text NOT NULL,
  latitude double precision,
  longitude double precision,
  hourly_rate numeric,
  daily_rate numeric,
  currency text NOT NULL DEFAULT 'USD',
  available boolean NOT NULL DEFAULT true,
  approved boolean NOT NULL DEFAULT true,
  photo_url text,
  rating_avg numeric NOT NULL DEFAULT 0,
  rating_count integer NOT NULL DEFAULT 0,
  jobs_completed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.skill_workers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.skill_workers TO authenticated;
GRANT ALL ON public.skill_workers TO service_role;
ALTER TABLE public.skill_workers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone views approved workers" ON public.skill_workers
  FOR SELECT USING (approved = true);
CREATE POLICY "Workers manage own profile" ON public.skill_workers
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins manage workers" ON public.skill_workers
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.service_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES public.skill_workers(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  customer_name text NOT NULL,
  customer_phone text,
  description text NOT NULL,
  address text NOT NULL,
  scheduled_for timestamptz,
  status text NOT NULL DEFAULT 'requested',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_bookings TO authenticated;
GRANT ALL ON public.service_bookings TO service_role;
ALTER TABLE public.service_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers manage own bookings" ON public.service_bookings
  FOR ALL TO authenticated USING (auth.uid() = customer_id) WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "Workers view own bookings" ON public.service_bookings
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.skill_workers w WHERE w.id = service_bookings.worker_id AND w.user_id = auth.uid()));
CREATE POLICY "Workers update own bookings" ON public.service_bookings
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.skill_workers w WHERE w.id = service_bookings.worker_id AND w.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.skill_workers w WHERE w.id = service_bookings.worker_id AND w.user_id = auth.uid()));
CREATE POLICY "Admins view bookings" ON public.service_bookings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.service_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.service_bookings(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.skill_workers(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  performance_rating integer NOT NULL,
  behaviour_rating integer NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.service_reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_reviews TO authenticated;
GRANT ALL ON public.service_reviews TO service_role;
ALTER TABLE public.service_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone views reviews" ON public.service_reviews FOR SELECT USING (true);
CREATE POLICY "Customers write own reviews" ON public.service_reviews
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "Customers update own reviews" ON public.service_reviews
  FOR UPDATE TO authenticated USING (auth.uid() = customer_id) WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "Admins manage reviews" ON public.service_reviews
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS service_bookings_worker_idx ON public.service_bookings(worker_id);
CREATE INDEX IF NOT EXISTS service_bookings_customer_idx ON public.service_bookings(customer_id);
CREATE INDEX IF NOT EXISTS service_reviews_worker_idx ON public.service_reviews(worker_id);

DROP TRIGGER IF EXISTS trg_skill_workers_updated_at ON public.skill_workers;
CREATE TRIGGER trg_skill_workers_updated_at BEFORE UPDATE ON public.skill_workers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_service_bookings_updated_at ON public.service_bookings;
CREATE TRIGGER trg_service_bookings_updated_at BEFORE UPDATE ON public.service_bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Keep worker rating aggregates in sync
CREATE OR REPLACE FUNCTION public.sync_worker_rating()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.skill_workers w
  SET rating_avg = COALESCE((
        SELECT round(avg((r.performance_rating + r.behaviour_rating)::numeric / 2), 2)
        FROM public.service_reviews r WHERE r.worker_id = w.id), 0),
      rating_count = (SELECT count(*) FROM public.service_reviews r WHERE r.worker_id = w.id)
  WHERE w.id = COALESCE(NEW.worker_id, OLD.worker_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sync_worker_rating() FROM PUBLIC, anon;
DROP TRIGGER IF EXISTS trg_service_reviews_rating ON public.service_reviews;
CREATE TRIGGER trg_service_reviews_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.service_reviews
  FOR EACH ROW EXECUTE FUNCTION public.sync_worker_rating();

-- ============ 3. Company logo storage policies ============
DROP POLICY IF EXISTS "Owners upload company logos" ON storage.objects;
DROP POLICY IF EXISTS "Owners update company logos" ON storage.objects;
DROP POLICY IF EXISTS "Company members delete logos" ON storage.objects;
DROP POLICY IF EXISTS "Public read company logos" ON storage.objects;

CREATE POLICY "Public read company logos" ON storage.objects
  FOR SELECT USING (bucket_id = 'company-logos');

CREATE POLICY "Company members upload logos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'company-logos' AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'admin')
      OR (
        (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
        AND public.user_in_company(auth.uid(), ((storage.foldername(name))[1])::uuid)
      )
    )
  );

CREATE POLICY "Company members update logos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'company-logos' AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'admin')
      OR (
        (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
        AND public.user_in_company(auth.uid(), ((storage.foldername(name))[1])::uuid)
      )
    )
  )
  WITH CHECK (
    bucket_id = 'company-logos' AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'admin')
      OR (
        (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
        AND public.user_in_company(auth.uid(), ((storage.foldername(name))[1])::uuid)
      )
    )
  );

CREATE POLICY "Company members delete logos" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'company-logos' AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'admin')
      OR (
        (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
        AND public.user_in_company(auth.uid(), ((storage.foldername(name))[1])::uuid)
      )
    )
  );