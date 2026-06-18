
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_admin_employer_exclusion() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_employer_company_link() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_company_member_roles_change() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_profile_company_on_member_role() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_company_on_employer_revoke() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_user_roles_change() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.strip_html_profile_text() TO PUBLIC;
