CREATE OR REPLACE FUNCTION public.notify_on_application()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_job record;
BEGIN
  SELECT id, title, posted_by INTO v_job FROM public.jobs WHERE id = NEW.job_id;
  IF v_job.posted_by IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, body, link, category)
    VALUES (v_job.posted_by, 'New applicant',
            'A candidate applied to "' || v_job.title || '"' ||
            COALESCE(' — ' || NEW.match_score::text || '% match', ''),
            '/company/applicants', 'application');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notify_on_application() FROM PUBLIC, anon;
DROP TRIGGER IF EXISTS trg_notify_on_application ON public.job_applications;
CREATE TRIGGER trg_notify_on_application AFTER INSERT ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_application();

CREATE OR REPLACE FUNCTION public.notify_on_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_worker_user uuid;
BEGIN
  SELECT user_id INTO v_worker_user FROM public.skill_workers WHERE id = NEW.worker_id;
  IF TG_OP = 'INSERT' THEN
    IF v_worker_user IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, body, link, category)
      VALUES (v_worker_user, 'New service booking',
              NEW.customer_name || ' booked you: ' || left(NEW.description, 120),
              '/services/bookings', 'booking');
    END IF;
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.notifications (user_id, title, body, link, category)
    VALUES (NEW.customer_id, 'Booking ' || NEW.status,
            'Your service booking is now "' || NEW.status || '".',
            '/services/bookings', 'booking');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notify_on_booking() FROM PUBLIC, anon;
DROP TRIGGER IF EXISTS trg_notify_on_booking ON public.service_bookings;
CREATE TRIGGER trg_notify_on_booking AFTER INSERT OR UPDATE ON public.service_bookings
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_booking();