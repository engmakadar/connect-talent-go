-- Trigger functions run internally via triggers; nobody should call them directly.
REVOKE EXECUTE ON FUNCTION public.audit_service_booking() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_skill_worker_verification() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_worker_verification() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_booking() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_worker_rating() FROM PUBLIC, anon, authenticated;

-- match_service_workers powers the public services directory: keep anon+authenticated.
-- decline_service_booking and service_admin_stats are already revoked from anon/PUBLIC.