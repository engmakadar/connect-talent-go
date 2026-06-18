GRANT INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT INSERT ON public.notifications TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.notification_deliveries TO authenticated;

DROP POLICY IF EXISTS "Admins update all profiles" ON public.profiles;
CREATE POLICY "Admins update all profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Company members update co-worker profiles" ON public.profiles;
CREATE POLICY "Company members update co-worker profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING (company_id IS NOT NULL AND public.user_in_company(auth.uid(), company_id))
  WITH CHECK (company_id IS NOT NULL AND public.user_in_company(auth.uid(), company_id));

DROP POLICY IF EXISTS "Company members manage company roles" ON public.company_member_roles;
CREATE POLICY "Company members manage company roles"
  ON public.company_member_roles FOR ALL TO authenticated
  USING (public.user_in_company(auth.uid(), company_id))
  WITH CHECK (public.user_in_company(auth.uid(), company_id));

DROP POLICY IF EXISTS "Company members manage team members" ON public.company_team_members;
CREATE POLICY "Company members manage team members"
  ON public.company_team_members FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_teams t
      WHERE t.id = team_id AND public.user_in_company(auth.uid(), t.company_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.company_teams t
      WHERE t.id = team_id AND public.user_in_company(auth.uid(), t.company_id)
    )
  );

DROP POLICY IF EXISTS "Admins manage notification deliveries" ON public.notification_deliveries;
CREATE POLICY "Admins manage notification deliveries"
  ON public.notification_deliveries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.user_in_company(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_company_role(uuid, uuid, company_role) TO authenticated, anon;