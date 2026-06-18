-- Restore EXECUTE on helper functions referenced by RLS policies.
-- These are SECURITY DEFINER and safely read-only; RLS uses them inline.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.user_in_company(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_company_role(uuid, uuid, company_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_page_permission(uuid, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_job_apply_email(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_teams_summary(uuid) TO authenticated;