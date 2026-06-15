-- Jobseeker resume: single document per user with rich JSONB sections.
CREATE TABLE public.resumes (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Personal Information
  full_name text,
  location text,
  date_of_birth date,
  nationality text,
  phone text,
  email text,
  summary text, -- rich text HTML
  -- Multi-entry sections stored as JSONB arrays of objects.
  -- education:    [{ school, school_type, major, start_date, end_date }]
  -- experience:   [{ company, position, location, start_date, end_date, current, duties (html) }]
  -- certificates: [{ name, date, skills_learned (html) }]
  -- skills:       [{ name, level }]
  -- references:   [{ name, position, company, email, phone, relation }]
  education jsonb NOT NULL DEFAULT '[]'::jsonb,
  experience jsonb NOT NULL DEFAULT '[]'::jsonb,
  certificates jsonb NOT NULL DEFAULT '[]'::jsonb,
  skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resumes TO authenticated;
GRANT ALL ON public.resumes TO service_role;

ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;

-- Owner full access
CREATE POLICY "Users manage their own resume" ON public.resumes
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Super Admins can view all (for moderation/support)
CREATE POLICY "Admins view all resumes" ON public.resumes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER set_resumes_updated_at
  BEFORE UPDATE ON public.resumes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();