import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ShieldAlert, Gavel, UserX } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { resolveServiceDispute } from "@/lib/services.functions";
import { DISPUTE_STATUS_LABEL } from "@/lib/service-lifecycle";

export const Route = createFileRoute("/admin/service-disputes")({
  head: () => ({
    meta: [
      { title: "Service disputes — SahanJobs Admin" },
      { name: "description", content: "Review and resolve disputes between customers and skilled workers." },
      { property: "og:title", content: "Service disputes — SahanJobs Admin" },
      { property: "og:description", content: "Review and resolve service disputes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminServiceDisputesPage,
});

const STATUS_STYLE: Record<string, string> = {
  dispute_created: "bg-red-100 text-red-800 border-0",
  admin_review: "bg-amber-100 text-amber-800 border-0",
  decision: "bg-sky-100 text-sky-800 border-0",
  resolved: "bg-primary/10 text-primary border-0",
};

function AdminServiceDisputesPage() {
  const qc = useQueryClient();
  const resolveFn = useServerFn(resolveServiceDispute);
  const [target, setTarget] = useState<{ id: string; next: "admin_review" | "decision" | "resolved" } | null>(null);
  const [decision, setDecision] = useState("");
  const [suspend, setSuspend] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: disputes, isLoading } = useQuery({
    queryKey: ["admin-service-disputes"],
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_disputes")
        .select("id, booking_id, raised_by, reason, status, decision, created_at, updated_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      const bookingIds = Array.from(new Set(rows.map((d) => d.booking_id)));
      const { data: bookings } = bookingIds.length
        ? await supabase.from("service_bookings").select("id, description, customer_name, status, worker_id").in("id", bookingIds)
        : { data: [] };
      const workerIds = Array.from(new Set((bookings ?? []).map((b) => b.worker_id)));
      const { data: workers } = workerIds.length
        ? await supabase.from("skill_workers").select("id, full_name, suspended").in("id", workerIds)
        : { data: [] };
      const bById = new Map((bookings ?? []).map((b) => [b.id, b]));
      const wById = new Map((workers ?? []).map((w) => [w.id, w]));
      return rows.map((d) => {
        const b = bById.get(d.booking_id);
        return { ...d, booking: b ?? null, worker: b ? wById.get(b.worker_id) ?? null : null };
      });
    },
  });

  const act = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await resolveFn({ data: { disputeId: target.id, status: target.next, decision: decision || undefined, suspendWorker: suspend } });
      toast.success(`Dispute moved to "${DISPUTE_STATUS_LABEL[target.next]}".`);
      setTarget(null); setDecision(""); setSuspend(false);
      qc.invalidateQueries({ queryKey: ["admin-service-disputes"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminShell
      pageKey="service_disputes"
      title="Service Disputes"
      subtitle="Dispute workflow: created → admin review → decision → resolved. You can suspend a worker where necessary."
    >
      {isLoading ? (
        <p className="text-muted-foreground">Loading disputes…</p>
      ) : (disputes ?? []).length === 0 ? (
        <div className="rounded-2xl bg-card p-12 ring-1 ring-black/5 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">No disputes have been raised.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(disputes ?? []).map((d) => (
            <div key={d.id} className="rounded-2xl bg-card p-5 ring-1 ring-black/5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{d.booking?.customer_name ?? "Customer"} vs {d.worker?.full_name ?? "Worker"}</p>
                  <p className="mt-1 text-sm text-ink">{d.reason}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Job: {d.booking?.description?.slice(0, 80) ?? "—"} · opened {new Date(d.created_at).toLocaleString()}
                  </p>
                  {d.decision && <p className="mt-2 text-xs rounded-lg bg-secondary/60 px-3 py-2 text-ink">Decision: {d.decision}</p>}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge className={STATUS_STYLE[d.status] ?? ""} variant="outline">{DISPUTE_STATUS_LABEL[d.status] ?? d.status}</Badge>
                  {d.worker?.suspended && <Badge variant="outline" className="text-red-600">Worker suspended</Badge>}
                </div>
              </div>
              {d.status !== "resolved" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {d.status === "dispute_created" && (
                    <Button size="sm" variant="outline" onClick={() => setTarget({ id: d.id, next: "admin_review" })}>Start admin review</Button>
                  )}
                  {(d.status === "dispute_created" || d.status === "admin_review") && (
                    <Dialog open={target?.id === d.id && target.next === "decision"} onOpenChange={(o) => !o && setTarget(null)}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" onClick={() => setTarget({ id: d.id, next: "decision" })}>
                          <Gavel className="h-3.5 w-3.5 mr-1" /> Issue decision
                        </Button>
                      </DialogTrigger>
                      <DisputeDialog
                        title="Issue decision"
                        decision={decision} setDecision={setDecision}
                        suspend={suspend} setSuspend={setSuspend}
                        busy={busy} onConfirm={() => void act()}
                        confirmLabel="Save decision"
                      />
                    </Dialog>
                  )}
                  <Dialog open={target?.id === d.id && target.next === "resolved"} onOpenChange={(o) => !o && setTarget(null)}>
                    <DialogTrigger asChild>
                      <Button size="sm" onClick={() => setTarget({ id: d.id, next: "resolved" })}>Resolve</Button>
                    </DialogTrigger>
                    <DisputeDialog
                      title="Resolve dispute"
                      decision={decision} setDecision={setDecision}
                      suspend={suspend} setSuspend={setSuspend}
                      busy={busy} onConfirm={() => void act()}
                      confirmLabel="Mark resolved"
                    />
                  </Dialog>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}

function DisputeDialog(props: {
  title: string; decision: string; setDecision: (v: string) => void;
  suspend: boolean; setSuspend: (v: boolean) => void;
  busy: boolean; onConfirm: () => void; confirmLabel: string;
}) {
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{props.title}</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div>
          <Label>Decision note (shared with the raiser)</Label>
          <Textarea rows={3} value={props.decision} onChange={(e) => props.setDecision(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={props.suspend} onChange={(e) => props.setSuspend(e.target.checked)} />
          <span className="inline-flex items-center gap-1"><UserX className="h-4 w-4 text-red-500" /> Suspend the worker's account</span>
        </label>
      </div>
      <DialogFooter>
        <Button onClick={props.onConfirm} disabled={props.busy}>{props.busy ? "Saving…" : props.confirmLabel}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
