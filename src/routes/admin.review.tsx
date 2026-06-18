import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AdminShell } from "@/components/admin-shell";
import { CompanyLogo } from "@/components/company-logo";
import { RichTextView } from "@/components/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Check, X, FileText, ShieldAlert, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { formatEmploymentType, timeAgo, statusBadgeVariant } from "@/lib/format";
import { logAudit } from "@/lib/audit";
import type { Database } from "@/integrations/supabase/types";

type Job = Database["public"]["Tables"]["jobs"]["Row"];

export const Route = createFileRoute("/admin/review")({
  head: () => ({ meta: [{ title: "Job Approval — SahanJobs Admin" }] }),
  component: AdminReview,
});

function AdminReview() {
  const { user, isAdmin, loading } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"pending" | "approved" | "rejected" | "expired">("pending");
  const [typeFilter, setTypeFilter] = useState<"all" | "job" | "tender">("all");

  // Companies need their own company_id to scope the list.
  const { data: companyId } = useQuery({
    enabled: !!user && !isAdmin,
    queryKey: ["my-company-id", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("company_id").eq("id", user!.id).maybeSingle();
      return data?.company_id ?? null;
    },
  });

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["admin-jobs", tab, typeFilter, isAdmin, companyId ?? null],
    enabled: !!user && (isAdmin || companyId !== undefined),
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      let q = supabase
        .from("jobs")
        .select("id,title,company,company_id,location,category,status,posting_type,employment_type,created_at,review_notes,description,responsibilities,requirements,education,tender_documents,expires_at")
        .order("created_at", { ascending: false });
      if (tab === "expired") {
        q = q.eq("status", "approved").not("expires_at", "is", null).lt("expires_at", nowIso);
      } else {
        q = q.eq("status", tab as Database["public"]["Enums"]["job_status"]);
        // Approved tab shows ALL approved jobs regardless of expiration.
      }
      if (typeFilter !== "all") q = q.eq("posting_type", typeFilter);
      // Scope to this user's company unless they're a Super Admin.
      if (!isAdmin) {
        if (!companyId) return [];
        q = q.eq("company_id", companyId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as Job[];
    },
    staleTime: 20_000,
  });

  const updateStatus = async (id: string, status: "approved" | "rejected", notes?: string) => {
    const { error } = await supabase
      .from("jobs")
      .update({ status, review_notes: notes ?? null, reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    await logAudit({ action: status === "approved" ? "job.approve" : "job.reject", resource_type: "job", resource_id: id, metadata: { notes } });
    toast.success(`Job ${status}.`);
    qc.invalidateQueries({ queryKey: ["admin-jobs"] });
    qc.invalidateQueries({ queryKey: ["recent-jobs"] });
  };

  if (loading) return null;

  return (
    <AdminShell
      pageKey="job_approval"
      title="Job Approval"
      subtitle={
        isAdmin
          ? "Approve or reject new submissions across every company."
          : "Track the status of your company's job submissions. Only Super Admins can approve or reject."
      }
    >
      <div className="rounded-2xl bg-white p-6 ring-1 ring-black/5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="bg-secondary">
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
              <TabsTrigger value="expired">Expired</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="inline-flex rounded-full bg-secondary p-1 text-xs font-semibold">
            {(["all", "job", "tender"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 rounded-full transition ${typeFilter === t ? "bg-primary text-primary-foreground shadow-sm" : "text-ink-soft hover:text-ink"}`}
              >
                {t === "all" ? "All" : t === "job" ? "Jobs" : "Tenders"}
              </button>
            ))}
          </div>
        </div>

        {!isAdmin && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
            <p>
              You're viewing your company's submissions in read-only mode. Approval and rejection are reserved for Super Admins.
            </p>
          </div>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsContent value={tab} className="space-y-3">
            {isLoading ? (
              <div className="h-40 rounded-xl bg-secondary animate-pulse" />
            ) : !jobs?.length ? (
              <p className="text-muted-foreground py-12 text-center">Nothing here.</p>
            ) : (
              jobs.map((job) => (
                <JobReviewCard
                  key={job.id}
                  job={job}
                  canModerate={isAdmin}
                  onApprove={(notes) => updateStatus(job.id, "approved", notes)}
                  onReject={(notes) => updateStatus(job.id, "rejected", notes)}
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AdminShell>
  );
}

function JobReviewCard({
  job, canModerate, onApprove, onReject,
}: {
  job: Job;
  canModerate: boolean;
  onApprove: (notes?: string) => void;
  onReject: (notes?: string) => void;
}) {
  const [notes, setNotes] = useState(job.review_notes ?? "");
  const docCount = (job.tender_documents as unknown[] | null)?.length ?? 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 flex-1 min-w-[240px]">
          <CompanyLogo company={job.company} size={48} className="h-12 w-12 shrink-0" />
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Badge variant={statusBadgeVariant(job.status)}>{job.status}</Badge>
              {job.posting_type === "tender" && <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-0">Tender</Badge>}
              <Badge variant="secondary">{job.category}</Badge>
              <Badge variant="outline">{formatEmploymentType(job.employment_type)}</Badge>
              {docCount > 0 && <Badge variant="outline" className="gap-1"><FileText className="h-3 w-3" /> {docCount} docs</Badge>}
            </div>
            <h3 className="font-display text-lg font-semibold">{job.title}</h3>
            <p className="text-sm text-muted-foreground">{job.company} · {job.location} · {timeAgo(job.created_at)}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button asChild size="sm" variant="outline" className="rounded-full">
            <Link to="/jobs/$jobId" params={{ jobId: job.id }} target="_blank"><ExternalLink className="h-4 w-4" /> Preview as public</Link>
          </Button>
          {canModerate && job.status !== "approved" && (
            <Button size="sm" className="rounded-full" onClick={() => onApprove(notes)}><Check className="h-4 w-4" /> Approve</Button>
          )}
          {canModerate && job.status !== "rejected" && (
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => onReject(notes)}><X className="h-4 w-4" /> Reject</Button>
          )}
        </div>
      </div>

      <details className="text-sm text-muted-foreground">
        <summary className="cursor-pointer text-foreground/80 hover:text-foreground">Preview submission</summary>
        <div className="mt-3 space-y-4">
          <Section title="Description"><RichTextView html={job.description} /></Section>
          <Section title="Duties & Responsibilities"><RichTextView html={job.responsibilities} /></Section>
          <Section title="Requirements"><RichTextView html={job.requirements} /></Section>
          <Section title="Education"><RichTextView html={job.education} /></Section>
        </div>
      </details>

      {canModerate && (
        <div className="mt-4">
          <Label className="text-xs">Review notes (optional)</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1" placeholder="Feedback for the employer..." />
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-ink-soft mb-1">{title}</p>
      {children}
    </div>
  );
}
