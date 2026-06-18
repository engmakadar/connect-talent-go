
-- PROFILES: remove public read; require auth
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Authenticated can view profiles"
  ON public.profiles FOR SELECT TO authenticated USING (true);

-- COMPANIES: split public vs authenticated read
DROP POLICY IF EXISTS "Companies are viewable by everyone" ON public.companies;
CREATE POLICY "Public can view verified active companies"
  ON public.companies FOR SELECT TO anon
  USING (verification_status = 'verified' AND COALESCE(suspended, false) = false);
CREATE POLICY "Authenticated can view companies"
  ON public.companies FOR SELECT TO authenticated USING (true);

-- SUBSCRIPTIONS: restrict to owner/members/admin
DROP POLICY IF EXISTS "Anyone views subscriptions" ON public.subscriptions;
CREATE POLICY "Members view their subscriptions"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR has_role(auth.uid(), 'admin')
    OR (company_id IS NOT NULL AND company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    ))
    OR (company_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.company_member_roles
      WHERE user_id = auth.uid() AND company_id = subscriptions.company_id
    ))
  );

-- STORAGE: company-logos ownership
DROP POLICY IF EXISTS "Authenticated upload company logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update company logos" ON storage.objects;

CREATE POLICY "Owners upload company logos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'company-logos'
    AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.companies c
        WHERE c.id::text = (storage.foldername(name))[1]
          AND (c.created_by = auth.uid()
               OR public.has_company_role(auth.uid(), c.id, 'owner'::company_role)
               OR public.has_company_role(auth.uid(), c.id, 'manager'::company_role))
      )
    )
  );

CREATE POLICY "Owners update company logos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'company-logos'
    AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.companies c
        WHERE c.id::text = (storage.foldername(name))[1]
          AND (c.created_by = auth.uid()
               OR public.has_company_role(auth.uid(), c.id, 'owner'::company_role)
               OR public.has_company_role(auth.uid(), c.id, 'manager'::company_role))
      )
    )
  );

-- STORAGE: tender-documents update policy
CREATE POLICY "Owners update tender docs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'tender-documents'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'tender-documents'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );
