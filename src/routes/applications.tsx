import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { Briefcase, ChevronRight, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { timeAgo } from "@/lib/format";

export const Route = createFileRoute("/applications")({
  head: () => ({ meta: [{ title: "My Applications — SahanJobs" }] }),
  component: ApplicationsPage,
});

function ApplicationsPage() {
  const { user, loading } = useAuth();

  const { data, isLoading } = useQuery({
    enabled: !!user,
    queryKey: ["my-applications", user?.id],
    queryFn: async () => {
      const { data: apps, error } = await supabase
        .from("job_applications")
        .select("id, status, match_score, created_at, job_id")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!apps?.length) return [];
      const jobIds = apps.map((a) => a.job_id);
      const { data: jobs } = await supabase
        .from("jobs")
        .select("id, title, company, location, category")
        .in("id", jobIds);
      const byId = new Map(jobs?.map((j) => [j.id, j]) ?? []);
      return apps.map((a) => ({ ...a, job: byId.get(a.job_id) }));
    },
  });

  return (
    <div className="min-h-screen flex flex-col bg-hero-band/40">
      <SiteHeader />
      <main className="flex-1 mx-auto w-full max-w-5xl px-6 py-12">
        <h1 className="font-serif text-3xl font-bold text-ink mb-2">My Applications</h1>
        <p className="text-muted-foreground mb-8">Track every role you've applied to via SahanJobs.</p>

        {loading || isLoading ? (
          <div className="h-40 rounded-2xl bg-white animate-pulse" />
        ) : !user ? (
          <div className="rounded-2xl bg-white p-12 ring-1 ring-black/5 text-center">
            <p className="text-muted-foreground mb-4">Sign in to track your applications.</p>
            <Link to="/auth" className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">Sign in</Link>
          </div>
        ) : !data?.length ? (
          <div className="rounded-2xl bg-white p-12 ring-1 ring-black/5 text-center">
            <Briefcase className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground mb-4">You haven't applied to any positions yet.</p>
            <Link to="/jobs" className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">Browse jobs</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {data.map((a) => (
              <Link key={a.id} to="/jobs/$jobId" params={{ jobId: a.job_id }} className="block rounded-2xl bg-white p-5 ring-1 ring-black/5 hover:ring-primary/40 transition-all">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <Badge variant="secondary" className="text-[10px]">{a.status}</Badge>
                      {a.match_score != null && (
                        <Badge className="bg-primary/10 text-primary border-0 text-[10px]">{a.match_score}% match</Badge>
                      )}
                      {a.job?.category && <Badge variant="outline" className="text-[10px]">{a.job.category}</Badge>}
                    </div>
                    <h3 className="font-semibold text-ink mb-0.5 truncate">{a.job?.title || "—"}</h3>
                    <p className="text-sm text-primary font-medium">{a.job?.company}</p>
                    <p className="mt-1 inline-flex items-center gap-3 text-xs text-muted-foreground">
                      {a.job?.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {a.job.location}</span>}
                      <span>Applied {timeAgo(a.created_at)}</span>
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
