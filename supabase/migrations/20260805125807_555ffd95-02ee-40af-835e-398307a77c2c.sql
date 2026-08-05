ALTER TABLE public.jobseeker_preferences
  ADD COLUMN IF NOT EXISTS education_level text,
  ADD COLUMN IF NOT EXISTS years_experience integer;

CREATE OR REPLACE FUNCTION public.notify_matching_jobseekers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'approved' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' THEN RETURN NEW; END IF;

  INSERT INTO public.notifications (user_id, title, body, link, category)
  SELECT p.user_id,
         'New job matching your preferences',
         'A new opening "' || NEW.title || '" at ' || NEW.company || ' (' || NEW.location || ') matches your job preferences.',
         '/jobs/' || NEW.id::text,
         'job_match'
  FROM public.jobseeker_preferences p
  WHERE (
      (p.preferred_categories IS NOT NULL AND NEW.category = ANY (p.preferred_categories))
      OR (p.preferred_locations IS NOT NULL AND EXISTS (
            SELECT 1 FROM unnest(p.preferred_locations) l
            WHERE lower(NEW.location) LIKE '%' || lower(l) || '%'))
      OR (p.preferred_employment_types IS NOT NULL AND NEW.employment_type = ANY (p.preferred_employment_types))
    )
    AND (p.years_experience IS NULL OR NEW.experience_years IS NULL OR p.years_experience >= NEW.experience_years - 1);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_matching_jobseekers ON public.jobs;
CREATE TRIGGER trg_notify_matching_jobseekers
AFTER INSERT OR UPDATE OF status ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.notify_matching_jobseekers();