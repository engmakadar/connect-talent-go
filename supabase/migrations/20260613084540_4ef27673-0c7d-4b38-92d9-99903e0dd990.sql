
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pending_approval boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_profiles_pending_approval ON public.profiles(pending_approval) WHERE pending_approval = true;

ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'all';
ALTER TABLE public.subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_audience_check;
ALTER TABLE public.subscription_plans ADD CONSTRAINT subscription_plans_audience_check CHECK (audience IN ('all','employer','jobseeker'));
