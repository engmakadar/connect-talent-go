
-- ============ 1. Skill workers: verification, suspension, radius, certifications ============
ALTER TABLE public.skill_workers
  ADD COLUMN IF NOT EXISTS suspended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS service_radius_km integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS certifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS verified_at timestamp with time zone;

-- Public directory only shows verified (approved), non-suspended workers
DROP POLICY IF EXISTS "Anyone views approved workers" ON public.skill_workers;
CREATE POLICY "Anyone views approved workers" ON public.skill_workers
  FOR SELECT TO public USING (approved = true AND suspended = false);

-- Multi-step self-enrollment: a signed-in user may create their own worker profile,
-- but it always starts unverified (approved = false) until an admin verifies it.
CREATE POLICY "Workers create own profile" ON public.skill_workers
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND approved = false AND suspended = false);

CREATE POLICY "Workers update own profile" ON public.skill_workers
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Guard: a worker can never flip their own approved/suspended flags or reassign ownership
CREATE OR REPLACE FUNCTION public.guard_skill_worker_self_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() = NEW.user_id AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.approved  := OLD.approved;
    NEW.suspended := OLD.suspended;
    NEW.user_id   := OLD.user_id;
    IF NEW.approved IS TRUE AND OLD.verified_at IS NULL THEN NEW.verified_at := now(); END IF;
  END IF;
  IF NEW.approved IS TRUE AND OLD.approved IS FALSE AND NEW.verified_at IS NULL THEN
    NEW.verified_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_skill_worker_self_approval ON public.skill_workers;
CREATE TRIGGER trg_guard_skill_worker_self_approval
  BEFORE UPDATE ON public.skill_workers
  FOR EACH ROW EXECUTE FUNCTION public.guard_skill_worker_self_approval();

-- ============ 2. Booking lifecycle timestamps ============
ALTER TABLE public.service_bookings
  ADD COLUMN IF NOT EXISTS matched_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS accepted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS started_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS customer_confirmed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS rated_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS closed_at timestamp with time zone;

CREATE OR REPLACE FUNCTION public.stamp_service_booking_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    CASE NEW.status
      WHEN 'matched'            THEN NEW.matched_at := now();
      WHEN 'accepted'           THEN NEW.accepted_at := now();
      WHEN 'confirmed'          THEN NEW.confirmed_at := now();
      WHEN 'in_progress'        THEN NEW.started_at := now();
      WHEN 'completed'          THEN NEW.completed_at := now();
      WHEN 'customer_confirmed' THEN NEW.customer_confirmed_at := now();
      WHEN 'rated'              THEN NEW.rated_at := now();
      WHEN 'closed'             THEN NEW.closed_at := now();
      ELSE NULL;
    END CASE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_booking_lifecycle ON public.service_bookings;
CREATE TRIGGER trg_service_booking_lifecycle
  BEFORE UPDATE ON public.service_bookings
  FOR EACH ROW EXECUTE FUNCTION public.stamp_service_booking_lifecycle();

-- ============ 3. Atomic accept — prevents two workers accepting the same job ============
CREATE OR REPLACE FUNCTION public.accept_service_booking(_booking_id uuid)
RETURNS public.service_bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_worker_id uuid;
  v_row public.service_bookings;
BEGIN
  SELECT id INTO v_worker_id FROM public.skill_workers
   WHERE user_id = auth.uid() AND approved = true AND suspended = false;
  IF v_worker_id IS NULL THEN
    RAISE EXCEPTION 'Only a verified, active worker can accept jobs.';
  END IF;

  -- Single atomic UPDATE acts as the transaction lock: only the first accept wins.
  UPDATE public.service_bookings
     SET status = 'accepted', accepted_at = now(), updated_at = now()
   WHERE id = _booking_id
     AND worker_id = v_worker_id
     AND status IN ('requested', 'matched')
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'This job is no longer available — it was already accepted or cancelled.';
  END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_service_booking(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.accept_service_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_service_booking(uuid) TO service_role;

-- ============ 4. Matching engine (skills 40 / distance 25 / rating 15 / availability 10 / experience 10) ============
CREATE OR REPLACE FUNCTION public.match_service_workers(
  _trade text DEFAULT NULL,
  _lat double precision DEFAULT NULL,
  _lng double precision DEFAULT NULL
)
RETURNS TABLE(
  worker_id uuid, full_name text, trades text[], location text, photo_url text,
  rating_avg numeric, rating_count integer, jobs_completed integer, bookings_count integer,
  years_experience integer, hourly_rate numeric, daily_rate numeric, currency text,
  distance_km double precision, match_score numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT w.id, w.full_name, w.trades, w.location, w.photo_url, w.rating_avg, w.rating_count,
           w.jobs_completed, w.bookings_count, w.years_experience, w.hourly_rate, w.daily_rate,
           w.currency, w.service_radius_km,
           CASE WHEN _lat IS NOT NULL AND _lng IS NOT NULL AND w.latitude IS NOT NULL AND w.longitude IS NOT NULL
                THEN 6371 * 2 * asin(sqrt(
                       power(sin(radians((_lat - w.latitude) / 2)), 2)
                       + cos(radians(_lat)) * cos(radians(w.latitude))
                       * power(sin(radians((_lng - w.longitude) / 2)), 2)))
           END AS dist
    FROM public.skill_workers w
    -- Eligibility: verified + active + available + skill match
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
           + 10
           + LEAST(COALESCE(r.years_experience, 0), 10)
         )::numeric, 1)
  FROM ranked r
  ORDER BY 15 DESC, r.rating_avg DESC;
