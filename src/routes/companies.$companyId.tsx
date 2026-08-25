import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Globe, Briefcase, Users, BadgeCheck, ArrowLeft, ArrowRight, CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { CompanyLogo } from "@/components/company-logo";
import { CompanyFollowCard } from "@/components/company-follow";
import { RichTextView } from "@/components/rich-text-editor";
import { formatSalary, formatEmploymentType, timeAgo } from "@/lib/format";

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

const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: unknown }>)(fn, args);

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-black/5">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">{icon}</span>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-bold text-ink tabular-nums">{value}</p>
    </div>
  );
}

function CompanyDetailPage() {
  const { companyId } = Route.useParams();

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
      const followers = Number((await rpc("company_follower_count", { _company_id: companyId })).data ?? 0);
      return { company, jobs: jobs ?? [], followers };
    },
  });

  const company = data?.company;
  const jobs = data?.jobs ?? [];

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

      <section className="mx-auto w-full max-w-6xl px-6 pt-8 pb-12 grid lg:grid-cols-[1fr_300px] gap-x-10 gap-y-6 flex-1">
        <div>
          <div className="flex items-start gap-4">
            <CompanyLogo company={company.name} logoUrl={company.logo_url} size={72} className="h-18 w-18 shrink-0" />
            <div className="min-w-0">
              <h1 className="font-sans text-2xl md:text-[28px] font-bold tracking-tight text-ink leading-tight">{company.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink/80">
                {(company.hq_location || company.location) && (
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {company.hq_location ?? company.location}</span>
                )}
                {company.website && (
                  <a href={company.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                    <Globe className="h-3.5 w-3.5" /> Website
                  </a>
                )}
                {company.verification_status === "verified" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/5 px-2.5 py-0.5 text-xs font-semibold text-primary">
                    <BadgeCheck className="h-3 w-3" /> Verified employer
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="h-px bg-destructive my-6" />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat icon={<Briefcase className="h-4 w-4" />} label="Open positions" value={String(jobs.length)} />
            <Stat icon={<Users className="h-4 w-4" />} label="Followers" value={(data?.followers ?? 0).toLocaleString()} />
            <Stat icon={<CalendarDays className="h-4 w-4" />} label="On SahanJobs" value={new Date(company.created_at).getFullYear().toString()} />
            <Stat icon={<BadgeCheck className="h-4 w-4" />} label="Experience" value={company.years_experience ? `${company.years_experience} yrs` : "—"} />
          </div>

          {company.description && (
            <div className="mt-6 rounded-2xl bg-card p-6 ring-1 ring-black/5">
              <h2 className="font-serif text-lg font-semibold tracking-tight mb-4 text-ink">About {company.name}</h2>
              <RichTextView html={company.description} />
            </div>
          )}

          <div className="mt-6">
            <h2 className="font-serif text-lg font-semibold tracking-tight mb-4 text-ink">Open positions ({jobs.length})</h2>
            {jobs.length === 0 ? (
              <div className="rounded-2xl bg-card p-10 ring-1 ring-black/5 text-center text-sm text-muted-foreground">
                No open positions right now.
              </div>
            ) : (
              <div className="space-y-3">
                {jobs.map((j) => (
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
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <CompanyFollowCard companyId={company.id} companyName={company.name} description={company.description} />
        </aside>
      </section>

      <SiteFooter />
    </div>
  );
}
