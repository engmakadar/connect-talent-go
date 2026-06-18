import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertCompanyManager(supabase: any, actorId: string, companyId: string) {
  const { data: adminRow } = await supabase.from("user_roles").select("user_id").eq("user_id", actorId).eq("role", "admin").maybeSingle();
  if (adminRow) return;
  // Any member of the company can manage its users (full CRUD for company team).
  const { data: roles } = await supabase
    .from("company_member_roles")
    .select("role")
    .eq("user_id", actorId)
    .eq("company_id", companyId)
    .limit(1);
  if (roles && roles.length > 0) return;
  // Fallback: profile linked to the company.
  const { data: prof } = await supabase
    .from("profiles").select("company_id").eq("id", actorId).maybeSingle();
  if (prof?.company_id === companyId) return;
  throw new Error("You don't have permission to manage this company's users.");
}

/** Admin / company owner / manager links an EXISTING user to a company's team. */
export const addExistingUserToCompanyTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    company_id: z.string().uuid(),
    user_id: z.string().uuid(),
    role: z.enum(["owner", "manager", "recruiter", "viewer"]).default("recruiter"),
    team_id: z.string().uuid().nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId: actorId } = context;
    await assertCompanyManager(supabase, actorId, data.company_id);

    const { data: prof, error: pe } = await supabase
      .from("profiles").select("id, company_id").eq("id", data.user_id).maybeSingle();
    if (pe) throw new Error(pe.message);
    if (!prof) throw new Error("User not found.");
    if (prof.company_id && prof.company_id !== data.company_id) {
      throw new Error("User already belongs to another company. Remove them from that company first.");
    }
    // Set profile.company_id (trigger also covers this, but be explicit).
    await supabase.from("profiles").update({ company_id: data.company_id }).eq("id", data.user_id);
    // Grant the company role; ensures auto-team-membership via trigger semantics.
    await supabase.from("company_member_roles").upsert(
      { user_id: data.user_id, company_id: data.company_id, role: data.role },
      { onConflict: "user_id,company_id,role" }
    );
    // Make sure the user holds the "employer" app role so RBAC treats them as a company member.
    await supabase.from("user_roles").upsert(
      { user_id: data.user_id, role: "employer" as never },
      { onConflict: "user_id,role" }
    );
    if (data.team_id) {
      const { data: existing } = await supabase
        .from("company_team_members").select("id").eq("user_id", data.user_id).eq("team_id", data.team_id).maybeSingle();
      if (!existing) {
        await supabase.from("company_team_members").insert({ user_id: data.user_id, team_id: data.team_id });
      }
    }
    return { ok: true };
  });

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

    // Trial-limit check: Free plan -> cap internal users (configurable).
    const FREE_PLAN_USER_LIMIT = 25;
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("plan, active, trial_ends_at, valid_until")
      .eq("company_id", data.company_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const isTrial = !sub || (sub.plan ?? "Free").toLowerCase() === "free";
    if (isTrial) {
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("company_id", data.company_id);
      if ((count ?? 0) >= FREE_PLAN_USER_LIMIT) {
        throw new Error(`Free plan limit reached (${FREE_PLAN_USER_LIMIT} users). Upgrade your plan to add more.`);
      }
    }

    const full_name = `${data.first_name} ${data.last_name}`.trim();
    const password = data.password ?? `Sahan!${Math.random().toString(36).slice(2, 10)}A1`;
    // Create the auth user WITHOUT the 'employer' role in metadata.
    // The handle_new_user trigger would otherwise insert user_roles(role=employer),
    // which fires enforce_employer_company_link and fails because the profile has
    // no company_id and no company_member_roles row yet ("Database error creating new user").
    const { createClient } = await import("@supabase/supabase-js");
    const authClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: created, error: ue } = await authClient.auth.signUp({
      email: data.email,
      password,
      options: { data: { full_name, first_name: data.first_name, last_name: data.last_name } },
    });
    if (ue || !created.user) throw new Error(ue?.message ?? "Failed to create user.");
    const newId = created.user.id;

    await supabase.from("profiles").update({
      first_name: data.first_name,
      last_name: data.last_name,
      full_name,
      phone: data.phone || null,
      email_verified: true,
      company_id: data.company_id,
    }).eq("id", newId);
    // Insert company membership first so the employer-role check passes.
    await supabase.from("company_member_roles").upsert(
      { user_id: newId, company_id: data.company_id, role: data.role },
      { onConflict: "user_id,company_id,role" }
    );
    // Replace default 'jobseeker' role created by the trigger with 'employer'.
    await supabase.from("user_roles").delete().eq("user_id", newId).eq("role", "jobseeker" as never);
    await supabase.from("user_roles").upsert({ user_id: newId, role: "employer" as never }, { onConflict: "user_id,role" });
    if (data.team_id) {
      await supabase.from("company_team_members").insert({ user_id: newId, team_id: data.team_id });
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
    const full_name = `${data.first_name} ${data.last_name}`.trim();
    await supabase.from("profiles").update({
      first_name: data.first_name, last_name: data.last_name, full_name, phone: data.phone || null,
    }).eq("id", data.user_id);

    // Replace role within this company
    await supabase.from("company_member_roles").delete().eq("user_id", data.user_id).eq("company_id", data.company_id);
    await supabase.from("company_member_roles").insert({ user_id: data.user_id, company_id: data.company_id, role: data.role });

    // Replace team membership scoped to this company
    const { data: existing } = await supabase
      .from("company_team_members")
      .select("id, team:company_teams!inner(company_id)")
      .eq("user_id", data.user_id)
      .eq("team.company_id", data.company_id);
    if (existing?.length) await supabase.from("company_team_members").delete().in("id", existing.map((e: any) => e.id));
    if (data.team_id) await supabase.from("company_team_members").insert({ user_id: data.user_id, team_id: data.team_id });
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
    const patch: Record<string, unknown> = {};
    if (typeof data.suspended === "boolean") patch.suspended = data.suspended;
    if (typeof data.deactivated === "boolean") patch.deactivated = data.deactivated;
    await supabase.from("profiles").update(patch as never).eq("id", data.user_id).eq("company_id", data.company_id);
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
    const { error } = await supabase.from("profiles").update({ deactivated: true, suspended: true }).eq("id", data.user_id).eq("company_id", data.company_id);
    if (error) throw new Error(error.message);
    await supabase.from("company_member_roles").delete().eq("user_id", data.user_id).eq("company_id", data.company_id);
    return { ok: true };
  });

