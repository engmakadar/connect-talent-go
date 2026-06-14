
-- jobs: free-text experience + larger rich-text capacity (≈20k words)
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS experience_text text;

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_description_len;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_resp_len;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_req_len;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_edu_len;

ALTER TABLE public.jobs ADD CONSTRAINT jobs_description_len CHECK (char_length(description) <= 250000);
ALTER TABLE public.jobs ADD CONSTRAINT jobs_resp_len CHECK (char_length(responsibilities) <= 250000);
ALTER TABLE public.jobs ADD CONSTRAINT jobs_req_len CHECK (char_length(requirements) <= 250000);
ALTER TABLE public.jobs ADD CONSTRAINT jobs_edu_len CHECK (char_length(education) <= 250000);

-- companies: extra registration fields
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS hq_location text;

-- Hide expired approved jobs from the public.
DROP POLICY IF EXISTS "Anyone views approved jobs" ON public.jobs;
CREATE POLICY "Anyone views approved non-expired jobs"
  ON public.jobs FOR SELECT
  USING (
    status = 'approved'::job_status
    AND (expires_at IS NULL OR expires_at > now())
  );
