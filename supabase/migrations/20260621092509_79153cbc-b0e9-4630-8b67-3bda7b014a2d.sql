UPDATE auth.users u
SET email_confirmed_at = now()
FROM public.profiles p
WHERE p.id = u.id
  AND p.email_verified = true
  AND u.email_confirmed_at IS NULL;