
-- 1. Enforce Employer ↔ company linkage at the DB level
CREATE OR REPLACE FUNCTION public.enforce_employer_company_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_has_membership boolean;
BEGIN
  IF NEW.role = 'employer' THEN
    SELECT company_id INTO v_company_id FROM public.profiles WHERE id = NEW.user_id;
    SELECT EXISTS (SELECT 1 FROM public.company_member_roles WHERE user_id = NEW.user_id)
      INTO v_has_membership;
    IF v_company_id IS NULL AND NOT v_has_membership THEN
      RAISE EXCEPTION 'Employer role requires a company link. Assign the user to a company first.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_employer_company_link ON public.user_roles;
CREATE CONSTRAINT TRIGGER trg_enforce_employer_company_link
AFTER INSERT OR UPDATE ON public.user_roles
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_employer_company_link();

-- 2. When Employer role is removed and no company memberships remain, clear profiles.company_id
CREATE OR REPLACE FUNCTION public.clear_company_on_employer_revoke()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role = 'employer' THEN
    IF NOT EXISTS (SELECT 1 FROM public.company_member_roles WHERE user_id = OLD.user_id) THEN
      UPDATE public.profiles SET company_id = NULL WHERE id = OLD.user_id;
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_company_on_employer_revoke ON public.user_roles;
CREATE TRIGGER trg_clear_company_on_employer_revoke
AFTER DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.clear_company_on_employer_revoke();

-- 3. Audit triggers for user_roles
CREATE OR REPLACE FUNCTION public.audit_user_roles_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_company_id uuid;
BEGIN
  SELECT company_id INTO v_company_id FROM public.profiles
    WHERE id = COALESCE(NEW.user_id, OLD.user_id);

  INSERT INTO public.audit_logs(user_id, action, resource_type, resource_id, metadata)
  VALUES (
    v_actor,
    CASE TG_OP WHEN 'INSERT' THEN 'user.role_change' WHEN 'DELETE' THEN 'user.role_change' ELSE 'user.role_change' END,
    'user_roles',
    COALESCE(NEW.user_id::text, OLD.user_id::text),
    jsonb_build_object(
      'op', TG_OP,
      'previous_role', CASE WHEN TG_OP <> 'INSERT' THEN OLD.role::text END,
      'new_role',      CASE WHEN TG_OP <> 'DELETE' THEN NEW.role::text END,
      'company_id',    v_company_id,
      'actor_id',      v_actor
    )
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_user_roles ON public.user_roles;
CREATE TRIGGER trg_audit_user_roles
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.audit_user_roles_change();

-- 4. Audit triggers for company_member_roles
CREATE OR REPLACE FUNCTION public.audit_company_member_roles_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  INSERT INTO public.audit_logs(user_id, action, resource_type, resource_id, metadata)
  VALUES (
    v_actor,
    'company.enroll',
    'company_member_roles',
    COALESCE(NEW.user_id::text, OLD.user_id::text),
    jsonb_build_object(
      'op', TG_OP,
      'previous_company_id', CASE WHEN TG_OP <> 'INSERT' THEN OLD.company_id END,
      'new_company_id',      CASE WHEN TG_OP <> 'DELETE' THEN NEW.company_id END,
      'previous_role',       CASE WHEN TG_OP <> 'INSERT' THEN OLD.role::text END,
      'new_role',            CASE WHEN TG_OP <> 'DELETE' THEN NEW.role::text END,
      'actor_id',            v_actor
    )
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_company_member_roles ON public.company_member_roles;
CREATE TRIGGER trg_audit_company_member_roles
AFTER INSERT OR UPDATE OR DELETE ON public.company_member_roles
FOR EACH ROW EXECUTE FUNCTION public.audit_company_member_roles_change();

-- 5. Strip HTML from text fields on profiles for clean storage
CREATE OR REPLACE FUNCTION public.strip_html_profile_text()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.full_name  := regexp_replace(COALESCE(NEW.full_name,  ''), '<[^>]*>', '', 'g');
  NEW.first_name := regexp_replace(COALESCE(NEW.first_name, ''), '<[^>]*>', '', 'g');
  NEW.last_name  := regexp_replace(COALESCE(NEW.last_name,  ''), '<[^>]*>', '', 'g');
  NEW.headline   := regexp_replace(COALESCE(NEW.headline,   ''), '<[^>]*>', '', 'g');
  IF NEW.full_name  = '' THEN NEW.full_name  := NULL; END IF;
  IF NEW.first_name = '' THEN NEW.first_name := NULL; END IF;
  IF NEW.last_name  = '' THEN NEW.last_name  := NULL; END IF;
  IF NEW.headline   = '' THEN NEW.headline   := NULL; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_strip_html_profile_text ON public.profiles;
CREATE TRIGGER trg_strip_html_profile_text
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.strip_html_profile_text();
