
DO $$
DECLARE
  v_superadmin uuid := '221b575d-8475-4fc8-a561-fc1d5c294b8e';
BEGIN
  -- Job-related
  DELETE FROM public.job_applications;
  DELETE FROM public.job_edit_history;
  DELETE FROM public.jobs;

  -- Payments / subs
  DELETE FROM public.payment_transactions;
  DELETE FROM public.subscriptions;

  -- Notifications / announcements
  DELETE FROM public.notification_deliveries;
  DELETE FROM public.notifications;
  DELETE FROM public.announcements;

  -- Company structures
  DELETE FROM public.company_team_members;
  DELETE FROM public.company_teams;
  DELETE FROM public.company_member_roles;
  DELETE FROM public.companies;

  -- Per-user data
  DELETE FROM public.page_permissions WHERE user_id <> v_superadmin;
  DELETE FROM public.user_activity_log WHERE user_id <> v_superadmin;
  DELETE FROM public.user_preferences WHERE user_id <> v_superadmin;
  DELETE FROM public.jobseeker_preferences WHERE user_id <> v_superadmin;
  DELETE FROM public.audit_logs WHERE user_id IS NULL OR user_id <> v_superadmin;

  -- Roles + profiles (keep superadmin)
  DELETE FROM public.user_roles WHERE user_id <> v_superadmin;
  DELETE FROM public.profiles WHERE id <> v_superadmin;

  -- Auth users (keep superadmin)
  DELETE FROM auth.users WHERE id <> v_superadmin;
END $$;
