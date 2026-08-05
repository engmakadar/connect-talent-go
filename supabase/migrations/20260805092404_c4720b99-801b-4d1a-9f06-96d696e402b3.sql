CREATE TABLE public.freelance_gigs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  freelancer_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'General',
  price numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  delivery_days integer NOT NULL DEFAULT 3,
  tags text[] NOT NULL DEFAULT '{}',
  cover_url text,
  active boolean NOT NULL DEFAULT true,
  rating_avg numeric NOT NULL DEFAULT 0,
  rating_count integer NOT NULL DEFAULT 0,
  orders_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.freelance_gigs TO authenticated;
GRANT SELECT ON public.freelance_gigs TO anon;
GRANT ALL ON public.freelance_gigs TO service_role;
ALTER TABLE public.freelance_gigs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active gigs" ON public.freelance_gigs FOR SELECT USING (active OR freelancer_id = auth.uid());
CREATE POLICY "Freelancers insert own gigs" ON public.freelance_gigs FOR INSERT TO authenticated WITH CHECK (freelancer_id = auth.uid());
CREATE POLICY "Freelancers update own gigs" ON public.freelance_gigs FOR UPDATE TO authenticated USING (freelancer_id = auth.uid()) WITH CHECK (freelancer_id = auth.uid());
CREATE POLICY "Freelancers delete own gigs" ON public.freelance_gigs FOR DELETE TO authenticated USING (freelancer_id = auth.uid());

CREATE TABLE public.freelance_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id uuid NOT NULL REFERENCES public.freelance_gigs(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  freelancer_id uuid NOT NULL,
  requirements text NOT NULL DEFAULT '',
  price numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.freelance_orders TO authenticated;
GRANT ALL ON public.freelance_orders TO service_role;
ALTER TABLE public.freelance_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parties view own orders" ON public.freelance_orders FOR SELECT TO authenticated USING (client_id = auth.uid() OR freelancer_id = auth.uid());
CREATE POLICY "Clients create orders" ON public.freelance_orders FOR INSERT TO authenticated WITH CHECK (client_id = auth.uid());
CREATE POLICY "Parties update own orders" ON public.freelance_orders FOR UPDATE TO authenticated USING (client_id = auth.uid() OR freelancer_id = auth.uid()) WITH CHECK (client_id = auth.uid() OR freelancer_id = auth.uid());

CREATE TABLE public.freelance_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.freelance_orders(id) ON DELETE CASCADE,
  gig_id uuid NOT NULL REFERENCES public.freelance_gigs(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  rating integer NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.freelance_reviews TO authenticated;
GRANT SELECT ON public.freelance_reviews TO anon;
GRANT ALL ON public.freelance_reviews TO service_role;
ALTER TABLE public.freelance_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read gig reviews" ON public.freelance_reviews FOR SELECT USING (true);
CREATE POLICY "Buyers review their orders" ON public.freelance_reviews FOR INSERT TO authenticated WITH CHECK (
  client_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.freelance_orders o WHERE o.id = order_id AND o.client_id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.sync_gig_rating()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.freelance_gigs g
  SET rating_avg = COALESCE((SELECT ROUND(AVG(r.rating)::numeric, 2) FROM public.freelance_reviews r WHERE r.gig_id = g.id), 0),
      rating_count = (SELECT COUNT(*) FROM public.freelance_reviews r WHERE r.gig_id = g.id),
      updated_at = now()
  WHERE g.id = NEW.gig_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_sync_gig_rating AFTER INSERT ON public.freelance_reviews
FOR EACH ROW EXECUTE FUNCTION public.sync_gig_rating();

CREATE OR REPLACE FUNCTION public.bump_gig_orders()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.freelance_gigs SET orders_count = orders_count + 1, updated_at = now() WHERE id = NEW.gig_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_bump_gig_orders AFTER INSERT ON public.freelance_orders
FOR EACH ROW EXECUTE FUNCTION public.bump_gig_orders();

CREATE TRIGGER trg_freelance_gigs_updated BEFORE UPDATE ON public.freelance_gigs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_freelance_orders_updated BEFORE UPDATE ON public.freelance_orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.notify_on_shortlist()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_title text;
BEGIN
  IF NEW.shortlisted IS TRUE AND COALESCE(OLD.shortlisted, false) IS FALSE THEN
    SELECT j.title INTO v_title FROM public.jobs j WHERE j.id = NEW.job_id;
    INSERT INTO public.notifications (user_id, title, body, link, category)
    VALUES (NEW.user_id,
      'You have been shortlisted',
      'Great news — you were shortlisted for ' || COALESCE(v_title, 'a position') || '. The employer may contact you soon.',
      '/applications', 'application');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_on_shortlist AFTER UPDATE ON public.job_applications
FOR EACH ROW EXECUTE FUNCTION public.notify_on_shortlist();