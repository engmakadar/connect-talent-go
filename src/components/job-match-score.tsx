import { useQuery } from "@tanstack/react-query";
import { Gauge, CheckCircle2, CircleDashed } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { scoreCandidate, scoreTone, type AtsJob, type AtsCandidate } from "@/lib/ats";

type ExperienceEntry = {
  company?: string; position?: string; duties?: string;
  start_date?: string; end_date?: string; current?: boolean;
};
type SkillEntry = { name?: string };

function yearsBetween(start?: string, end?: string, current?: boolean) {
  if (!start) return 0;
  const s = new Date(start);
  if (Number.isNaN(s.getTime())) return 0;
  const e = current || !end ? new Date() : new Date(end);
  if (Number.isNaN(e.getTime())) return 0;
  return Math.max(0, (e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
}

/** Live match percentage of the signed-in jobseeker against this posting. */
export function JobMatchScore({ job }: { job: AtsJob }) {
  const { user, isJobseeker } = useAuth();

  const { data: candidate } = useQuery({
    enabled: !!user,
    queryKey: ["ats-candidate", user?.id],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<AtsCandidate> => {
      const [{ data: prefs }, { data: resume }, { data: profile }] = await Promise.all([
        supabase.from("jobseeker_preferences")
          .select("skills, preferred_categories, preferred_locations, preferred_employment_types")
          .eq("user_id", user!.id).maybeSingle(),
        supabase.from("resumes").select("summary, experience, skills").eq("user_id", user!.id).maybeSingle(),
        supabase.from("profiles").select("headline, bio, location").eq("id", user!.id).maybeSingle(),
      ]);
      const experience = (resume?.experience as ExperienceEntry[] | null) ?? [];
      const resumeSkills = ((resume?.skills as SkillEntry[] | null) ?? []).map((s) => s?.name ?? "").filter(Boolean);
      return {
        skills: Array.from(new Set([...(prefs?.skills ?? []), ...resumeSkills])),
        experienceYears: Math.round(experience.reduce((sum, e) => sum + yearsBetween(e.start_date, e.end_date, e.current), 0)),
        categories: prefs?.preferred_categories ?? [],
        locations: [...(prefs?.preferred_locations ?? []), profile?.location ?? ""].filter(Boolean),
        employmentTypes: prefs?.preferred_employment_types ?? [],
        narrative: [
          profile?.headline ?? "", profile?.bio ?? "", resume?.summary ?? "",
          ...experience.map((e) => `${e.position ?? ""} ${e.company ?? ""} ${e.duties ?? ""}`),
        ].join(" "),
      };
    },
  });

  if (!user || (!isJobseeker && false) || !candidate) return null;

  const { score, breakdown } = scoreCandidate(job, candidate);

  return (
    <div className="rounded-2xl bg-card p-5 ring-1 ring-black/5">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-soft text-primary">
          <Gauge className="h-5 w-5" />
        </span>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Your match</p>
          <p className={`inline-flex rounded-full px-2.5 py-0.5 text-lg font-bold ${scoreTone(score)}`}>{score}%</p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <Bar label="Skills" value={breakdown.skills} />
        <Bar label="Experience" value={breakdown.experience} />
        <Bar label="Preferences" value={breakdown.preferences} />
      </div>

      {(breakdown.matchedSkills.length > 0 || breakdown.missingSkills.length > 0) && (
        <div className="mt-4 space-y-2 text-xs">
          {breakdown.matchedSkills.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              {breakdown.matchedSkills.slice(0, 6).join(", ")}
            </p>
          )}
          {breakdown.missingSkills.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
              <CircleDashed className="h-3.5 w-3.5" />
              Missing: {breakdown.missingSkills.slice(0, 6).join(", ")}
            </p>
          )}
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        Based on your profile, preferences and resume. Keep them up to date to improve accuracy.
      </p>
    </div>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>{label}</span><span>{value}%</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}
