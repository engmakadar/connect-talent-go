import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Users, Star, Mail, Search, Briefcase, MapPin, Sparkles, Ban, CalendarCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
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
      { name: "description", content: "Track applicants per vacancy, view AI match scores and manage your shortlist." },
      { property: "og:title", content: "Applicants & ATS — SahanJobs" },
      { property: "og:description", content: "Track applicants per vacancy, view AI match scores and manage your shortlist." },
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
  score_breakdown: { matchedSkills?: string[]; missingSkills?: string[] } | null;
};

const STATUS_LABEL: Record<string, string> = {
  submitted: "New",
  reviewing: "Reviewing",
  interview_written: "Written interview",
  interview_oral: "Oral interview",
  rejected: "Regretted",
  hired: "Hired",
};

function ApplicantsPage() {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const update = useServerFn(updateApplication);
  const [jobFilter, setJobFilter] = useState<string>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const { data: jobs } = useQuery({
    enabled: !!user,
    queryKey: ["ats-jobs", user?.id],
    staleTime: 30_000,
    queryFn: async () => {
      const { data: prof } = await supabase.from("profiles").select("company_id").eq("id", user!.id).maybeSingle();
      let query = supabase
        .from("jobs")
        .select("id, title, location, status, expires_at, created_at, company_id, posted_by")
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

  const countsByJob = useMemo(() => {
    const m = new Map<string, { total: number; shortlisted: number }>();
    for (const a of apps ?? []) {
      const c = m.get(a.job_id) ?? { total: 0, shortlisted: 0 };
      c.total++;
      if (a.shortlisted) c.shortlisted++;
      m.set(a.job_id, c);
    }
    return m;
  }, [apps]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (apps ?? []).filter((a) => {
      if (jobFilter !== "all" && a.job_id !== jobFilter) return false;
      if (!term) return true;
      return (
        (a.profile?.full_name ?? "").toLowerCase().includes(term) ||
        (a.profile?.email ?? "").toLowerCase().includes(term)
      );
    });
  }, [apps, jobFilter, q]);

  const shortlist = filtered.filter((a) => a.shortlisted);
  const jobTitle = (id: string) => jobs?.find((j) => j.id === id)?.title ?? "—";

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

  const Card = ({ a }: { a: (typeof filtered)[number] }) => (
    <div className="rounded-2xl bg-card p-5 ring-1 ring-black/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-ink truncate">{a.profile?.full_name ?? "Candidate"}</p>
            {a.shortlisted && (
              <Badge className="bg-primary/10 text-primary border-0 text-[10px]"><Star className="h-3 w-3 mr-1" /> Shortlisted</Badge>
            )}
            <Badge variant="outline" className="text-[10px]">{STATUS_LABEL[a.status] ?? a.status}</Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate">{a.profile?.headline ?? a.profile?.email ?? ""}</p>
          <p className="mt-1 text-xs text-muted-foreground inline-flex items-center gap-3">
            <span className="inline-flex items-center gap-1"><Briefcase className="h-3 w-3" /> {jobTitle(a.job_id)}</span>
            {a.profile?.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {a.profile.location}</span>}
          </p>
        </div>
        <div className={`rounded-xl px-3 py-2 text-center ${scoreTone(a.match_score ?? 0)}`}>
          <p className="text-lg font-bold leading-none">{a.match_score ?? 0}%</p>
          <p className="text-[10px] uppercase tracking-wider">ATS match</p>
        </div>
      </div>

      {(a.score_breakdown?.matchedSkills?.length || a.score_breakdown?.missingSkills?.length) ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(a.score_breakdown?.matchedSkills ?? []).slice(0, 8).map((s) => (
            <span key={s} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{s}</span>
          ))}
          {(a.score_breakdown?.missingSkills ?? []).slice(0, 5).map((s) => (
            <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground line-through">{s}</span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant={a.shortlisted ? "secondary" : "outline"} onClick={() => mutate(a.id, { shortlisted: !a.shortlisted })}>
          <Star className="h-3.5 w-3.5 mr-1" /> {a.shortlisted ? "Remove from shortlist" : "Shortlist"}
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
          <CalendarCheck className="h-3.5 w-3.5 mr-1" /> Invite · written
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
          <Mail className="h-3.5 w-3.5 mr-1" /> Invite · oral
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
          <Ban className="h-3.5 w-3.5 mr-1" /> Send regret
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-hero-band/40">
      <SiteHeader />
      <main className="flex-1 mx-auto w-full max-w-6xl px-6 py-10">
        <div className="flex items-center gap-3 mb-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Sparkles className="h-5 w-5" /></span>
          <div>
            <h1 className="font-serif text-3xl font-bold text-ink">Applicants & ATS</h1>
            <p className="text-sm text-muted-foreground">Match scores are computed from skills, experience and preferences. Candidates at {SHORTLIST_THRESHOLD}%+ are auto-shortlisted.</p>
          </div>
        </div>

        {/* Vacancy summary */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 my-6">
          {(jobs ?? []).slice(0, 6).map((j) => {
            const c = countsByJob.get(j.id) ?? { total: 0, shortlisted: 0 };
            return (
              <button
                key={j.id}
                onClick={() => setJobFilter(j.id)}
                className={`text-left rounded-2xl bg-card p-4 ring-1 transition ${jobFilter === j.id ? "ring-primary" : "ring-black/5 hover:ring-primary/40"}`}
              >
                <p className="font-semibold text-ink text-sm line-clamp-1">{j.title}</p>
                <p className="text-xs text-muted-foreground">{j.location}</p>
                <div className="mt-3 flex items-center gap-4">
                  <span className="inline-flex items-center gap-1 text-sm font-bold text-ink"><Users className="h-4 w-4 text-primary" /> {c.total}</span>
                  <span className="inline-flex items-center gap-1 text-xs text-primary font-semibold"><Star className="h-3.5 w-3.5" /> {c.shortlisted} shortlisted</span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search candidates…" className="pl-9 bg-white" />
          </div>
          <Select value={jobFilter} onValueChange={setJobFilter}>
            <SelectTrigger className="w-[260px] bg-white"><SelectValue placeholder="All vacancies" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vacancies</SelectItem>
              {(jobs ?? []).map((j) => <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">All applicants ({filtered.length})</TabsTrigger>
            <TabsTrigger value="shortlist">Shortlisted ({shortlist.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="all" className="space-y-3 mt-4">
            {filtered.length === 0
              ? <EmptyState />
              : filtered.map((a) => <Card key={a.id} a={a} />)}
          </TabsContent>
          <TabsContent value="shortlist" className="space-y-3 mt-4">
            {shortlist.length === 0
              ? <EmptyState label="No shortlisted candidates yet." />
              : shortlist.map((a) => <Card key={a.id} a={a} />)}
          </TabsContent>
        </Tabs>
      </main>
      <SiteFooter />
    </div>
  );
}

function EmptyState({ label = "No applicants yet." }: { label?: string }) {
  return (
    <div className="rounded-2xl bg-card p-12 ring-1 ring-black/5 text-center">
      <Users className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
      <p className="text-muted-foreground mb-4">{label}</p>
      <Link to="/admin/post-job" className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">Post a vacancy</Link>
    </div>
  );
}
