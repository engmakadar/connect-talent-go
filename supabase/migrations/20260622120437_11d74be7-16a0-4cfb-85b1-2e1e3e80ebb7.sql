
CREATE OR REPLACE FUNCTION public.admin_confirm_user_email(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only Super Admin can confirm user emails.';
  END IF;
  UPDATE auth.users
    SET email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE id = _user_id;
END;
$$;
