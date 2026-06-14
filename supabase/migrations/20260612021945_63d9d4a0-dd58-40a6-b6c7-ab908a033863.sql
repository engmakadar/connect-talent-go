
-- 1. Trial support on subscriptions
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.has_active_subscription(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
    LEFT JOIN public.profiles p ON p.id = _user_id
    WHERE s.active = true
      AND (s.user_id = _user_id OR (p.company_id IS NOT NULL AND s.company_id = p.company_id))
      AND (s.valid_until IS NULL OR s.valid_until > now())
      AND (s.trial_ends_at IS NULL OR s.trial_ends_at > now() OR s.valid_until > now())
  );
$$;

-- 2. Company teams summary helper
CREATE OR REPLACE FUNCTION public.get_company_teams_summary(_company_id uuid)
RETURNS TABLE(team_id uuid, team_name text, member_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.name, COUNT(m.user_id)
  FROM public.company_teams t
  LEFT JOIN public.company_team_members m ON m.team_id = t.id
  WHERE t.company_id = _company_id
  GROUP BY t.id, t.name
  ORDER BY t.name;
$$;

-- 3. Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  link text,
  category text NOT NULL DEFAULT 'system',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, created_at DESC);
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own notifications" ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins manage notifications" ON public.notifications FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 4. Announcements
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  audience text NOT NULL DEFAULT 'all', -- all | employers | jobseekers | company
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  channels jsonb NOT NULL DEFAULT '["in_app"]'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authed reads announcements" ON public.announcements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage announcements" ON public.announcements FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 5. Delivery log
CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL, -- in_app | email | sms
  status text NOT NULL DEFAULT 'pending', -- pending | sent | failed
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.notification_deliveries TO authenticated;
GRANT ALL ON public.notification_deliveries TO service_role;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read deliveries" ON public.notification_deliveries FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
