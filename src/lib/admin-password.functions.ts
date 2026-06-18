import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Super Admin sets a user's password directly. */
export const setUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    userId: z.string().uuid(),
    password: z.string().min(8).max(72),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId: actorId } = context;
    const { data: _adminRow } = await supabase.from("user_roles").select("user_id").eq("user_id", actorId).eq("role", "admin").maybeSingle();
    const isAdmin = !!_adminRow;
    if (!isAdmin) throw new Error("Only Super Admin can reset passwords.");
    throw new Error("Direct password setting is unavailable in this environment. Use Reset link instead.");
  });

/** Super Admin generates a password-recovery link (email is best-effort). */
export const sendPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId: actorId } = context;
    const { data: _adminRow } = await supabase.from("user_roles").select("user_id").eq("user_id", actorId).eq("role", "admin").maybeSingle();
    const isAdmin = !!_adminRow;
    if (!isAdmin) throw new Error("Only Super Admin can send resets.");

    const { data: prof } = await supabase.from("profiles").select("email").eq("id", data.userId).maybeSingle();
    if (!prof?.email) throw new Error("User has no email.");

    const { createClient } = await import("@supabase/supabase-js");
    const authClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { error } = await authClient.auth.resetPasswordForEmail(prof.email);
    if (error) throw new Error(error.message);
    return { ok: true, actionLink: null, email: prof.email };
  });
