-- 1. Service bookings: request details, cancellation metadata, decline tracking, expiry
ALTER TABLE public.service_bookings
  ADD COLUMN IF NOT EXISTS trade text,
  ADD COLUMN IF NOT EXISTS urgency text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS declined_by uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- 2. Ratings: category scores (overall stays in performance_rating)
ALTER TABLE public.service_reviews
  ADD COLUMN IF NOT EXISTS quality_rating integer,
  ADD COLUMN IF NOT EXISTS professionalism_rating integer,
  ADD COLUMN IF NOT EXISTS punctuality_rating integer,
  ADD COLUMN IF NOT EXISTS communication_rating integer;

-- 3. Worker verification: admin "request more info" note
ALTER TABLE public.skill_workers
  ADD COLUMN IF NOT EXISTS verification_note text;

-- 4. Worker rating sync across all non-null rating dimensions
CREATE OR REPLACE FUNCTION public.sync_worker_rating()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.skill_workers w
  SET rating_avg = COALESCE((
        SELECT round(avg(dim)::numeric, 2)
        FROM public.service_reviews r
        CROSS JOIN LATERAL (
          SELECT AVG(x) AS dim
          FROM (VALUES (r.performance_rating), (r.behaviour_rating), (r.quality_rating),
                       (r.professionalism_rating), (r.punctuality_rating), (r.communication_rating)) AS v(x)
        ) d
        WHERE r.worker_id = w.id), 0),
      rating_count = (SELECT count(*) FROM public.service_reviews r WHERE r.worker_id = w.id)
  WHERE w.id = COALESCE(NEW.worker_id, OLD.worker_id);
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 5. Matching engine: add current-workload factor (busy workers rank lower)
CREATE OR REPLACE FUNCTION public.match_service_workers(_trade text DEFAULT NULL::text, _lat double precision DEFAULT NULL::double precision, _lng double precision DEFAULT NULL::double precision)
 RETURNS TABLE(worker_id uuid, full_name text, trades text[], location text, photo_url text, rating_avg numeric, rating_count integer, jobs_completed integer, bookings_count integer, years_experience integer, hourly_rate numeric, daily_rate numeric, currency text, distance_km double precision, match_score numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH ranked AS (
    SELECT w.id, w.full_name, w.trades, w.location, w.photo_url, w.rating_avg, w.rating_count,
           w.jobs_completed, w.bookings_count, w.years_experience, w.hourly_rate, w.daily_rate,
           w.currency, w.service_radius_km,
           (SELECT count(*) FROM public.service_bookings b
             WHERE b.worker_id = w.id AND b.status IN ('accepted','confirmed','in_progress')) AS active_jobs,
           CASE WHEN _lat IS NOT NULL AND _lng IS NOT NULL AND w.latitude IS NOT NULL AND w.longitude IS NOT NULL
                THEN 6371 * 2 * asin(sqrt(
                       power(sin(radians((_lat - w.latitude) / 2)), 2)
                       + cos(radians(_lat)) * cos(radians(w.latitude))
                       * power(sin(radians((_lng - w.longitude) / 2)), 2)))
           END AS dist
    FROM public.skill_workers w
    WHERE w.approved = true AND w.available = true AND w.suspended = false
      AND (_trade IS NULL OR _trade = ANY (w.trades))
  )
  SELECT r.id, r.full_name, r.trades, r.location, r.photo_url, r.rating_avg, r.rating_count,
         r.jobs_completed, r.bookings_count, r.years_experience, r.hourly_rate, r.daily_rate, r.currency,
         r.dist,
         ROUND((
           40
           + CASE WHEN r.dist IS NULL THEN 12
                  WHEN r.dist <= r.service_radius_km THEN 25
                  ELSE GREATEST(0, 25 - (r.dist - r.service_radius_km) * 0.5) END
           + (COALESCE(r.rating_avg, 0) / 5) * 15
           + GREATEST(0, 10 - r.active_jobs * 3)
           + LEAST(COALESCE(r.years_experience, 0), 10)
         )::numeric, 1)
  FROM ranked r
  ORDER BY 15 DESC, r.rating_avg DESC;
$function$;

-- 6. Worker declines a job: request returns to the customer, job is NOT cancelled
CREATE OR REPLACE FUNCTION public.decline_service_booking(_booking_id uuid)
 RETURNS service_bookings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_worker_id uuid;
  v_row public.service_bookings;
BEGIN
  SELECT id INTO v_worker_id FROM public.skill_workers
   WHERE user_id = auth.uid() AND suspended = false;
  IF v_worker_id IS NULL THEN
    RAISE EXCEPTION 'Only a registered, active worker can decline jobs.';
  END IF;

  UPDATE public.service_bookings
     SET status = 'requested',
         declined_by = array_append(declined_by, v_worker_id),
         updated_at = now()
   WHERE id = _booking_id
     AND worker_id = v_worker_id
     AND status IN ('requested', 'matched')
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'This job can no longer be declined.';
  END IF;

  INSERT INTO public.notifications (user_id, title, body, link, category)
  VALUES (v_row.customer_id, 'Worker unavailable',
          'The worker is unable to take your request: ' || left(v_row.description, 100) || '. Please choose another worker.',
          '/services', 'booking');

  RETURN v_row;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.decline_service_booking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_service_booking(uuid) TO authenticated;

-- 7. Admin monitoring statistics (admin-only)
CREATE OR REPLACE FUNCTION public.service_admin_stats()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admins only.';
  END IF;
  RETURN json_build_object(
    'total_customers',    (SELECT count(DISTINCT customer_id) FROM public.service_bookings),
    'total_workers',      (SELECT count(*) FROM public.skill_workers),
    'verified_workers',   (SELECT count(*) FROM public.skill_workers WHERE approved = true AND suspended = false),
    'pending_workers',    (SELECT count(*) FROM public.skill_workers WHERE approved = false),
    'suspended_workers',  (SELECT count(*) FROM public.skill_workers WHERE suspended = true),
    'active_jobs',        (SELECT count(*) FROM public.service_bookings WHERE status IN ('requested','matched','accepted','confirmed','in_progress')),
    'completed_jobs',     (SELECT count(*) FROM public.service_bookings WHERE status IN ('completed','customer_confirmed','rated','closed')),
    'cancelled_jobs',     (SELECT count(*) FROM public.service_bookings WHERE status = 'cancelled'),
    'disputed_jobs',      (SELECT count(*) FROM public.service_bookings WHERE status = 'disputed'),
    'expired_jobs',       (SELECT count(*) FROM public.service_bookings WHERE status = 'expired'),
    'open_disputes',      (SELECT count(*) FROM public.service_disputes WHERE status <> 'resolved'),
    'avg_rating',         (SELECT COALESCE(round(avg(rating_avg)::numeric, 2), 0) FROM public.skill_workers WHERE rating_count > 0),
    'avg_completion_hours', (SELECT COALESCE(round(avg(EXTRACT(EPOCH FROM (completed_at - accepted_at)) / 3600)::numeric, 1), 0)
                             FROM public.service_bookings WHERE completed_at IS NOT NULL AND accepted_at IS NOT NULL)
  );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.service_admin_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.service_admin_stats() TO authenticated;

-- 8. Audit trail: booking creation + every status change
CREATE OR REPLACE FUNCTION public.audit_service_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id, metadata)
    VALUES (
      auth.uid(),
      CASE WHEN TG_OP = 'INSERT' THEN 'service.booking_created' ELSE 'service.booking_' || NEW.status END,
      'service_bookings',
      NEW.id::text,
      jsonb_build_object('status', NEW.status, 'worker_id', NEW.worker_id, 'customer_id', NEW.customer_id)
    );
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_audit_service_booking ON public.service_bookings;
CREATE TRIGGER trg_audit_service_booking
  AFTER INSERT OR UPDATE OF status ON public.service_bookings
  FOR EACH ROW EXECUTE FUNCTION public.audit_service_booking();

