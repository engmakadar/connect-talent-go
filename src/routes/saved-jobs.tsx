import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, MapPin, Calendar, Briefcase, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { CompanyLogo } from "@/components/company-logo";
import { SaveJobButton } from "@/components/save-job-button";
import { useAuth } from "@/lib/auth-context";
import { formatEmploymentType } from "@/lib/format";
import { useEffect } from "react";

export const Route = createFileRoute("/saved-jobs")({
  head: () => ({ meta: [{ title: "Saved Jobs — SahanJobs" }] }),
  component: SavedJobsPage,
});

type SavedRow = {
  id: string;
  created_at: string;
  job_id: string;
  jobs: {
    id: string;
    title: string;
    company: string;
    company_id: string | null;
    location: string;
    category: string;
    employment_type: string;
    created_at: string;
    expires_at: string | null;
    status: string;
  } | null;
};

function SavedJobsPage() {
  const { user, loading, isJobseeker } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.navigate({ to: "/auth" });
  }, [loading, user, router]);

  const { data: rows, isLoading } = useQuery({
    enabled: !!user,
    queryKey: ["saved-jobs-list", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saved_jobs")
        .select("id, created_at, job_id, jobs(id, title, company, company_id, location, category, employment_type, created_at, expires_at, status)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SavedRow[];
    },
  });

  const { data: companyMap } = useQuery({
    queryKey: ["saved-jobs-companies"],
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("id, logo_url");
      const m = new Map<string, string | null>();
      (data ?? []).forEach((c) => m.set(c.id, c.logo_url));
      return m;
    },
  });

  const items = (rows ?? []).filter((r) => r.jobs && r.jobs.status === "approved");

  return (
    <div className="min-h-screen flex flex-col bg-hero-band/40">
      <SiteHeader />
      <section className="mx-auto w-full max-w-5xl px-4 md:px-8 py-10 flex-1">
        <div className="flex items-center gap-3 mb-2">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-soft text-primary">
            <Bookmark className="h-5 w-5" />
          </span>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-ink">Saved Jobs</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">Jobs you've bookmarked to revisit later.</p>

        {!isJobseeker && user ? (
          <div className="rounded-2xl bg-white p-10 text-center ring-1 ring-black/5">
            <p className="text-muted-foreground">Saved jobs are available to jobseeker accounts.</p>
          </div>
        ) : isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-white ring-1 ring-black/5 animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl bg-white p-16 text-center ring-1 ring-black/5">
            <Bookmark className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground mb-4">You haven't saved any jobs yet.</p>
            <Link to="/jobs" className="inline-flex items-center rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              Browse jobs
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-black/5 rounded-2xl bg-white ring-1 ring-black/5 shadow-sm overflow-hidden">
            {items.map((r) => {
              const job = r.jobs!;
              const logoUrl = job.company_id ? companyMap?.get(job.company_id) ?? null : null;
              const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) : "—";
              return (
                <li key={r.id} className="px-5 py-4 hover:bg-hero-band/40 transition-colors">
                  <div className="flex gap-4 items-start">
                    <CompanyLogo company={job.company} logoUrl={logoUrl} size={48} className="h-12 w-12 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <Link to="/jobs/$jobId" params={{ jobId: job.id }} className="block group">
                        <h3 className="font-display text-base md:text-lg font-bold text-primary group-hover:underline">{job.title}</h3>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
                          <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{job.company}</span>
                          <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{job.location}</span>
                          <span className="inline-flex items-center gap-1"><Briefcase className="h-3 w-3" />{formatEmploymentType(job.employment_type)}</span>
                          <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />Saved {fmt(r.created_at)}</span>
                          {job.expires_at && <span className="text-muted-foreground">Closes {fmt(job.expires_at)}</span>}
                        </div>
                      </Link>
                    </div>
                    <SaveJobButton jobId={job.id} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <SiteFooter />
    </div>
  );
}