$$;

GRANT EXECUTE ON FUNCTION public.match_service_workers(text, double precision, double precision) TO anon;
GRANT EXECUTE ON FUNCTION public.match_service_workers(text, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_service_workers(text, double precision, double precision) TO service_role;

-- ============ 5. One rating per job (database-enforced) ============
DELETE FROM public.service_reviews a USING public.service_reviews b
 WHERE a.booking_id = b.booking_id AND a.created_at > b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS service_reviews_one_per_booking
  ON public.service_reviews (booking_id);

-- ============ 6. Dispute workflow ============
CREATE TABLE IF NOT EXISTS public.service_disputes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES public.service_bookings(id) ON DELETE CASCADE,
  raised_by uuid NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'dispute_created',
  decision text,
  resolved_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.service_disputes TO authenticated;
GRANT ALL ON public.service_disputes TO service_role;

ALTER TABLE public.service_disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants view own disputes" ON public.service_disputes
  FOR SELECT TO authenticated
  USING (
    raised_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.service_bookings b
      WHERE b.id = service_disputes.booking_id
        AND (b.customer_id = auth.uid()
             OR EXISTS (SELECT 1 FROM public.skill_workers w WHERE w.id = b.worker_id AND w.user_id = auth.uid()))
    )
  );

CREATE POLICY "Participants open disputes" ON public.service_disputes
  FOR INSERT TO authenticated
  WITH CHECK (
    raised_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.service_bookings b
      WHERE b.id = service_disputes.booking_id
        AND (b.customer_id = auth.uid()
             OR EXISTS (SELECT 1 FROM public.skill_workers w WHERE w.id = b.worker_id AND w.user_id = auth.uid()))
    )
  );

CREATE POLICY "Admins resolve disputes" ON public.service_disputes
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS set_service_disputes_updated_at ON public.service_disputes;
CREATE TRIGGER set_service_disputes_updated_at
  BEFORE UPDATE ON public.service_disputes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 7. Centralized notification templates (in-app; same copy feeds SMS/email) ============
CREATE OR REPLACE FUNCTION public.notify_on_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_worker_user uuid;
  v_worker_name text;
  v_label text;
  v_body text;
BEGIN
  SELECT user_id, full_name INTO v_worker_user, v_worker_name
    FROM public.skill_workers WHERE id = COALESCE(NEW.worker_id, OLD.worker_id);

  IF TG_OP = 'INSERT' THEN
    -- Event: new job request -> worker notified
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
      WHEN 'disputed' THEN
        v_label := 'Dispute opened';
        v_body := 'A dispute was opened on this booking. Our team will review it shortly.';
      ELSE
        v_label := NULL;
    END CASE;

    IF v_label IS NOT NULL THEN
      IF NEW.status IN ('accepted', 'confirmed', 'in_progress', 'completed', 'closed') THEN
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
$$;

-- Dispute notifications: admins on creation, raiser on resolution
CREATE OR REPLACE FUNCTION public.notify_on_dispute()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications (user_id, title, body, link, category)
    SELECT ur.user_id, 'New service dispute',
           'A dispute was opened on a service booking: ' || left(NEW.reason, 120),
           '/admin/service-disputes', 'dispute'
      FROM public.user_roles ur WHERE ur.role = 'admin';
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('decision', 'resolved') THEN
    INSERT INTO public.notifications (user_id, title, body, link, category)
    VALUES (NEW.raised_by,
            CASE WHEN NEW.status = 'resolved' THEN 'Dispute resolved' ELSE 'Dispute decision issued' END,
            COALESCE(NEW.decision, 'Your dispute has been updated by our team.'),
            '/services/orders', 'dispute');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_dispute ON public.service_disputes;
CREATE TRIGGER trg_notify_on_dispute
  AFTER INSERT OR UPDATE ON public.service_disputes
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_dispute();
