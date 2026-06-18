
-- 1) Profiles: restrict broad authenticated SELECT
DROP POLICY IF EXISTS "Authenticated can view profiles" ON public.profiles;

CREATE POLICY "Users view own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Admins view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Company members view co-workers"
  ON public.profiles FOR SELECT TO authenticated
  USING (company_id IS NOT NULL AND public.user_in_company(auth.uid(), company_id));

-- 2) Companies: restrict broad authenticated SELECT
DROP POLICY IF EXISTS "Authenticated can view companies" ON public.companies;

CREATE POLICY "Authenticated view verified active companies"
  ON public.companies FOR SELECT TO authenticated
  USING (verification_status = 'verified' AND COALESCE(suspended, false) = false);

CREATE POLICY "Members view their company"
  ON public.companies FOR SELECT TO authenticated
  USING (public.user_in_company(auth.uid(), id));

-- 3) Subscription plans: drop overly-permissive duplicate
DROP POLICY IF EXISTS "Plans are viewable by everyone" ON public.subscription_plans;

-- 4) Fix storage UPDATE policy bug on company-logos (c.name -> objects.name)
DROP POLICY IF EXISTS "Owners update company logos" ON storage.objects;

CREATE POLICY "Owners update company logos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'company-logos'
    AND (
      (auth.uid())::text = (storage.foldername(storage.objects.name))[1]
      OR public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.companies c
        WHERE (c.id)::text = (storage.foldername(storage.objects.name))[1]
          AND (
            c.created_by = auth.uid()
            OR public.has_company_role(auth.uid(), c.id, 'owner')
            OR public.has_company_role(auth.uid(), c.id, 'manager')
          )
      )
    )
  );

-- Also fix the matching INSERT policy for consistency
DROP POLICY IF EXISTS "Owners upload company logos" ON storage.objects;

CREATE POLICY "Owners upload company logos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'company-logos'
    AND (
      (auth.uid())::text = (storage.foldername(storage.objects.name))[1]
      OR public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.companies c
        WHERE (c.id)::text = (storage.foldername(storage.objects.name))[1]
          AND (
            c.created_by = auth.uid()
            OR public.has_company_role(auth.uid(), c.id, 'owner')
            OR public.has_company_role(auth.uid(), c.id, 'manager')
          )
      )
    )
  );

-- 5) user_in_company: also check company_member_roles for consistency
CREATE OR REPLACE FUNCTION public.user_in_company(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _company_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND company_id = _company_id)
    OR EXISTS (SELECT 1 FROM public.company_member_roles WHERE user_id = _user_id AND company_id = _company_id)
  );
$$;
