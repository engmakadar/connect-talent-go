GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

DROP POLICY IF EXISTS "Company members manage company app role" ON public.user_roles;
CREATE POLICY "Company members manage company app role"
  ON public.user_roles FOR ALL TO authenticated
  USING (
    role = 'employer'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = user_roles.user_id
        AND p.company_id IS NOT NULL
        AND public.user_in_company(auth.uid(), p.company_id)
    )
  )
  WITH CHECK (
    role = 'employer'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = user_roles.user_id
        AND p.company_id IS NOT NULL
        AND public.user_in_company(auth.uid(), p.company_id)
    )
  );