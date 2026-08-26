import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MapPin, Globe, Briefcase, Users, BadgeCheck, ArrowLeft, ArrowRight,
  Layers, HelpCircle, Map as MapIcon, UserPlus, UserCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { CompanyLogo } from "@/components/company-logo";
import { RichTextView } from "@/components/rich-text-editor";
import { formatSalary, formatEmploymentType, timeAgo } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/companies/$companyId")({
  head: () => ({
    meta: [
      { title: "Company profile — SahanJobs" },
      { name: "description", content: "Company profile on SahanJobs: about the organization, headquarters, follower count and every open vacancy." },
      { property: "og:title", content: "Company profile — SahanJobs" },
      { property: "og:description", content: "About the organization, headquarters and all open vacancies on SahanJobs." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CompanyDetailPage,
});

type FollowersTable = {
  delete: () => { eq: (k: string, v: string) => { eq: (k2: string, v2: string) => Promise<{ error: { message: string } | null }> } };
  insert: (row: { company_id: string; user_id: string }) => Promise<{ error: { message: string } | null }>;
};
const followersTable = () => (supabase as unknown as { from: (t: string) => FollowersTable }).from("company_followers");
const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: unknown }>)(fn, args);

function FactTile({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label: string }) {
  return (
    <div className="border-b-2 border-primary/25 pb-3">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">{icon}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-ink">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}

function CompanyDetailPage() {
  const { companyId } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"about" | "jobs" | "tenders">("about");

  const { data, isLoading } = useQuery({
    queryKey: ["company-detail", companyId],
    queryFn: async () => {
      const { data: company } = await supabase
        .from("companies")
        .select("id, name, logo_url, website, description, location, hq_location, years_experience, verification_status, created_at")
        .eq("id", companyId)
        .maybeSingle();
      const nowIso = new Date().toISOString();
      const { data: jobs } = await supabase
        .from("jobs")
        .select("id, title, location, category, employment_type, salary_min, salary_max, currency, created_at, expires_at, posting_type")
        .eq("company_id", companyId)
        .eq("status", "approved")
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .order("created_at", { ascending: false })
        .limit(50);
      return { company, jobs: jobs ?? [] };
    },
  });

  const { data: followers = 0 } = useQuery({
    queryKey: ["company-follower-count", companyId],
    queryFn: async () => Number((await rpc("company_follower_count", { _company_id: companyId })).data ?? 0),
  });

  const { data: following = false } = useQuery({
    enabled: !!user,
    queryKey: ["company-following", companyId, user?.id],
    queryFn: async () => (await rpc("is_company_follower", { _company_id: companyId })).data === true,
  });

  const toggleFollow = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in to follow this company.");
      if (following) {
        const { error } = await followersTable().delete().eq("company_id", companyId).eq("user_id", user.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await followersTable().insert({ company_id: companyId, user_id: user.id });
        if (error && !error.message.includes("duplicate")) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-follower-count", companyId] });
      qc.invalidateQueries({ queryKey: ["company-following", companyId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update follow"),
  });

  const company = data?.company;
  const all = data?.jobs ?? [];
  const jobs = useMemo(() => all.filter((j) => j.posting_type !== "tender"), [all]);
  const tenders = useMemo(() => all.filter((j) => j.posting_type === "tender"), [all]);
  const industry = useMemo(() => {
    const counts = new Map<string, number>();
    all.forEach((j) => counts.set(j.category, (counts.get(j.category) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  }, [all]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <SiteHeader />
        <main className="flex-1 mx-auto w-full max-w-6xl px-6 py-16 text-sm text-muted-foreground">Loading company…</main>
        <SiteFooter />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <SiteHeader />
        <main className="flex-1 mx-auto w-full max-w-6xl px-6 py-20 text-center">
          <h1 className="font-serif text-2xl font-bold text-ink">Company not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">This organization is not published on SahanJobs.</p>
          <Link to="/jobs" className="mt-6 inline-flex rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">Browse jobs</Link>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const list = tab === "tenders" ? tenders : jobs;

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <SiteHeader />

      <div className="bg-hero-band/40 border-b border-black/5 py-3">
        <div className="mx-auto max-w-6xl px-6">
          <Link to="/jobs" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
            <ArrowLeft className="h-3.5 w-3.5" /> All jobs
          </Link>
        </div>
      </div>

      <main className="flex-1 mx-auto w-full max-w-6xl px-6 py-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <CompanyLogo company={company.name} logoUrl={company.logo_url} size={72} className="h-18 w-18 shrink-0" />
            <div className="min-w-0">
              <h1 className="font-sans text-2xl md:text-[28px] font-bold tracking-tight text-ink leading-tight">{company.name}</h1>
              <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                <span className="font-semibold text-ink tabular-nums">{followers.toLocaleString()}</span> follower{followers === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <button
            onClick={() => (user ? toggleFollow.mutate() : toast.error("Sign in to follow this company."))}
            disabled={toggleFollow.isPending}
            className={
              following
                ? "inline-flex items-center gap-2 rounded-full bg-primary-soft px-5 py-2.5 text-sm font-semibold text-primary ring-1 ring-primary/20 hover:bg-primary-soft/70"
                : "inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
            }
          >
            {following ? <><UserCheck className="h-4 w-4" /> Following</> : <><UserPlus className="h-4 w-4" /> Follow</>}
          </button>
        </div>

        {/* Fact strip */}
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          <FactTile
            icon={<HelpCircle className="h-5 w-5" />}
            value={company.verification_status === "verified" ? "Verified employer" : "Employer"}
            label="Company type"
          />
          <FactTile icon={<Layers className="h-5 w-5" />} value={industry} label="Industry" />
          <FactTile icon={<Users className="h-5 w-5" />} value={company.years_experience ? `${company.years_experience} yrs active` : "—"} label="Experience" />
          <FactTile icon={<MapIcon className="h-5 w-5" />} value={company.hq_location ?? company.location ?? "—"} label="Head quarter" />
          <FactTile
            icon={<Globe className="h-5 w-5" />}
            value={company.website
              ? <a href={company.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{company.website}</a>
              : "—"}
            label="Visit company website"
          />
        </div>

        {/* Tabs */}
        <div className="mt-8 flex items-center gap-8 border-b border-black/10">
          {([
            ["about", "About", null],
            ["jobs", "Jobs", jobs.length],
            ["tenders", "Tenders", tenders.length],
          ] as const).map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`-mb-px flex items-center gap-2 border-b-2 px-1 pb-3 text-base font-semibold transition ${
                tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-ink"
              }`}
            >
              {label}
              {count !== null && (
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-bold tabular-nums text-muted-foreground">{count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Panels */}
        <div className="py-8">
          {tab === "about" ? (
            company.description ? (
              <RichTextView html={company.description} />
            ) : (
              <p className="text-sm text-muted-foreground">This company has not added a description yet.</p>
            )
          ) : list.length === 0 ? (
            <div className="rounded-2xl bg-card p-10 ring-1 ring-black/5 text-center text-sm text-muted-foreground">
              No open {tab === "tenders" ? "tenders" : "positions"} right now.
            </div>
          ) : (
            <div className="space-y-3">
              {list.map((j) => (
                <Link
                  key={j.id}
                  to="/jobs/$jobId"
                  params={{ jobId: j.id }}
                  className="group flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card p-5 ring-1 ring-black/5 hover:shadow-md transition-all"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-ink group-hover:text-primary">{j.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {j.location}</span>
                      {" · "}{j.category}{" · "}{formatEmploymentType(j.employment_type)}{" · "}posted {timeAgo(j.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-semibold text-primary">{formatSalary(j.salary_min, j.salary_max, j.currency)}</span>
                    <ArrowRight className="h-4 w-4 text-primary transition group-hover:translate-x-0.5" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {company.verification_status === "verified" && (
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
            <BadgeCheck className="h-3.5 w-3.5" /> Verified employer on SahanJobs
          </p>
        )}
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Briefcase className="h-3.5 w-3.5" /> {all.length} open posting{all.length === 1 ? "" : "s"}
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
