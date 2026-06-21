
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_full text;
  v_first text;
  v_last text;
  v_base text;
  v_username text;
  v_n int := 0;
  v_role app_role;
BEGIN
  v_full := coalesce(new.raw_user_meta_data->>'full_name', new.email);
  v_first := coalesce(new.raw_user_meta_data->>'first_name', split_part(v_full, ' ', 1));
  v_last := coalesce(new.raw_user_meta_data->>'last_name', NULLIF(substring(v_full from position(' ' in v_full) + 1), ''));
  v_base := lower(regexp_replace(coalesce(v_first, '') || coalesce(v_last, ''), '[^a-z0-9]', '', 'g'));
  IF v_base = '' THEN v_base := 'user'; END IF;
  v_username := v_base;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = v_username) LOOP
    v_n := v_n + 1;
    v_username := v_base || v_n::text;
  END LOOP;

  INSERT INTO public.profiles (id, email, full_name, first_name, last_name, username)
  VALUES (new.id, new.email, v_full, v_first, v_last, v_username);

  v_role := COALESCE((new.raw_user_meta_data->>'role')::app_role, 'jobseeker');

  -- Employer role requires a company link (enforced by trigger).
  -- Defer assigning the employer role until the user completes Company onboarding.
  IF v_role = 'employer' THEN
    RETURN new;
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, v_role);

  IF v_role = 'jobseeker' THEN
    INSERT INTO public.jobseeker_preferences (user_id) VALUES (new.id);
  END IF;
  RETURN new;
END;
$function$;
