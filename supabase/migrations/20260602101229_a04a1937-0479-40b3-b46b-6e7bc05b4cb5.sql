-- Job categories
CREATE TABLE public.job_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.job_categories TO anon, authenticated;
GRANT ALL ON public.job_categories TO service_role, authenticated;
ALTER TABLE public.job_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone views categories" ON public.job_categories FOR SELECT USING (true);
CREATE POLICY "Admins manage categories" ON public.job_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Posting type enum
CREATE TYPE public.posting_type AS ENUM ('job', 'tender');

-- Jobs new columns
ALTER TABLE public.jobs
  ADD COLUMN posting_type public.posting_type NOT NULL DEFAULT 'job',
  ADD COLUMN category_id uuid REFERENCES public.job_categories(id) ON DELETE SET NULL,
  ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN tender_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN pending_changes jsonb,
  ADD COLUMN has_pending_edit boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT jobs_description_len CHECK (char_length(description) <= 100000),
  ADD CONSTRAINT jobs_resp_len CHECK (char_length(responsibilities) <= 100000),
  ADD CONSTRAINT jobs_req_len CHECK (char_length(requirements) <= 100000),
  ADD CONSTRAINT jobs_edu_len CHECK (char_length(education) <= 100000);

CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON public.jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_category ON public.jobs(category_id);
CREATE INDEX IF NOT EXISTS idx_jobs_company ON public.jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_page_permissions_user ON public.page_permissions(user_id);

-- Companies verification
CREATE TYPE public.company_verification AS ENUM ('pending', 'verified', 'rejected');
ALTER TABLE public.companies
  ADD COLUMN verification_status public.company_verification NOT NULL DEFAULT 'pending',
  ADD COLUMN subscription_plan text,
  ADD COLUMN verified_at timestamptz,
  ADD COLUMN verified_by uuid;

-- Allow authenticated users to self-enroll a company
DROP POLICY IF EXISTS "Employers create companies" ON public.companies;
CREATE POLICY "Authenticated self-enroll companies" ON public.companies FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Owners view own companies" ON public.companies FOR SELECT TO authenticated
  USING (auth.uid() = created_by);
CREATE POLICY "Owners update own pending companies" ON public.companies FOR UPDATE TO authenticated
  USING (auth.uid() = created_by AND verification_status = 'pending');

-- Seed default categories
INSERT INTO public.job_categories (name, slug) VALUES
  ('Engineering','engineering'),
  ('Design','design'),
  ('Marketing','marketing'),
  ('Sales','sales'),
  ('Operations','operations'),
  ('Finance','finance'),
  ('Healthcare','healthcare'),
  ('Education','education'),
  ('Customer Support','customer-support'),
  ('Other','other')
ON CONFLICT DO NOTHING;

-- Tender documents storage bucket policies (bucket created via tool separately)
CREATE POLICY "Owners view own tender docs" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'tender-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Admins view all tender docs" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'tender-documents' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Owners upload tender docs" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tender-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Owners delete own tender docs" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'tender-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
