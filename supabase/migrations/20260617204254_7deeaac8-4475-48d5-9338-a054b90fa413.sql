
CREATE OR REPLACE FUNCTION public.sync_profile_company_on_member_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
    SET company_id = NEW.company_id
    WHERE id = NEW.user_id
      AND company_id IS DISTINCT FROM NEW.company_id
      AND company_id IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_company_on_member_role ON public.company_member_roles;
CREATE TRIGGER trg_sync_profile_company_on_member_role
AFTER INSERT ON public.company_member_roles
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_company_on_member_role();
