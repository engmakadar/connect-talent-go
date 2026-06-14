-- Add search_path to set_updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Revoke direct execution from anon/authenticated for internal functions
revoke execute on function public.set_updated_at() from anon, authenticated, public;
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.has_role(uuid, public.app_role) from anon, public;
-- authenticated keeps EXECUTE on has_role since RLS policies need it