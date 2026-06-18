import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getAdminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const publishAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(5000),
    audience: z.enum(["all", "employers", "jobseekers", "company"]).default("all"),
    company_id: z.string().uuid().nullable().optional(),
    channels: z.array(z.enum(["in_app", "email", "sms"])).min(1).default(["in_app"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId: actorId } = context;
    const { data: _adminRow } = await supabase.from("user_roles").select("user_id").eq("user_id", actorId).eq("role", "admin").maybeSingle();
    const isAdmin = !!_adminRow;
    if (!isAdmin) throw new Error("Only Super Admin can publish announcements.");
    const supabaseAdmin = await getAdminClient();

    const { data: ann, error } = await supabaseAdmin.from("announcements").insert({
      title: data.title, body: data.body, audience: data.audience,
      company_id: data.company_id ?? null,
      channels: data.channels as never,
      created_by: actorId,
    }).select("id").single();
    if (error) throw new Error(error.message);

    // Fan-out: figure out target user ids
    let userIds: string[] = [];
    if (data.audience === "company" && data.company_id) {
      const { data: profs } = await supabaseAdmin.from("profiles").select("id").eq("company_id", data.company_id);
      userIds = profs?.map((p) => p.id) ?? [];
    } else if (data.audience === "all") {
      const { data: profs } = await supabaseAdmin.from("profiles").select("id");
      userIds = profs?.map((p) => p.id) ?? [];
    } else {
      const role = data.audience === "employers" ? "employer" : "jobseeker";
      const { data: rows } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", role as never);
      userIds = rows?.map((r: any) => r.user_id) ?? [];
    }

    if (userIds.length && data.channels.includes("in_app")) {
      const chunks: string[][] = [];
      for (let i = 0; i < userIds.length; i += 500) chunks.push(userIds.slice(i, i + 500));
      for (const chunk of chunks) {
        await supabaseAdmin.from("notifications").insert(
          chunk.map((uid) => ({ user_id: uid, title: data.title, body: data.body, category: "announcement" }))
        );
      }
    }
    // Email / SMS — log as pending for later worker
    for (const channel of data.channels.filter((c) => c !== "in_app")) {
      await supabaseAdmin.from("notification_deliveries").insert(
        userIds.map((uid) => ({ announcement_id: ann.id, user_id: uid, channel, status: "pending" }))
      );
    }
    return { ok: true, announcement_id: ann.id, recipients: userIds.length };
  });