-- 9. Audit trail: worker verification changes
CREATE OR REPLACE FUNCTION public.audit_skill_worker_verification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.approved IS DISTINCT FROM OLD.approved OR NEW.suspended IS DISTINCT FROM OLD.suspended THEN
    INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id, metadata)
    VALUES (
      auth.uid(),
      'service.worker_verification',
      'skill_workers',
      NEW.id::text,
      jsonb_build_object('approved', NEW.approved, 'suspended', NEW.suspended, 'worker_user_id', NEW.user_id)
    );
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_audit_skill_worker_verification ON public.skill_workers;
CREATE TRIGGER trg_audit_skill_worker_verification
  AFTER UPDATE OF approved, suspended ON public.skill_workers
  FOR EACH ROW EXECUTE FUNCTION public.audit_skill_worker_verification();

-- 10. Worker verification notifications (approved / suspended / more info requested)
CREATE OR REPLACE FUNCTION public.notify_worker_verification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.approved IS TRUE AND OLD.approved IS FALSE THEN
    INSERT INTO public.notifications (user_id, title, body, link, category)
    VALUES (NEW.user_id, 'Worker profile verified',
            'Congratulations — your skilled-worker profile is verified and now visible to customers.',
            '/services/bookings', 'booking');
  ELSIF NEW.suspended IS TRUE AND OLD.suspended IS FALSE THEN
    INSERT INTO public.notifications (user_id, title, body, link, category)
    VALUES (NEW.user_id, 'Worker account suspended',
            'Your skilled-worker account has been suspended. Contact support if you believe this is a mistake.',
            '/services/bookings', 'booking');
  ELSIF NEW.approved IS FALSE AND NEW.verification_note IS NOT NULL
        AND NEW.verification_note IS DISTINCT FROM OLD.verification_note THEN
    INSERT INTO public.notifications (user_id, title, body, link, category)
    VALUES (NEW.user_id, 'More information needed for verification',
            NEW.verification_note,
            '/services/register', 'booking');
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_notify_worker_verification ON public.skill_workers;
CREATE TRIGGER trg_notify_worker_verification
  AFTER UPDATE OF approved, suspended, verification_note ON public.skill_workers
  FOR EACH ROW EXECUTE FUNCTION public.notify_worker_verification();

