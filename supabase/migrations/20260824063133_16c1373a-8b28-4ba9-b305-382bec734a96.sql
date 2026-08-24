CREATE TABLE IF NOT EXISTS public.company_followers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.company_followers TO authenticated;
GRANT ALL ON public.company_followers TO service_role;

ALTER TABLE public.company_followers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own follows"
  ON public.company_followers FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users follow companies"
  ON public.company_followers FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users unfollow companies"
  ON public.company_followers FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Public follower count (no per-user data exposed).
CREATE OR REPLACE FUNCTION public.company_follower_count(_company_id uuid)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*) FROM public.company_followers WHERE company_id = _company_id
$$;
GRANT EXECUTE ON FUNCTION public.company_follower_count(uuid) TO anon, authenticated;

-- Whether the current signed-in user follows a company.
CREATE OR REPLACE FUNCTION public.is_company_follower(_company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_followers
    WHERE company_id = _company_id AND user_id = auth.uid()
  )
$$;
GRANT EXECUTE ON FUNCTION public.is_company_follower(uuid) TO authenticated;