/** Manager sets a company user's password directly. */
export const setCompanyUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    company_id: z.string().uuid(),
    user_id: z.string().uuid(),
    password: z.string().min(8).max(72),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId: actorId } = context;
    await assertCompanyManager(supabase, actorId, data.company_id);
    // Ensure target belongs to this company.
    const { data: prof } = await supabase.from("profiles").select("company_id").eq("id", data.user_id).maybeSingle();
    if (!prof || prof.company_id !== data.company_id) throw new Error("User is not a member of this company.");
    throw new Error("Direct password setting is unavailable in this environment. Use Send reset email instead.");
  });

/** Manager generates a recovery link for a company user. */
export const sendCompanyUserReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    company_id: z.string().uuid(),
    user_id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId: actorId } = context;
    await assertCompanyManager(supabase, actorId, data.company_id);
    const { data: prof } = await supabase.from("profiles").select("email, company_id").eq("id", data.user_id).maybeSingle();
    if (!prof || prof.company_id !== data.company_id) throw new Error("User is not a member of this company.");
    if (!prof.email) throw new Error("User has no email.");
    const { createClient } = await import("@supabase/supabase-js");
    const authClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { error } = await authClient.auth.resetPasswordForEmail(prof.email);
    if (error) throw new Error(error.message);
    return { ok: true, actionLink: null, email: prof.email };
  });
