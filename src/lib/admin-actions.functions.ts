import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Super Admin activates a user account: confirms email in auth + clears suspension. Bypasses email confirmation. */
export const activateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId: actorId } = context;
    const { data: _adminRow } = await supabase.from("user_roles").select("user_id").eq("user_id", actorId).eq("role", "admin").maybeSingle();
    const isAdmin = !!_adminRow;
    if (!isAdmin) throw new Error("Only Super Admin can activate users.");

    // Confirm the auth user's email so they can sign in without verification.
    // Must succeed — otherwise the user hits "Email not confirmed" at sign-in.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: confirmErr } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      email_confirm: true,
    });
    if (confirmErr) {
      throw new Error(`Failed to confirm email: ${confirmErr.message}`);
    }

    const { error: e2 } = await supabase.from("profiles")
      .update({ email_verified: true, suspended: false, deactivated: false, pending_approval: false })
      .eq("id", data.userId);
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });


const enrollSchema = z.object({
  role: z.enum(["admin", "employer", "jobseeker"]),
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(255),
  phone: z.string().trim().max(40).optional().default(""),
  location: z.string().trim().max(120).optional().default(""),
  // employer-only:
  company_id: z.string().uuid().optional().nullable(),
  company_name: z.string().trim().max(200).optional().default(""),
  // password: optional; if omitted a random one is set and the account is pre-activated.
  password: z.string().min(8).max(72).optional(),
});

/** Super Admin enrolls a new user (and optionally creates a company). */
export const enrollUserFull = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => enrollSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId: actorId } = context;
    const { data: _adminRow } = await supabase.from("user_roles").select("user_id").eq("user_id", actorId).eq("role", "admin").maybeSingle();
    const isAdmin = !!_adminRow;
    if (!isAdmin) throw new Error("Only Super Admin can enroll users.");
    if (data.role === "employer" && !data.company_id && !data.company_name) {
      throw new Error("Employers must be linked to a company. Select one or enter a new company name.");
    }
    if (data.role !== "employer" && (data.company_id || data.company_name)) {
      // Silently ignore company on non-employer
    }

    // Resolve / create company if needed.
    let companyId: string | null = null;
    if (data.role === "employer") {
      if (data.company_id) companyId = data.company_id;
      else if (data.company_name) {
        const { data: created, error: ce } = await supabase
          .from("companies")
          .insert({ name: data.company_name, created_by: actorId })
          .select("id")
          .single();
        if (ce) throw new Error(`Failed to create company: ${ce.message}`);
        companyId = created.id;
      }
    }

    const full_name = `${data.first_name} ${data.last_name}`.trim();
    const password = data.password ?? `Sahan!${Math.random().toString(36).slice(2, 10)}A1`;

    // Create the auth user with the publishable auth client. This avoids any dependency on a service-role key.
    const { createClient } = await import("@supabase/supabase-js");
    const authClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: created, error: ue } = await authClient.auth.signUp({
      email: data.email,
      password,
      options: { data: {
        full_name,
        first_name: data.first_name,
        last_name: data.last_name,
        role: data.role === "employer" ? "jobseeker" : data.role,
      } },
    });
    if (ue || !created.user) {
      // Surface a clean message for the common "already registered" case so the admin flow isn't blocked.
      const msg = ue?.message ?? "Failed to create user.";
      if (/already/i.test(msg)) throw new Error(`A user with email ${data.email} already exists.`);
      throw new Error(msg);
    }
    const newUserId = created.user.id;

    const { error: pe } = await supabase.from("profiles").update({
      first_name: data.first_name,
      last_name: data.last_name,
      full_name,
      phone: data.phone || null,
      location: data.location || null,
      email_verified: true,
      company_id: data.role === "employer" ? companyId : null,
      pending_approval: true,
    }).eq("id", newUserId);
    if (pe) throw new Error(pe.message);

    const { error: re } = await supabase
      .from("user_roles")
      .upsert({ user_id: newUserId, role: data.role }, { onConflict: "user_id,role" });
    if (re) throw new Error(re.message);
    if (data.role === "employer") {
      await supabase.from("user_roles").delete().eq("user_id", newUserId).eq("role", "jobseeker" as never);
    }

    return { ok: true, userId: newUserId, companyId, tempPassword: data.password ? null : password };
  });