-- 11. Notify customer when a request expires
CREATE OR REPLACE FUNCTION public.notify_on_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_worker_user uuid;
  v_worker_name text;
  v_label text;
  v_body text;
BEGIN
  SELECT user_id, full_name INTO v_worker_user, v_worker_name
    FROM public.skill_workers WHERE id = COALESCE(NEW.worker_id, OLD.worker_id);

  IF TG_OP = 'INSERT' THEN
    IF v_worker_user IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, body, link, category)
      VALUES (v_worker_user, 'New service request',
              NEW.customer_name || ' requested your service: ' || left(NEW.description, 120),
              '/services/bookings', 'booking');
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    CASE NEW.status
      WHEN 'accepted' THEN
        v_label := 'Worker accepted your request';
        v_body := COALESCE(v_worker_name, 'The worker') || ' accepted your booking: ' || left(NEW.description, 100);
      WHEN 'confirmed' THEN
        v_label := 'Job confirmed';
        v_body := 'Your service booking is confirmed' ||
                  COALESCE(' for ' || to_char(NEW.scheduled_for, 'DD Mon YYYY HH24:MI'), '') || '.';
      WHEN 'in_progress' THEN
        v_label := 'Job started';
        v_body := COALESCE(v_worker_name, 'The worker') || ' started working on your job.';
      WHEN 'completed' THEN
        v_label := 'Job completed - please confirm & rate';
        v_body := 'Your service job was marked complete. Please confirm the work and rate your worker.';
      WHEN 'customer_confirmed' THEN
        v_label := 'Customer confirmed completion';
        v_body := 'The customer confirmed your completed work.';
      WHEN 'rated' THEN
        v_label := 'You received a rating';
        v_body := 'A customer rated your completed work.';
      WHEN 'closed' THEN
        v_label := 'Job closed';
        v_body := 'This service job is now closed. Thank you for using SahanJobs services.';
      WHEN 'cancelled' THEN
        v_label := 'Booking cancelled';
        v_body := 'The booking "' || left(NEW.description, 80) || '" was cancelled.';
      WHEN 'expired' THEN
        v_label := 'Request expired';
        v_body := 'Your service request "' || left(NEW.description, 80) || '" expired without a worker accepting it. You can book another worker anytime.';
      WHEN 'disputed' THEN
        v_label := 'Dispute opened';
        v_body := 'A dispute was opened on this booking. Our team will review it shortly.';
      ELSE
        v_label := NULL;
    END CASE;

    IF v_label IS NOT NULL THEN
      IF NEW.status IN ('accepted', 'confirmed', 'in_progress', 'completed', 'closed', 'expired') THEN
        INSERT INTO public.notifications (user_id, title, body, link, category)
        VALUES (NEW.customer_id, v_label, v_body, '/services/orders', 'booking');
      ELSIF NEW.status IN ('customer_confirmed', 'rated') AND v_worker_user IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, title, body, link, category)
        VALUES (v_worker_user, v_label, v_body, '/services/bookings', 'booking');
      ELSIF NEW.status IN ('cancelled', 'disputed') THEN
        INSERT INTO public.notifications (user_id, title, body, link, category)
        VALUES (NEW.customer_id, v_label, v_body, '/services/orders', 'booking');
        IF v_worker_user IS NOT NULL THEN
          INSERT INTO public.notifications (user_id, title, body, link, category)
          VALUES (v_worker_user, v_label, v_body, '/services/bookings', 'booking');
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 12. Auto-expire stale requests (no worker response within 7 days), checked hourly
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule(
  'expire-stale-service-requests',
  '15 * * * *',
  $$
  UPDATE public.service_bookings
     SET status = 'expired', updated_at = now()
   WHERE status IN ('requested', 'matched')
     AND created_at < now() - interval '7 days';
  $$
);

-- 13. Private job-attachment storage policies (bucket created separately)
DROP POLICY IF EXISTS "service_attachments_insert" ON storage.objects;
CREATE POLICY "service_attachments_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'service-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "service_attachments_read" ON storage.objects;
CREATE POLICY "service_attachments_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'service-attachments' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.service_bookings b
        JOIN public.skill_workers w ON w.id = b.worker_id AND w.user_id = auth.uid()
        WHERE b.customer_id::text = (storage.foldername(name))[1]
      )
    )
  );

DROP POLICY IF EXISTS "service_attachments_delete_own" ON storage.objects;
CREATE POLICY "service_attachments_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'service-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);