import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AdminShell } from "@/components/admin-shell";
import { CompanyLogo } from "@/components/company-logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Pencil, History as HistoryIcon, Search } from "lucide-react";
import { timeAgo, formatEmploymentType } from "@/lib/format";
import type { Database } from "@/integrations/supabase/types";

type Job = Database["public"]["Tables"]["jobs"]["Row"];

export const Route = createFileRoute("/admin/jobs")({
  head: () => ({ meta: [{ title: "Job Moderation — SahanJobs Admin" }] }),
  component: () => (
    <AdminShell pageKey="job_moderation" title="Job Moderation" subtitle="All approved jobs. Edits open in the original posting form.">
      <ApprovedJobsTable />
    </AdminShell>
  ),
});

function ApprovedJobsTable() {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "expired">("all");
  const { isAdmin, user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-approved-jobs", isAdmin, user?.id],
    queryFn: async () => {
      // Companies only see their own approved jobs; Super Admin sees all.
      let companyId: string | null = null;
      if (!isAdmin && user) {
        const { data: prof } = await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle();
        companyId = prof?.company_id ?? null;
      }
      let query = supabase.from("jobs").select("*").eq("status", "approved").order("updated_at", { ascending: false });
      if (!isAdmin) {
        if (!companyId) return [];
        query = query.eq("company_id", companyId);
      }
      const { data, error } = await query;
      if (error) throw error;
      const ids = (data ?? []).map((j) => j.id);
      const counts = new Map<string, number>();
      if (ids.length) {
        const { data: hist } = await supabase.from("job_edit_history").select("job_id").in("job_id", ids);
        (hist ?? []).forEach((h) => counts.set(h.job_id, (counts.get(h.job_id) ?? 0) + 1));
      }
      return (data as Job[]).map((j) => ({ ...j, _edits: counts.get(j.id) ?? 0 }));
    },
  });
  const filtered = useMemo(() => {
    const now = Date.now();
    let rows = data ?? [];
    if (statusFilter !== "all") {
      rows = rows.filter((j) => {
        const expired = !!j.expires_at && new Date(j.expires_at).getTime() < now;
        return statusFilter === "expired" ? expired : !expired;
      });
    }
    if (!q.trim()) return rows;
    const t = q.toLowerCase();
    return rows.filter((j) => (j.title + j.company + j.location + j.category).toLowerCase().includes(t));
  }, [data, q, statusFilter]);

  const counts = useMemo(() => {
    const now = Date.now();
    let active = 0, expired = 0;
    (data ?? []).forEach((j) => {
      if (j.expires_at && new Date(j.expires_at).getTime() < now) expired++; else active++;
    });
    return { all: active + expired, active, expired };
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-md flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search approved jobs…" className="pl-9 h-11 bg-white" />
        </div>
        <div className="inline-flex rounded-full bg-secondary p-1 text-xs font-semibold">
          {([["all", `All (${counts.all})`], ["active", `Active (${counts.active})`], ["expired", `Expired (${counts.expired})`]] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setStatusFilter(v)}
              className={`px-3 py-1.5 rounded-full transition ${statusFilter === v ? "bg-primary text-primary-foreground shadow-sm" : "text-ink-soft hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="h-40 rounded-2xl bg-white animate-pulse ring-1 ring-black/5" />
      ) : !filtered.length ? (
        <div className="rounded-2xl bg-white p-16 text-center ring-1 ring-black/5">
          <p className="text-muted-foreground">No approved jobs.</p>
        </div>
      ) : (
        <ul className="divide-y divide-black/5 rounded-2xl bg-white ring-1 ring-black/5 shadow-sm overflow-hidden">
          {filtered.map((j) => <ApprovedRow key={j.id} job={j} />)}
        </ul>
      )}
    </div>
  );
}

function ApprovedRow({ job }: { job: Job & { _edits?: number } }) {
  const edits = job._edits ?? 0;
  const expired = !!job.expires_at && new Date(job.expires_at).getTime() < Date.now();
  return (
    <li className="flex flex-wrap items-center gap-4 px-6 py-4 hover:bg-hero-band/40">
      <CompanyLogo company={job.company} size={48} className="h-12 w-12 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <h3 className="font-display text-lg font-semibold text-primary">{job.title}</h3>
          {expired ? (
            <Badge className="text-[10px] bg-rose-100 text-rose-700 border-0 hover:bg-rose-100">Expired</Badge>
          ) : (
            <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-0 hover:bg-emerald-100">Active</Badge>
          )}
          <Badge variant="secondary" className="text-[10px]">{job.category}</Badge>
          <Badge variant="outline" className="text-[10px]">{formatEmploymentType(job.employment_type)}</Badge>
          {edits > 0 && (
            <Badge className="text-[10px] bg-amber-100 text-amber-800 border-0 hover:bg-amber-100">
              {edits} modification{edits === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{job.company} · {job.location} · updated {timeAgo(job.updated_at)}</p>
      </div>
      <HistoryDialog jobId={job.id} />
      <Button asChild variant="outline" size="sm" className="rounded-full">
        <Link to="/admin/post-job" search={{ id: job.id } as never}>
          <Pencil className="h-4 w-4" /> Edit in original form
        </Link>
      </Button>
    </li>
  );
}



function HistoryDialog({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    enabled: open,
    queryKey: ["job-history", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_edit_history").select("*").eq("job_id", jobId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="ghost" size="sm" className="rounded-full"><HistoryIcon className="h-4 w-4" /> History</Button></DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit history</DialogTitle></DialogHeader>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
          : !data?.length ? <p className="text-sm text-muted-foreground py-6 text-center">No edits recorded yet.</p>
          : (
            <ul className="space-y-4">
              {data.map((h) => (
                <li key={h.id} className="rounded-xl border border-border bg-secondary/30 p-4">
                  <p className="text-xs text-muted-foreground mb-2">{new Date(h.created_at).toLocaleString()}</p>
                  <div className="space-y-2 text-sm">
                    {Object.entries(h.changes as Record<string, { from: string; to: string }>).map(([field, v]) => (
                      <div key={field}>
                        <p className="font-semibold capitalize text-ink">{field}</p>
                        <p className="text-xs text-destructive line-through">{v.from?.slice(0, 200)}</p>
                        <p className="text-xs text-primary">{v.to?.slice(0, 200)}</p>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
      </DialogContent>
    </Dialog>
  );
}
