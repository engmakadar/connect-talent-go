import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowLeft, MapPin, Clock, GraduationCap, BarChart3, Building2,
  Briefcase, Mail, ExternalLink, CheckCircle2, Share2, Check,
  DollarSign, CalendarDays, BadgeCheck, ArrowRight, FileText, Download,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { CompanyLogo } from "@/components/company-logo";
import { RichTextView } from "@/components/rich-text-editor";
import { formatEmploymentType, formatSalary, timeAgo } from "@/lib/format";
import { SaveJobButton } from "@/components/save-job-button";
import { ApplyButton } from "@/components/apply-button";

export const Route = createFileRoute("/jobs/$jobId")({
  component: JobDetail,
  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center bg-hero-band">
      <div className="text-center">
        <h1 className="font-serif text-3xl font-semibold mb-2">Job not found</h1>
        <Link to="/jobs" className="text-primary underline">Back to jobs</Link>
      </div>
    </div>
  ),
});

function JobDetail() {
  const { jobId } = Route.useParams();
  const [copied, setCopied] = useState(false);

  type JobRow = {
    id: string; title: string; company: string; location: string; category: string; status: string;
    employment_type: string; salary_min: number | null; salary_max: number | null; currency: string;
    description: string; responsibilities: string; requirements: string; education: string | null;
    experience_years: number | null; experience_text: string | null; skills: string[] | null;
    application_url: string | null; expires_at: string | null; created_at: string;
    posting_type: string | null; tender_documents: unknown;
    company_id: string | null;
  };
  const { data: job, isLoading } = useQuery({
    queryKey: ["job", jobId],
    queryFn: async () => {
      const client = supabase as unknown as { from: (t: string) => { select: (s: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: JobRow | null; error: unknown }> } } } };
      const { data, error } = await client.from("jobs_public").select("*").eq("id", jobId).maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data;
    },
  });

  const { data: applyEmail } = useQuery({
    enabled: !!job,
    queryKey: ["job-apply-email", jobId],
    queryFn: async () => {
      const rpc = supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: string | null }>;
      const { data } = await rpc("get_job_apply_email", { _job_id: jobId });
      return data ?? null;
    },
  });

  const { data: companyRow } = useQuery({
    enabled: !!job?.company_id,
    queryKey: ["job-company", job?.company_id],
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("logo_url, name, website, description, hq_location, location").eq("id", job!.company_id!).maybeSingle();
      return data;
    },
  });

  const { data: similar } = useQuery({
    enabled: !!job,
    queryKey: ["similar-jobs", job?.category, job?.id],
    queryFn: async () => {
      const { data } = await supabase.from("jobs")
        .select("id, title, company, location, category, employment_type, salary_min, salary_max, currency, created_at, company_id")
        .eq("status", "approved").eq("category", job!.category).neq("id", job!.id)
        .or(`expires_at.is.null,expires_at.gte.${new Date().toISOString()}`)
        .order("created_at", { ascending: false }).limit(3);
      return data ?? [];
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-hero-band">
        <SiteHeader />
        <div className="container mx-auto px-6 py-20"><div className="h-96 rounded-2xl bg-card animate-pulse" /></div>
      </div>
    );
  }
  if (!job) return null;

  const isTender = job.posting_type === "tender";
  const tenderDocs = (job.tender_documents as { name: string; path: string }[] | null) ?? [];

  const handleShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (typeof navigator !== "undefined" && (navigator as Navigator).share) {
        await (navigator as Navigator).share({ title: job.title, text: `${job.title} at ${job.company}`, url });
        return;
      }
    } catch { /* noop */ }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const downloadDoc = async (path: string, name: string) => {
    const { data, error } = await supabase.storage.from("tender-documents").createSignedUrl(path, 300);
    if (error || !data) return;
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = name;
    a.target = "_blank";
    a.click();
  };

  // Education is shown only in the sidebar (corner placement). Requirements must always come last.
  const sections: { title: string; body: string; icon: React.ReactNode }[] = isTender
    ? [
        { title: "About the tender", body: job.description, icon: <Briefcase className="h-4 w-4" /> },
      ]
    : [
        { title: "About the role", body: job.description, icon: <Briefcase className="h-4 w-4" /> },
        { title: "Duties & Responsibilities", body: job.responsibilities, icon: <CheckCircle2 className="h-4 w-4" /> },
        { title: "Requirements", body: job.requirements, icon: <CheckCircle2 className="h-4 w-4" /> },
      ];

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

      <section className="mx-auto max-w-6xl w-full px-6 pt-8 pb-10 grid lg:grid-cols-[1fr_300px] gap-x-10 gap-y-6 flex-1">
        <div>
          <span className="inline-block rounded bg-secondary px-2.5 py-1 text-xs font-semibold text-ink mb-4">{job.location}</span>

          <h1 className="font-sans text-2xl md:text-[28px] font-bold tracking-tight text-ink leading-tight mb-3">{job.title}</h1>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink/85 pb-3">
            <span><strong className="font-semibold">Organization:</strong>{" "}
              {companyRow?.website ? (
                <a href={companyRow.website} target="_blank" rel="noopener noreferrer" className="text-primary underline">{job.company}</a>
              ) : <span className="text-primary underline">{job.company}</span>}
            </span>
            <span className="text-muted-foreground">·</span>
            <span><strong className="font-semibold">Posted:</strong>{" "}{new Date(job.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>
            {job.expires_at && (
              <>
                <span className="text-muted-foreground">·</span>
                <span><strong className="font-semibold">Closing date:</strong>{" "}{new Date(job.expires_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>
              </>
            )}
          </div>

          <div className="h-px bg-destructive mb-6" />

          <div className="flex flex-wrap items-center gap-2 mb-6">
            {isTender && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 uppercase tracking-wider">Tender</span>}
            <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">{job.category}</span>
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-ink">{formatEmploymentType(job.employment_type)}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
              <BadgeCheck className="h-3 w-3" /> Reviewed
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            <Stat icon={<DollarSign className="h-4 w-4" />} label="Compensation" value={formatSalary(job.salary_min, job.salary_max, job.currency)} />
            <Stat icon={<BarChart3 className="h-4 w-4" />} label="Experience" value={job.experience_text || `${job.experience_years}+ years`} />
            <Stat icon={<Briefcase className="h-4 w-4" />} label="Type" value={formatEmploymentType(job.employment_type)} />
            <Stat icon={<MapPin className="h-4 w-4" />} label="Location" value={job.location} />
          </div>

          <article className="space-y-6">
            {/* About + Duties first, then Skills/Tender Docs, then Requirements at the very end. */}
            {sections.filter((s) => s.title !== "Requirements").map((s) => (
              <div key={s.title} className="rounded-2xl bg-card p-6 ring-1 ring-black/5">
                <h2 className="font-serif text-lg font-semibold tracking-tight mb-4 flex items-center gap-3 text-ink">
                  <span className="inline-grid place-items-center h-8 w-8 rounded-full bg-primary-soft text-primary">{s.icon}</span>
                  {s.title}
                </h2>
                <RichTextView html={s.body} />
              </div>
            ))}

            {isTender && tenderDocs.length > 0 && (
              <div className="rounded-2xl bg-card p-6 ring-1 ring-black/5">
                <h2 className="font-serif text-lg font-semibold tracking-tight mb-4 flex items-center gap-3 text-ink">
                  <span className="inline-grid place-items-center h-8 w-8 rounded-full bg-primary-soft text-primary"><FileText className="h-4 w-4" /></span>
                  Tender Documents
                </h2>
                <ul className="space-y-2">
                  {tenderDocs.map((d, i) => (
                    <li key={i}>
                      <button onClick={() => downloadDoc(d.path, d.name)} className="w-full flex items-center justify-between rounded-xl bg-secondary/60 hover:bg-secondary px-4 py-3 text-left">
                        <span className="flex items-center gap-2.5 text-sm font-medium text-ink"><FileText className="h-4 w-4 text-primary" /> {d.name}</span>
                        <Download className="h-4 w-4 text-primary" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {job.skills && job.skills.length > 0 && (
              <div className="rounded-2xl bg-card p-6 ring-1 ring-black/5">
                <h2 className="font-serif text-lg font-semibold tracking-tight mb-4 text-ink">Skills</h2>
                <div className="flex flex-wrap gap-2">
                  {job.skills.map((s) => <span key={s} className="rounded-full bg-secondary px-3 py-1.5 text-sm font-medium text-ink">{s}</span>)}
                </div>
              </div>
            )}

            {/* Requirements is always the last section on the job posting. */}
            {sections.filter((s) => s.title === "Requirements").map((s) => (
              <div key={s.title} className="rounded-2xl bg-card p-6 ring-1 ring-black/5">
                <h2 className="font-serif text-lg font-semibold tracking-tight mb-4 flex items-center gap-3 text-ink">
                  <span className="inline-grid place-items-center h-8 w-8 rounded-full bg-primary-soft text-primary">{s.icon}</span>
                  {s.title}
                </h2>
                <RichTextView html={s.body} />
              </div>
            ))}
          </article>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl bg-card p-5 ring-1 ring-black/5 space-y-3">
            <div className="flex items-center gap-3">
              <CompanyLogo company={job.company} logoUrl={companyRow?.logo_url ?? null} size={44} className="h-11 w-11 shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Organization</p>
                <p className="font-semibold text-ink truncate">{companyRow?.name ?? job.company}</p>
                {companyRow?.website && (
                  <a href={companyRow.website} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary hover:underline truncate inline-flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" /> Website
                  </a>
                )}
              </div>
            </div>
            {(companyRow?.hq_location || companyRow?.location) && (
              <p className="text-xs text-muted-foreground inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> HQ: {companyRow?.hq_location ?? companyRow?.location}</p>
            )}
            <div className="h-px bg-border" />
            <Row icon={<Briefcase className="h-4 w-4" />} label="Type" value={formatEmploymentType(job.employment_type)} />
            <Row icon={<BarChart3 className="h-4 w-4" />} label="Experience" value={job.experience_text || `${job.experience_years}+ years`} />
            {!isTender && <Row icon={<GraduationCap className="h-4 w-4" />} label="Education" value={(job.education || "").split("\n")[0].slice(0, 60) || "—"} />}
            <Row icon={<MapPin className="h-4 w-4" />} label="Location" value={job.location} />
            <Row icon={<CalendarDays className="h-4 w-4" />} label="Posted" value={timeAgo(job.created_at)} />
            <p className="font-serif text-base font-semibold text-primary pt-1">{formatSalary(job.salary_min, job.salary_max, job.currency)}</p>
          </div>

          <div className="rounded-2xl bg-card p-5 ring-1 ring-black/5 space-y-2">
            {!isTender && <ApplyButton jobId={job.id} />}
            {job.application_url ? (
              <a href={job.application_url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-ink ring-1 ring-black/10 hover:bg-secondary">
                Apply on company site <ExternalLink className="h-4 w-4" />
              </a>
            ) : applyEmail ? (
              <a href={`mailto:${applyEmail}`} className="flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-ink ring-1 ring-black/10 hover:bg-secondary">
                Apply via email <Mail className="h-4 w-4" />
              </a>
            ) : null}
            <SaveJobButton jobId={job.id} variant="button" className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink ring-1 ring-black/10 hover:bg-secondary" />
            <button onClick={handleShare} className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink ring-1 ring-black/10 hover:bg-secondary">
              {copied ? <><Check className="h-4 w-4" /> Copied</> : <><Share2 className="h-4 w-4" /> Share job link</>}
            </button>
          </div>
        </aside>
      </section>

      {similar && similar.length > 0 && (
        <section className="bg-hero-band/30 border-t border-black/5">
          <div className="mx-auto max-w-6xl px-6 py-14">
            <h2 className="font-serif text-2xl font-semibold tracking-tight mb-6 text-ink">Similar roles in {job.category}</h2>
            <div className="grid md:grid-cols-3 gap-5">
              {similar.map((s) => (
                <Link key={s.id} to="/jobs/$jobId" params={{ jobId: s.id }} className="group rounded-2xl bg-card p-6 ring-1 ring-black/5 hover:-translate-y-0.5 hover:shadow-md transition-all">
                  <div className="flex items-start gap-3 mb-4">
                    <CompanyLogo company={s.company} size={40} className="h-10 w-10 shrink-0" />
                    <div>
                      <h3 className="font-semibold leading-snug text-ink line-clamp-2 group-hover:text-primary">{s.title}</h3>
                      <p className="mt-0.5 text-sm font-medium text-primary">{s.company}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {s.location}</span>
                    <span className="font-medium text-ink">{formatSalary(s.salary_min, s.salary_max, s.currency)}</span>
                  </div>
                  <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                    View details <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <SiteFooter />
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="text-primary mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="font-medium text-ink truncate">{value}</p>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-hero-band/60 p-3 ring-1 ring-black/5">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        <span className="text-primary">{icon}</span> {label}
      </div>
      <p className="font-semibold text-ink text-sm truncate">{value}</p>
    </div>
  );
}

// Suppress unused warnings (Building2/Clock retained in case of future use)
void Building2; void Clock;
