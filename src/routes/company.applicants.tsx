import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Users, Star, Mail, Search, Briefcase, Ban, CalendarCheck,
  Download, Filter, CheckCircle2, XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { updateApplication } from "@/lib/applications.functions";
import { SHORTLIST_THRESHOLD, scoreTone } from "@/lib/ats";

export const Route = createFileRoute("/company/applicants")({
  head: () => ({
    meta: [
      { title: "Applicants & ATS — SahanJobs" },
      { name: "description", content: "Filter by category and position, review AI match scores and manage your shortlist." },
      { property: "og:title", content: "Applicants & ATS — SahanJobs" },
      { property: "og:description", content: "Filter by category and position, review AI match scores and manage your shortlist." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ApplicantsPage,
});

type AppRow = {
  id: string;
  job_id: string;
  user_id: string;
  status: string;
  match_score: number | null;
  shortlisted: boolean;
  employer_note: string | null;
  cover_letter: string | null;
  created_at: string;
  score_breakdown: {
    matchedSkills?: string[]; missingSkills?: string[];
    skills?: number; experience?: number; preferences?: number;
  } | null;
};

const STATUS_LABEL: Record<string, string> = {
  submitted: "New",
  reviewing: "Reviewing",
  interview_written: "Written interview",
  interview_oral: "Oral interview",
  rejected: "Regretted",
  hired: "Hired",
};

function isActiveJob(j: { status: string; expires_at: string | null }) {
  if (j.status !== "approved") return false;
  return !j.expires_at || new Date(j.expires_at) >= new Date();
}

function ApplicantsPage() {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const update = useServerFn(updateApplication);
  const [category, setCategory] = useState<string>("all");
  const [jobFilter, setJobFilter] = useState<string>("all");
  const [q, setQ] = useState("");

  const { data: jobs } = useQuery({
    enabled: !!user,
    queryKey: ["ats-jobs", user?.id],
    staleTime: 30_000,
    queryFn: async () => {
      const { data: prof } = await supabase.from("profiles").select("company_id").eq("id", user!.id).maybeSingle();
      let query = supabase
        .from("jobs")
        .select("id, title, location, category, status, expires_at, created_at, company_id, posted_by")
        .order("created_at", { ascending: false });
      if (!isAdmin) {
        query = prof?.company_id
          ? query.or(`posted_by.eq.${user!.id},company_id.eq.${prof.company_id}`)
          : query.eq("posted_by", user!.id);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const jobIds = useMemo(() => (jobs ?? []).map((j) => j.id), [jobs]);

  const { data: apps } = useQuery({
    enabled: jobIds.length > 0,
    queryKey: ["ats-applications", jobIds.join(",")],
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_applications")
        .select("id, job_id, user_id, status, match_score, shortlisted, employer_note, cover_letter, created_at, score_breakdown")
        .in("job_id", jobIds)
        .order("match_score", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as unknown as AppRow[];
      const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
      const { data: profiles } = userIds.length
        ? await supabase.from("profiles").select("id, full_name, email, headline, location, phone").in("id", userIds)
        : { data: [] };
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
      return rows.map((r) => ({ ...r, profile: byId.get(r.user_id) ?? null }));
    },
  });

  const categories = useMemo(
    () => Array.from(new Set((jobs ?? []).map((j) => j.category).filter(Boolean))).sort(),
    [jobs],
  );

  const positions = useMemo(
    () => (jobs ?? []).filter((j) => category === "all" || j.category === category),
    [jobs, category],
  );

  // Reset the position filter whenever the category changes to an incompatible value.
  useEffect(() => {
    if (jobFilter !== "all" && !positions.some((j) => j.id === jobFilter)) setJobFilter("all");
  }, [positions, jobFilter]);

  const scopedJobIds = useMemo(() => new Set(positions.map((j) => j.id)), [positions]);

  const kpis = useMemo(() => {
    const scoped = positions;
    const active = scoped.filter(isActiveJob);
    const shortlistedJobIds = new Set((apps ?? []).filter((a) => a.shortlisted && scopedJobIds.has(a.job_id)).map((a) => a.job_id));
    return {
      active: active.length,
      shortlisting: shortlistedJobIds.size,
      inactive: scoped.length - active.length,
    };
  }, [positions, apps, scopedJobIds]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (apps ?? []).filter((a) => {
      if (!scopedJobIds.has(a.job_id)) return false;
      if (jobFilter !== "all" && a.job_id !== jobFilter) return false;
      if (!term) return true;
      return (
        (a.profile?.full_name ?? "").toLowerCase().includes(term) ||
        (a.profile?.email ?? "").toLowerCase().includes(term)
      );
    });
  }, [apps, jobFilter, q, scopedJobIds]);

  const shortlist = filtered.filter((a) => a.shortlisted);
  const jobById = (id: string) => jobs?.find((j) => j.id === id);
  const jobTitle = (id: string) => jobById(id)?.title ?? "—";

  /** Vacancy-first view: every position with its own applicant list. */
  const byVacancy = useMemo(() => {
    const groups = positions
      .map((job) => {
        const rows = filtered.filter((a) => a.job_id === job.id);
        return {
          job,
          rows,
          shortlisted: rows.filter((a) => a.shortlisted).length,
          topScore: rows.reduce((m, a) => Math.max(m, a.match_score ?? 0), 0),
        };
      })
      .filter((g) => g.rows.length > 0);
    return groups.sort((a, b) => b.rows.length - a.rows.length);
  }, [positions, filtered]);


  const mutate = async (id: string, patch: { status?: string; shortlisted?: boolean }) => {
    try {
      await update({ data: { applicationId: id, ...patch } as never });
      qc.invalidateQueries({ queryKey: ["ats-applications"] });
      toast.success("Applicant updated.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed.");
    }
  };

  const mailTo = (email: string | null | undefined, subject: string, body: string) => {
    if (!email) return toast.error("This candidate has no email on file.");
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const shortlistAndNotify = async (a: (typeof filtered)[number]) => {
    await mutate(a.id, { shortlisted: true, status: "reviewing" });
    mailTo(
      a.profile?.email,
      `You have been shortlisted — ${jobTitle(a.job_id)}`,
      `Dear ${a.profile?.full_name ?? "candidate"},\n\nCongratulations — you have been shortlisted for the ${jobTitle(a.job_id)} position. We will be in touch shortly with next steps.\n\nKind regards`,
    );
  };

  const exportExcel = (rows: typeof filtered) => {
    if (rows.length === 0) return toast.error("Nothing to export.");
    const head = [
      "Candidate", "Email", "Phone", "Location", "Headline", "Category", "Position",
      "Applied on", "Status", "Shortlisted", "Match score %", "Skills score %",
      "Experience score %", "Preference score %", "Matched skills", "Missing skills", "Cover letter",
    ];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
    const body = rows.map((a) => [
      a.profile?.full_name, a.profile?.email, a.profile?.phone, a.profile?.location, a.profile?.headline,
      jobById(a.job_id)?.category, jobTitle(a.job_id),
      new Date(a.created_at).toLocaleDateString(),
      STATUS_LABEL[a.status] ?? a.status, a.shortlisted ? "Yes" : "No",
      a.match_score ?? 0, a.score_breakdown?.skills ?? "", a.score_breakdown?.experience ?? "",
      a.score_breakdown?.preferences ?? "",
      (a.score_breakdown?.matchedSkills ?? []).join(", "),
      (a.score_breakdown?.missingSkills ?? []).join(", "),
      a.cover_letter,
    ].map(esc).join(","));
    const csv = "\uFEFF" + [head.map(esc).join(","), ...body].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `sahanjob-ats-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Exported for Excel.");
  };

  const Table = ({ rows }: { rows: typeof filtered }) => {
    if (rows.length === 0) return <EmptyState />;
    return (
      <div className="overflow-x-auto rounded-2xl bg-card ring-1 ring-black/5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/5 bg-secondary/40 text-left">
              <Th>Candidate</Th>
              <Th>Position</Th>
              <Th className="text-center">Match</Th>
              <Th>Skill overlap</Th>
              <Th>Status</Th>
              <Th>Applied</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-b border-black/5 last:border-0 align-top hover:bg-secondary/20">
                <Td>
                  <p className="font-semibold text-ink">{a.profile?.full_name ?? "Candidate"}</p>
                  <p className="text-xs text-muted-foreground">{a.profile?.email ?? "—"}</p>
                  {a.profile?.location && <p className="text-xs text-muted-foreground">{a.profile.location}</p>}
                </Td>
                <Td>
                  <p className="text-ink">{jobTitle(a.job_id)}</p>
                  <p className="text-xs text-muted-foreground">{jobById(a.job_id)?.category}</p>
                </Td>
                <Td className="text-center">
                  <span className={`inline-block rounded-lg px-2.5 py-1 text-sm font-bold ${scoreTone(a.match_score ?? 0)}`}>
                    {a.match_score ?? 0}%
                  </span>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1 max-w-[240px]">
                    {(a.score_breakdown?.matchedSkills ?? []).slice(0, 5).map((s) => (
                      <span key={s} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{s}</span>
                    ))}
                    {(a.score_breakdown?.missingSkills ?? []).slice(0, 3).map((s) => (
                      <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground line-through">{s}</span>
                    ))}
                  </div>
                </Td>
                <Td>
                  <div className="flex flex-col items-start gap-1">
                    <Badge variant="outline" className="text-[10px]">{STATUS_LABEL[a.status] ?? a.status}</Badge>
                    {a.shortlisted && (
                      <Badge className="bg-primary/10 text-primary border-0 text-[10px]"><Star className="h-3 w-3 mr-1" /> Shortlisted</Badge>
                    )}
                  </div>
                </Td>
                <Td className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(a.created_at).toLocaleDateString()}
                </Td>
                <Td>
                  {isAdmin ? (
                    <p className="text-right text-[11px] text-muted-foreground">
                      View only — only the posting company can shortlist or regret
                    </p>
                  ) : (
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <Button
                      size="sm"
                      variant={a.shortlisted ? "secondary" : "outline"}
                      onClick={() => (a.shortlisted ? mutate(a.id, { shortlisted: false }) : shortlistAndNotify(a))}
                    >
                      <Star className="h-3.5 w-3.5 mr-1" /> {a.shortlisted ? "Remove" : "Shortlist"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        mutate(a.id, { status: "interview_written" });
                        mailTo(a.profile?.email, `Written interview invitation — ${jobTitle(a.job_id)}`,
                          `Dear ${a.profile?.full_name ?? "candidate"},\n\nThank you for applying for the ${jobTitle(a.job_id)} position. We would like to invite you to a written interview.\n\nPlease reply to confirm your availability.\n\nKind regards`);
                      }}
                    >
                      <CalendarCheck className="h-3.5 w-3.5 mr-1" /> Written
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        mutate(a.id, { status: "interview_oral" });
                        mailTo(a.profile?.email, `Interview invitation — ${jobTitle(a.job_id)}`,
                          `Dear ${a.profile?.full_name ?? "candidate"},\n\nThank you for applying for the ${jobTitle(a.job_id)} position. We would like to invite you to an oral interview.\n\nPlease reply to confirm your availability.\n\nKind regards`);
                      }}
                    >
                      <Mail className="h-3.5 w-3.5 mr-1" /> Oral
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => {
                        mutate(a.id, { status: "rejected" });
                        mailTo(a.profile?.email, `Application update — ${jobTitle(a.job_id)}`,
                          `Dear ${a.profile?.full_name ?? "candidate"},\n\nThank you for your interest in the ${jobTitle(a.job_id)} position. After careful review we have decided to progress other candidates at this time.\n\nWe wish you every success.\n\nKind regards`);
                      }}
                    >
                      <Ban className="h-3.5 w-3.5 mr-1" /> Regret
                    </Button>
                  </div>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <AdminShell
      pageKey="applicants"
      title="Applicants & ATS"
      subtitle={`Match scores combine skills, experience and preferences. Candidates at ${SHORTLIST_THRESHOLD}%+ are auto-shortlisted.`}
    >
        {/* 1 — Filtering controls */}
        <section className="rounded-2xl bg-card p-4 ring-1 ring-black/5 mb-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px]">
              <label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Category</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="mt-1 bg-white"><SelectValue placeholder="All categories" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[240px]">
              <label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Position</label>
              <Select value={jobFilter} onValueChange={setJobFilter}>
                <SelectTrigger className="mt-1 bg-white"><SelectValue placeholder="All positions" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All positions in category</SelectItem>
                  {positions.map((j) => <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="relative flex-1 min-w-[220px]">
              <label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Search</label>
              <Search className="absolute left-3 top-[34px] h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Candidate name or email…" className="mt-1 pl-9 bg-white" />
            </div>
            <Button variant="outline" onClick={() => exportExcel(filtered)}>
              <Download className="h-4 w-4 mr-2" /> Export to Excel
            </Button>
            <Button variant="ghost" onClick={() => { setCategory("all"); setJobFilter("all"); setQ(""); }}>
              <Filter className="h-4 w-4 mr-2" /> Reset
            </Button>
          </div>
        </section>

        {/* 2 — KPI dashboard */}
        <section className="grid gap-3 sm:grid-cols-3 mb-6">
          <Kpi label="Active jobs" value={kpis.active} icon={<CheckCircle2 className="h-4 w-4" />} tone="text-primary bg-primary/10" />
          <Kpi label="Jobs under shortlisting" value={kpis.shortlisting} icon={<Star className="h-4 w-4" />} tone="text-sky-700 bg-sky-100" />
          <Kpi label="Inactive / closed jobs" value={kpis.inactive} icon={<XCircle className="h-4 w-4" />} tone="text-muted-foreground bg-muted" />
        </section>

        {/* 3 — Applicant table */}
        <Tabs defaultValue="vacancies">
          <TabsList>
            <TabsTrigger value="vacancies">By vacancy ({byVacancy.length})</TabsTrigger>
            <TabsTrigger value="all">All applicants ({filtered.length})</TabsTrigger>
            <TabsTrigger value="shortlist">Shortlisted ({shortlist.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="vacancies" className="mt-4 space-y-5">
            {byVacancy.length === 0 ? <EmptyState label="No vacancies with applicants for this filter." /> : byVacancy.map((g) => (
              <section key={g.job.id} className="rounded-2xl bg-card ring-1 ring-black/5 overflow-hidden">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 bg-secondary/40 px-5 py-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-ink truncate">{g.job.title}</h3>
                      <Badge variant="outline" className="text-[10px]">
                        {isActiveJob(g.job) ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {g.job.category} · {g.job.location} · posted {new Date(g.job.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-lg font-bold text-ink leading-none tabular-nums">{g.rows.length}</p>
                      <p className="text-[11px] text-muted-foreground">applicants</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-primary leading-none tabular-nums">{g.shortlisted}</p>
                      <p className="text-[11px] text-muted-foreground">shortlisted</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-ink leading-none tabular-nums">{g.topScore}%</p>
                      <p className="text-[11px] text-muted-foreground">top match</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => exportExcel(g.rows)}>
                      <Download className="h-3.5 w-3.5 mr-1" /> Export
                    </Button>
                  </div>
                </header>
                <div className="p-0"><Table rows={g.rows} /></div>
              </section>
            ))}
          </TabsContent>

          <TabsContent value="all" className="mt-4"><Table rows={filtered} /></TabsContent>
          <TabsContent value="shortlist" className="mt-4"><Table rows={shortlist} /></TabsContent>
        </Tabs>

      </main>
      <SiteFooter />
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 text-[11px] uppercase tracking-wider font-bold text-muted-foreground ${className}`}>{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}

function Kpi({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: string }) {
  return (
    <div className="rounded-2xl bg-card p-5 ring-1 ring-black/5 flex items-center gap-4">
      <span className={`grid h-11 w-11 place-items-center rounded-xl ${tone}`}>{icon}</span>
      <div>
        <p className="text-2xl font-bold text-ink leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
      </div>
    </div>
  );
}

function EmptyState({ label = "No applicants for this filter." }: { label?: string }) {
  return (
    <div className="rounded-2xl bg-card p-12 ring-1 ring-black/5 text-center">
      <Users className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
      <p className="text-muted-foreground mb-4">{label}</p>
      <Link to="/admin/post-job" className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">
        <Briefcase className="h-4 w-4" /> Post a vacancy
      </Link>
    </div>
  );
}
