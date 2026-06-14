import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, Users, MapPin, Briefcase } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin-shell";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/candidates")({
  head: () => ({ meta: [{ title: "Candidates — SahanJobs Admin" }] }),
  component: () => (
    <AdminShell pageKey="candidates" title="Candidates" subtitle="All jobseekers enrolled on the platform.">
      <CandidatesTable />
    </AdminShell>
  ),
});

type Row = {
  id: string; full_name: string | null; email: string | null; headline: string | null;
  location: string | null; bio: string | null; created_at: string;
  preferred_categories: string[] | null; preferred_locations: string[] | null;
  preferred_employment_types: string[] | null; skills: string[] | null; min_salary: number | null;
  resume_url: string | null;
};

function CandidatesTable() {
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["admin-candidates"],
    queryFn: async (): Promise<Row[]> => {
      const [{ data: profiles, error: pe }, { data: roles }, { data: prefs }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, headline, location, bio, created_at"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("jobseeker_preferences").select("*"),
      ]);
      if (pe) throw pe;
      const jobseekerIds = new Set((roles ?? []).filter((r) => r.role === "jobseeker").map((r) => r.user_id));
      const prefMap = new Map((prefs ?? []).map((p) => [p.user_id, p]));
      return (profiles ?? [])
        .filter((p) => jobseekerIds.has(p.id))
        .map((p) => {
          const pr = prefMap.get(p.id);
          return {
            ...p,
            preferred_categories: pr?.preferred_categories ?? null,
            preferred_locations: pr?.preferred_locations ?? null,
            preferred_employment_types: pr?.preferred_employment_types ?? null,
            skills: pr?.skills ?? null,
            min_salary: pr?.min_salary ?? null,
            resume_url: pr?.resume_url ?? null,
          };
        });
    },
  });

  const filtered = useMemo(() => {
    if (!q.trim()) return data ?? [];
    const t = q.toLowerCase();
    return (data ?? []).filter((r) =>
      (r.full_name || "").toLowerCase().includes(t) ||
      (r.email || "").toLowerCase().includes(t) ||
      (r.headline || "").toLowerCase().includes(t) ||
      (r.location || "").toLowerCase().includes(t),
    );
  }, [data, q]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search candidates by name, email, location…" className="pl-9 h-11 bg-white" />
      </div>

      <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="h-40 bg-secondary animate-pulse" />
        ) : !filtered.length ? (
          <div className="p-16 text-center">
            <Users className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No candidates found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-secondary/50">
                <tr className="text-left">
                  <th className="px-5 py-3 font-semibold">Candidate</th>
                  <th className="px-5 py-3 font-semibold">Headline</th>
                  <th className="px-5 py-3 font-semibold">Location</th>
                  <th className="px-5 py-3 font-semibold">Preferences</th>
                  <th className="px-5 py-3 font-semibold">Skills</th>
                  <th className="px-5 py-3 font-semibold">Joined</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/30 align-top">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary font-bold">
                          {(r.full_name?.[0] ?? r.email?.[0] ?? "?").toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-ink">{r.full_name || "—"}</p>
                          <p className="text-xs text-muted-foreground">{r.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground max-w-[200px]">{r.headline || "—"}</td>
                    <td className="px-5 py-4 text-muted-foreground">
                      {r.location ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {r.location}</span> : "—"}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1 max-w-[240px]">
                        {(r.preferred_categories ?? []).slice(0, 3).map((c) => (
                          <Badge key={c} variant="secondary" className="text-[10px]"><Briefcase className="h-2.5 w-2.5 mr-1" />{c}</Badge>
                        ))}
                        {r.min_salary && <Badge variant="outline" className="text-[10px]">${r.min_salary}+</Badge>}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1 max-w-[240px]">
                        {(r.skills ?? []).slice(0, 4).map((s) => (
                          <Badge key={s} className="text-[10px] bg-primary/10 text-primary border-0">{s}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
