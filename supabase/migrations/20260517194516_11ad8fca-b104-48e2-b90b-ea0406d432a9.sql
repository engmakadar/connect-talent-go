-- Roles enum + table
create type public.app_role as enum ('admin', 'employer', 'jobseeker');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  headline text,
  bio text,
  location text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create type public.job_status as enum ('pending', 'approved', 'rejected');
create type public.employment_type as enum ('full_time', 'part_time', 'contract', 'internship', 'remote');

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  posted_by uuid not null references auth.users(id) on delete cascade,
  title text not null,
  company text not null,
  location text not null,
  employment_type employment_type not null default 'full_time',
  category text not null,
  salary_min integer,
  salary_max integer,
  currency text default 'USD',
  description text not null,
  responsibilities text not null,
  requirements text not null,
  education text not null,
  experience_years integer not null default 0,
  skills text[] default '{}',
  application_url text,
  application_email text,
  status job_status not null default 'pending',
  review_notes text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.jobseeker_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_categories text[] default '{}',
  preferred_locations text[] default '{}',
  preferred_employment_types employment_type[] default '{}',
  min_salary integer,
  skills text[] default '{}',
  resume_url text,
  notify_email boolean not null default true,
  updated_at timestamptz not null default now()
);

-- has_role function (security definer to avoid RLS recursion)
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger trg_jobs_updated before update on public.jobs
  for each row execute function public.set_updated_at();
create trigger trg_prefs_updated before update on public.jobseeker_preferences
  for each row execute function public.set_updated_at();

-- Auto-create profile + default jobseeker role on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  insert into public.user_roles (user_id, role)
  values (new.id, 'jobseeker');
  insert into public.jobseeker_preferences (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.jobs enable row level security;
alter table public.jobseeker_preferences enable row level security;

-- Profiles: publicly viewable, self-editable
create policy "Profiles are viewable by everyone" on public.profiles for select using (true);
create policy "Users update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- User roles: users view own; admins view/manage all
create policy "Users view own roles" on public.user_roles for select using (auth.uid() = user_id);
create policy "Admins view all roles" on public.user_roles for select using (public.has_role(auth.uid(), 'admin'));
create policy "Admins manage roles" on public.user_roles for all using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- Jobs
create policy "Anyone views approved jobs" on public.jobs for select using (status = 'approved');
create policy "Owners view own jobs" on public.jobs for select using (auth.uid() = posted_by);
create policy "Admins view all jobs" on public.jobs for select using (public.has_role(auth.uid(), 'admin'));
create policy "Employers create jobs" on public.jobs for insert with check (
  auth.uid() = posted_by and (public.has_role(auth.uid(), 'employer') or public.has_role(auth.uid(), 'admin'))
);
create policy "Owners update own pending jobs" on public.jobs for update using (
  auth.uid() = posted_by and status = 'pending'
);
create policy "Admins update any job" on public.jobs for update using (public.has_role(auth.uid(), 'admin'));
create policy "Admins delete jobs" on public.jobs for delete using (public.has_role(auth.uid(), 'admin'));
create policy "Owners delete own jobs" on public.jobs for delete using (auth.uid() = posted_by);

-- Preferences
create policy "Users view own preferences" on public.jobseeker_preferences for select using (auth.uid() = user_id);
create policy "Users upsert own preferences" on public.jobseeker_preferences for insert with check (auth.uid() = user_id);
create policy "Users update own preferences" on public.jobseeker_preferences for update using (auth.uid() = user_id);

create index idx_jobs_status_created on public.jobs(status, created_at desc);
create index idx_jobs_category on public.jobs(category);
create index idx_user_roles_user on public.user_roles(user_id);