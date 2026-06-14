import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertCompanyManager(supabase: any, actorId: string, companyId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: actorId, _role: "admin" });
  if (isAdmin) return;
  const { data: isOwner } = await supabase.rpc("has_company_role", { _user_id: actorId, _company_id: companyId, _role: "owner" });
  if (isOwner) return;
  const { data: isMgr } = await supabase.rpc("has_company_role", { _user_id: actorId, _company_id: companyId, _role: "manager" });
  if (isMgr) return;
  throw new Error("You don't have permission to manage this company's users.");
}

/** Invite a new internal user to the caller's company. */
export const inviteCompanyUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    company_id: z.string().uuid(),
    first_name: z.string().trim().min(1).max(80),
    last_name: z.string().trim().min(1).max(80),
    email: z.string().trim().toLowerCase().email(),
    phone: z.string().trim().max(40).optional().default(""),
    role: z.enum(["manager", "recruiter", "viewer"]).default("recruiter"),
    team_id: z.string().uuid().nullable().optional(),
    password: z.string().min(8).max(72).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId: actorId } = context;
    await assertCompanyManager(supabase, actorId, data.company_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Trial-limit check: Free plan -> max 2 internal users.
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("plan, active, trial_ends_at, valid_until")
      .eq("company_id", data.company_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const isTrial = !sub || (sub.plan ?? "Free").toLowerCase() === "free";
    if (isTrial) {
      const { count } = await supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("company_id", data.company_id);
      if ((count ?? 0) >= 2) {
        throw new Error("Free trial limit reached (2 users). Upgrade your plan to add more.");
      }
    }

    const full_name = `${data.first_name} ${data.last_name}`.trim();
    const password = data.password ?? `Sahan!${Math.random().toString(36).slice(2, 10)}A1`;
    const { data: created, error: ue } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password,
      email_confirm: true,
      user_metadata: { full_name, first_name: data.first_name, last_name: data.last_name, role: "employer" },
    });
    if (ue || !created.user) throw new Error(ue?.message ?? "Failed to create user.");
    const newId = created.user.id;

    await supabaseAdmin.from("profiles").update({
      first_name: data.first_name,
      last_name: data.last_name,
      full_name,
      phone: data.phone || null,
      email_verified: true,
      company_id: data.company_id,
    }).eq("id", newId);
    await supabaseAdmin.from("user_roles").upsert({ user_id: newId, role: "employer" }, { onConflict: "user_id,role" });
    await supabaseAdmin.from("company_member_roles").upsert(
      { user_id: newId, company_id: data.company_id, role: data.role },
      { onConflict: "user_id,company_id,role" }
    );
    if (data.team_id) {
      await supabaseAdmin.from("company_team_members").insert({ user_id: newId, team_id: data.team_id });
    }
    return { ok: true, userId: newId, tempPassword: data.password ? null : password };
  });

export const updateCompanyUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    company_id: z.string().uuid(),
    user_id: z.string().uuid(),
    first_name: z.string().trim().min(1).max(80),
    last_name: z.string().trim().min(1).max(80),
    phone: z.string().trim().max(40).optional().default(""),
    role: z.enum(["manager", "recruiter", "viewer"]),
    team_id: z.string().uuid().nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId: actorId } = context;
    await assertCompanyManager(supabase, actorId, data.company_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const full_name = `${data.first_name} ${data.last_name}`.trim();
    await supabaseAdmin.from("profiles").update({
      first_name: data.first_name, last_name: data.last_name, full_name, phone: data.phone || null,
    }).eq("id", data.user_id);

    // Replace role within this company
    await supabaseAdmin.from("company_member_roles").delete().eq("user_id", data.user_id).eq("company_id", data.company_id);
    await supabaseAdmin.from("company_member_roles").insert({ user_id: data.user_id, company_id: data.company_id, role: data.role });

    // Replace team membership scoped to this company
    const { data: existing } = await supabaseAdmin
      .from("company_team_members")
      .select("id, team:company_teams!inner(company_id)")
      .eq("user_id", data.user_id)
      .eq("team.company_id", data.company_id);
    if (existing?.length) await supabaseAdmin.from("company_team_members").delete().in("id", existing.map((e: any) => e.id));
    if (data.team_id) await supabaseAdmin.from("company_team_members").insert({ user_id: data.user_id, team_id: data.team_id });
    return { ok: true };
  });

export const suspendCompanyUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    company_id: z.string().uuid(),
    user_id: z.string().uuid(),
    suspended: z.boolean().optional(),
    deactivated: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId: actorId } = context;
    await assertCompanyManager(supabase, actorId, data.company_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = {};
    if (typeof data.suspended === "boolean") patch.suspended = data.suspended;
    if (typeof data.deactivated === "boolean") patch.deactivated = data.deactivated;
    await supabaseAdmin.from("profiles").update(patch as never).eq("id", data.user_id).eq("company_id", data.company_id);
    return { ok: true };
  });

export const deleteCompanyUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    company_id: z.string().uuid(),
    user_id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId: actorId } = context;
    await assertCompanyManager(supabase, actorId, data.company_id);
    if (actorId === data.user_id) throw new Error("You cannot delete yourself.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
