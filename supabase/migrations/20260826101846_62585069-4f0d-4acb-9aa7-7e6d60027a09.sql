DROP POLICY IF EXISTS "Admins update bookings" ON public.service_bookings;
CREATE POLICY "Admins update bookings" ON public.service_bookings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.accept_service_booking(_booking_id uuid)
RETURNS public.service_bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_worker_id uuid;
  v_is_admin boolean;
  v_row public.service_bookings;
BEGIN
  v_is_admin := public.has_role(auth.uid(), 'admin');

  IF v_is_admin THEN
    UPDATE public.service_bookings
       SET status = 'accepted', accepted_at = now(), updated_at = now()
     WHERE id = _booking_id
       AND status IN ('requested', 'matched')
    RETURNING * INTO v_row;
  ELSE
    SELECT id INTO v_worker_id FROM public.skill_workers
     WHERE user_id = auth.uid() AND approved = true AND suspended = false;
    IF v_worker_id IS NULL THEN
      RAISE EXCEPTION 'Only an administrator can accept jobs.';
    END IF;

    UPDATE public.service_bookings
       SET status = 'accepted', accepted_at = now(), updated_at = now()
     WHERE id = _booking_id
       AND worker_id = v_worker_id
       AND status IN ('requested', 'matched')
    RETURNING * INTO v_row;
  END IF;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'This job is no longer available — it was already accepted or cancelled.';
  END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_service_booking(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.accept_service_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_service_booking(uuid) TO service_role;