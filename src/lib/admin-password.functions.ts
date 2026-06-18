import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getAdminClient() {
  const { getSupabaseAdminClient } = await import("@/lib/supabase-admin.server");
  return getSupabaseAdminClient();
}

/** Super Admin sets a user's password directly. */
export const setUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    userId: z.string().uuid(),
    password: z.string().min(8).max(72),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId: actorId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: actorId, _role: "admin" });
    if (!isAdmin) throw new Error("Only Super Admin can reset passwords.");
    const supabaseAdmin = await getAdminClient();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Super Admin generates a password-recovery link (email is best-effort). */
export const sendPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId: actorId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: actorId, _role: "admin" });
    if (!isAdmin) throw new Error("Only Super Admin can send resets.");
    const supabaseAdmin = await getAdminClient();

    const { data: prof } = await supabaseAdmin.from("profiles").select("email").eq("id", data.userId).maybeSingle();
    if (!prof?.email) throw new Error("User has no email.");

    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: prof.email,
    });
    if (error) throw new Error(error.message);
    return { ok: true, actionLink: link.properties?.action_link ?? null, email: prof.email };
  });
