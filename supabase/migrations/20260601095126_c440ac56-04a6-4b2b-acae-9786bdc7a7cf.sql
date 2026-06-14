-- Companies (employer organizations) registry
CREATE TABLE public.companies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  logo_url text,
  website text,
  contact_email text,
  contact_phone text,
  location text,
  description text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.companies TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Companies are viewable by everyone"
ON public.companies FOR SELECT USING (true);

CREATE POLICY "Admins manage companies"
ON public.companies FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Employers create companies"
ON public.companies FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'employer') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER set_companies_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Job edit history: track every change after first approval
CREATE TABLE public.job_edit_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid NOT NULL,
  edited_by uuid,
  changes jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.job_edit_history TO authenticated;
GRANT ALL ON public.job_edit_history TO service_role;

ALTER TABLE public.job_edit_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view job history"
ON public.job_edit_history FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated insert job history"
ON public.job_edit_history FOR INSERT TO authenticated
WITH CHECK (auth.uid() = edited_by);

-- Storage bucket for company logos
INSERT INTO storage.buckets (id, name, public) VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Company logos public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'company-logos');

CREATE POLICY "Authenticated upload company logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'company-logos');

CREATE POLICY "Authenticated update company logos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'company-logos');
