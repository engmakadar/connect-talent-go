import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { scoreCandidate, SHORTLIST_THRESHOLD, type AtsCandidate } from "@/lib/ats";

type ExperienceEntry = {
  company?: string; position?: string; duties?: string;
  start_date?: string; end_date?: string; current?: boolean;
};
type SkillEntry = { name?: string; level?: string };

function yearsBetween(start?: string, end?: string, current?: boolean) {
  if (!start) return 0;
  const s = new Date(start);
  if (Number.isNaN(s.getTime())) return 0;
  const e = current || !end ? new Date() : new Date(end);
  if (Number.isNaN(e.getTime())) return 0;
  return Math.max(0, (e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
}

/** One-click apply: scores the candidate against the posting and stores the application. */
export const applyToJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      jobId: z.string().uuid(),
      coverLetter: z.string().max(4000).optional().default(""),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("id, title, skills, preferred_skills, experience_years, category, location, employment_type, status, expires_at")
      .eq("id", data.jobId)
      .maybeSingle();
    if (jobErr) throw new Error(jobErr.message);
    if (!job) throw new Error("This job is no longer available.");
    if (job.status !== "approved") throw new Error("This job is not open for applications.");
    if (job.expires_at && new Date(job.expires_at) < new Date()) {
      throw new Error("This posting has closed.");
    }

    const { data: existing } = await supabase
      .from("job_applications")
      .select("id")
      .eq("job_id", data.jobId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existing) throw new Error("You have already applied to this position.");

    const [{ data: prefs }, { data: resume }, { data: profile }] = await Promise.all([
      supabase.from("jobseeker_preferences")
        .select("skills, preferred_categories, preferred_locations, preferred_employment_types")
        .eq("user_id", userId).maybeSingle(),
      supabase.from("resumes")
        .select("summary, experience, skills, education").eq("user_id", userId).maybeSingle(),
      supabase.from("profiles").select("full_name, headline, bio, location").eq("id", userId).maybeSingle(),
    ]);

    const resumeExperience = (resume?.experience as ExperienceEntry[] | null) ?? [];
    const resumeSkills = ((resume?.skills as SkillEntry[] | null) ?? [])
      .map((s) => s?.name ?? "")
      .filter(Boolean);

    const experienceYears = Math.round(
      resumeExperience.reduce((sum, e) => sum + yearsBetween(e.start_date, e.end_date, e.current), 0),
    );

    const candidate: AtsCandidate = {
      skills: Array.from(new Set([...(prefs?.skills ?? []), ...resumeSkills])),
      experienceYears,
      categories: prefs?.preferred_categories ?? [],
      locations: [...(prefs?.preferred_locations ?? []), profile?.location ?? ""].filter(Boolean),
      employmentTypes: prefs?.preferred_employment_types ?? [],
      narrative: [
        profile?.headline ?? "", profile?.bio ?? "", resume?.summary ?? "",
        ...resumeExperience.map((e) => `${e.position ?? ""} ${e.company ?? ""} ${e.duties ?? ""}`),
      ].join(" "),
    };

    const { score, breakdown } = scoreCandidate(job, candidate);

    const { error: insErr } = await supabase.from("job_applications").insert({
      job_id: data.jobId,
      user_id: userId,
      status: "submitted",
      match_score: score,
      shortlisted: score >= SHORTLIST_THRESHOLD,
      score_breakdown: breakdown as never,
      cover_letter: data.coverLetter || null,
    });
    if (insErr) throw new Error(insErr.message);

    return { ok: true, score, shortlisted: score >= SHORTLIST_THRESHOLD };
  });

/** Employer updates an application: status, shortlist flag, internal note. */
export const updateApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      applicationId: z.string().uuid(),
      status: z.enum(["submitted", "reviewing", "interview_written", "interview_oral", "rejected", "hired"]).optional(),
      shortlisted: z.boolean().optional(),
      employer_note: z.string().max(2000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Record<string, unknown> = {};
    if (data.status !== undefined) patch.status = data.status;
    if (data.shortlisted !== undefined) patch.shortlisted = data.shortlisted;
    if (data.employer_note !== undefined) patch.employer_note = data.employer_note;
    if (Object.keys(patch).length === 0) return { ok: true };

    const { data: app, error } = await supabase
      .from("job_applications")
      .update(patch as never)
      .eq("id", data.applicationId)
      .select("id, user_id, job_id, status")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!app) throw new Error("You do not have permission to update this application.");

    // The candidate notification is emitted by a database trigger on status change.
    return { ok: true };
  });
