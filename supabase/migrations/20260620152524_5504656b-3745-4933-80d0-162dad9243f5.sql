ALTER TABLE public.subscriptions ALTER COLUMN company_id DROP NOT NULL;

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_subject_present;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_subject_present CHECK (company_id IS NOT NULL OR user_id IS NOT NULL);