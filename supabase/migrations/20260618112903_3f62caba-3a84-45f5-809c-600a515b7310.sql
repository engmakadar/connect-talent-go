
-- 1) Companies: hide sensitive columns from anon
REVOKE SELECT (kyc_documents, kyc_status, contact_email, contact_phone, contact_name, registration_number, subscription_plan, verified_by)
  ON public.companies FROM anon;

-- 2) Jobs: public-safe view + helper for application_email
CREATE OR REPLACE VIEW public.jobs_public WITH (security_invoker=on) AS
SELECT
  id, posted_by, title, company, location, employment_type, category,
  salary_min, salary_max, currency, description, responsibilities, requirements,
  education, experience_years, experience_text, skills, application_url,
  status, review_notes, reviewed_by, reviewed_at, expires_at, created_at, updated_at,
  posting_type, category_id, company_id, tender_documents, pending_changes, has_pending_edit
FROM public.jobs;

GRANT SELECT ON public.jobs_public TO anon, authenticated;

REVOKE SELECT (application_email) ON public.jobs FROM anon;

CREATE OR REPLACE FUNCTION public.get_job_apply_email(_job_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT application_email
  FROM public.jobs
  WHERE id = _job_id
    AND status = 'approved'
    AND auth.uid() IS NOT NULL
$$;

REVOKE EXECUTE ON FUNCTION public.get_job_apply_email(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_job_apply_email(uuid) TO authenticated;

-- 3) Storage: remove broad public listing on company-logos
DROP POLICY IF EXISTS "Company logos public read" ON storage.objects;

-- 4) Storage: add missing UPDATE policy for tender-documents
DROP POLICY IF EXISTS "Owners update tender docs" ON storage.objects;
CREATE POLICY "Owners update tender docs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'tender-documents'
    AND (auth.uid())::text = (storage.foldername(storage.objects.name))[1]
  )
  WITH CHECK (
    bucket_id = 'tender-documents'
    AND (auth.uid())::text = (storage.foldername(storage.objects.name))[1]
  );

-- 5) Revoke EXECUTE on internal SECURITY DEFINER helpers from anon/authenticated.
--    These are referenced inside RLS policies (evaluated server-side) and by trusted
--    server functions using the service_role client.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_page_permission(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_in_company(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_company_role(uuid, uuid, company_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_company_teams_summary(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_page_permission(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_in_company(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_company_role(uuid, uuid, company_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_company_teams_summary(uuid) TO service_role;
