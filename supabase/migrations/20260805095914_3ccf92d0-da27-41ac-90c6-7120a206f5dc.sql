CREATE OR REPLACE VIEW public.freelancer_public AS
SELECT DISTINCT p.id, p.full_name, p.avatar_url, p.headline, p.location
FROM public.profiles p
JOIN public.freelance_gigs g ON g.freelancer_id = p.id AND g.active = true;

ALTER VIEW public.freelancer_public SET (security_invoker = false);
GRANT SELECT ON public.freelancer_public TO anon, authenticated;