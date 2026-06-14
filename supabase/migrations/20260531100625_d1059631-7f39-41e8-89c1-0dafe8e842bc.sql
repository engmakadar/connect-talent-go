-- Page-level permissions for fine-grained admin access
create table public.page_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  page_key text not null,
  granted_by uuid,
  created_at timestamptz not null default now(),
  unique (user_id, page_key)
);

grant select, insert, update, delete on public.page_permissions to authenticated;
grant all on public.page_permissions to service_role;

alter table public.page_permissions enable row level security;

create policy "Users view own page permissions"
on public.page_permissions for select
using (auth.uid() = user_id);

create policy "Admins view all page permissions"
on public.page_permissions for select
using (public.has_role(auth.uid(), 'admin'));

create policy "Admins manage page permissions"
on public.page_permissions for all
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

create index idx_page_permissions_user on public.page_permissions(user_id);

-- Helper: true if user is admin (gets all pages) or has explicit grant
create or replace function public.has_page_permission(_user_id uuid, _page_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(_user_id, 'admin') or exists (
    select 1 from public.page_permissions
    where user_id = _user_id and page_key = _page_key
  );
$$;