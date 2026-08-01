CREATE OR REPLACE FUNCTION public.notify_application_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_title text; v_label text; v_body text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  SELECT title INTO v_title FROM public.jobs WHERE id = NEW.job_id;
  v_title := COALESCE(v_title, 'the role');

  IF NEW.status = 'rejected' THEN
    v_label := 'Application update';
    v_body := 'Thank you for applying to "' || v_title || '". The employer has decided to move forward with other candidates.';
  ELSIF NEW.status = 'interview_written' THEN
    v_label := 'Interview invitation';
    v_body := 'You have been invited to a written interview for "' || v_title || '".';
  ELSIF NEW.status = 'interview_oral' THEN
    v_label := 'Interview invitation';
    v_body := 'You have been invited to an oral interview for "' || v_title || '".';
  ELSE
    v_label := 'Application update';
    v_body := 'Your application for "' || v_title || '" is now "' || NEW.status || '".';
  END IF;

  INSERT INTO public.notifications (user_id, title, body, link, category)
  VALUES (NEW.user_id, v_label, v_body, '/applications', 'application');
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notify_application_status() FROM PUBLIC, anon;
DROP TRIGGER IF EXISTS trg_notify_application_status ON public.job_applications;
CREATE TRIGGER trg_notify_application_status AFTER UPDATE ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.notify_application_status();