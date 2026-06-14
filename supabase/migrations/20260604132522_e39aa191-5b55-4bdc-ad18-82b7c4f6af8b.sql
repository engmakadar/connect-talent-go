
-- 1) Add company_id to profiles for employer/staff users
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON public.profiles(company_id);

-- 2) Helper: is the given user a member of the company that owns the job?
CREATE OR REPLACE FUNCTION public.user_in_company(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _company_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND company_id = _company_id
  );
$$;

-- 3) Relax job update/delete so owners (and same-company teammates) can edit
--    via the front-end, regardless of approval status.
DROP POLICY IF EXISTS "Owners update own non-approved jobs" ON public.jobs;
DROP POLICY IF EXISTS "Owners update own jobs" ON public.jobs;
DROP POLICY IF EXISTS "Owners delete own jobs" ON public.jobs;
DROP POLICY IF EXISTS "Company team updates jobs" ON public.jobs;
DROP POLICY IF EXISTS "Company team deletes jobs" ON public.jobs;

CREATE POLICY "Owners update own jobs"
ON public.jobs FOR UPDATE TO authenticated
USING (auth.uid() = posted_by)
WITH CHECK (auth.uid() = posted_by);

CREATE POLICY "Owners delete own jobs"
ON public.jobs FOR DELETE TO authenticated
USING (auth.uid() = posted_by);

CREATE POLICY "Company team updates jobs"
ON public.jobs FOR UPDATE TO authenticated
USING (public.user_in_company(auth.uid(), company_id))
WITH CHECK (public.user_in_company(auth.uid(), company_id));

CREATE POLICY "Company team deletes jobs"
ON public.jobs FOR DELETE TO authenticated
USING (public.user_in_company(auth.uid(), company_id));
