import { supabase } from "@/integrations/supabase/client";

export type AuditAction =
  | "user.suspend" | "user.unsuspend" | "user.deactivate" | "user.role_change" | "user.profile_update"
  | "company.verify" | "company.reject" | "company.suspend" | "company.update" | "company.enroll"
  | "job.approve" | "job.reject" | "job.edit_staged" | "job.edit_applied" | "job.edit_discarded" | "job.delete" | "job.create"
  | "category.create" | "category.update" | "category.delete"
  | "page_permission.grant" | "page_permission.revoke"
  | "plan.create" | "plan.update" | "plan.delete" | "plan.toggle"
  | "user.password_reset" | "user.password_set"
  | "notification.publish"
  | "auth.login" | "auth.logout" | "auth.signup";

export async function logAudit(params: {
  action: AuditAction;
  resource_type?: string;
  resource_id?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("audit_logs").insert({
      user_id: user?.id ?? null,
      actor_email: user?.email ?? null,
      action: params.action,
      resource_type: params.resource_type ?? null,
      resource_id: params.resource_id ?? null,
      metadata: (params.metadata ?? {}) as never,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
    });
  } catch {
    // Swallow audit errors — never block primary action.
  }
}
