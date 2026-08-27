import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Workflow, Check, X, Play, Flag, BadgeCheck, Star, Wrench, ShieldAlert, CircleDot,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  acceptServiceBooking, advanceServiceBooking, rateServiceWorker,
} from "@/lib/services.functions";
import { SERVICE_STATUS_LABEL } from "@/lib/service-lifecycle";

export const Route = createFileRoute("/services/workflow")({
  head: () => ({
    meta: [
      { title: "Service job workflow — SahanJobs" },
      { name: "description", content: "Process every hand-skill booking step by step: accepted, work started, work finished, returned to customer, confirmed and rated." },
      { property: "og:title", content: "Service job workflow — SahanJobs" },
      { property: "og:description", content: "Track and process hand-skill bookings through the full job lifecycle." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ServiceWorkflowPage,
});

/** The six workflow milestones the business tracks, in order. */
const STEPS = [
  { key: "accepted", label: "Job Accepted" },
  { key: "in_progress", label: "Work Started" },
  { key: "completed", label: "Work Finished" },
  { key: "customer_confirmed", label: "Returned to Customer" },
  { key: "rated", label: "Customer Confirms Completion" },
  { key: "closed", label: "Rating Submitted" },
] as const;

const STEP_ORDER: Record<string, number> = {
  requested: 0, matched: 0, accepted: 1, confirmed: 1, in_progress: 2,
  completed: 3, customer_confirmed: 4, rated: 5, closed: 6,
};

function Stepper({ status }: { status: string }) {
  const reached = STEP_ORDER[status] ?? 0;
  return (
    <ol className="mt-4 grid gap-2 sm:grid-cols-6">
      {STEPS.map((s, i) => {
        const done = reached > i;
        const current = reached === i + 1;
        return (
          <li key={s.key} className="flex items-start gap-2">
            <span
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                done ? "bg-primary text-primary-foreground"
                  : current ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {done ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span className={`text-[11px] leading-tight ${done || current ? "text-ink font-semibold" : "text-muted-foreground"}`}>
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function StatCell({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-black/5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone || "text-ink"}`}>{value}</p>
    </div>
  );
}

function ServiceWorkflowPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const acceptFn = useServerFn(acceptServiceBooking);
  const advanceFn = useServerFn(advanceServiceBooking);
  const rateFn = useServerFn(rateServiceWorker);

  const [review, setReview] = useState<string | null>(null);
  const [perf, setPerf] = useState(5);
  const [behave, setBehave] = useState(5);
  const [comment, setComment] = useState("");

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  const { data } = useQuery({
    enabled: !!user,
    queryKey: ["service-workflow", user?.id, isAdmin],
    staleTime: 15_000,
    queryFn: async () => {
      const { data: worker } = await supabase.from("skill_workers").select("id, full_name").eq("user_id", user!.id).maybeSingle();
      // Super Admins manage the whole pipeline, so they see every booking.
      const [{ data: asCustomer }, { data: asWorker }] = await Promise.all([
        isAdmin
          ? supabase.from("service_bookings").select("*").order("created_at", { ascending: false })
          : supabase.from("service_bookings").select("*").eq("customer_id", user!.id).order("created_at", { ascending: false }),
        worker
          ? supabase.from("service_bookings").select("*").eq("worker_id", worker.id).order("created_at", { ascending: false })
          : Promise.resolve({ data: [] as never[] }),
      ]);
      const rows = [...(asWorker ?? []), ...(asCustomer ?? [])];
      const seen = new Set<string>();
      const unique = rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
      const workerIds = Array.from(new Set(unique.map((b) => b.worker_id)));
      const { data: workers } = workerIds.length
        ? await supabase.from("skill_workers").select("id, full_name, phone, trades").in("id", workerIds)
        : { data: [] };
      const byId = new Map((workers ?? []).map((w) => [w.id, w]));
      return {
        workerId: worker?.id ?? null,
        rows: unique.map((b) => ({ ...b, workerProfile: byId.get(b.worker_id) ?? null })),
      };
    },
  });

  const rows = data?.rows ?? [];
  const workerId = data?.workerId ?? null;

  const stats = useMemo(() => {
    const accepted = rows.filter((r) => ["accepted", "confirmed", "in_progress", "completed", "customer_confirmed", "rated", "closed"].includes(r.status)).length;
    const declined = rows.filter((r) =>
      r.status === "cancelled" || r.status === "expired" ||
      ((r.declined_by as string[] | null)?.length ?? 0) > 0,
    ).length;
    const processed = rows.filter((r) => ["rated", "closed"].includes(r.status)).length;
    const pending = rows.filter((r) => ["requested", "matched"].includes(r.status)).length;
    const inFlight = rows.filter((r) => ["accepted", "confirmed", "in_progress", "completed", "customer_confirmed"].includes(r.status)).length;
    const disputed = rows.filter((r) => r.status === "disputed").length;
    return { accepted, declined, processed, pending, inFlight, disputed, total: rows.length };
  }, [rows]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["service-workflow"] });
    qc.invalidateQueries({ queryKey: ["my-bookings"] });
    qc.invalidateQueries({ queryKey: ["service-orders"] });
  };

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Action failed."); }
  };

  const submitReview = () => {
    if (!review) return;
    void run(
      () => rateFn({ data: { bookingId: review, performance: perf, behaviour: behave, comment: comment || undefined } }),
      "Rating submitted.",
    );
    setReview(null); setComment(""); setPerf(5); setBehave(5);
  };

  const Actions = ({ b }: { b: (typeof rows)[number] }) => {
    const isWorker = !!workerId && b.worker_id === workerId;
    const isCustomer = b.customer_id === user?.id;
    const adv = (status: string, ok: string) => () => void run(() => advanceFn({ data: { bookingId: b.id, status } }), ok);

    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {isWorker && (b.status === "requested" || b.status === "matched") && (
          <Button size="sm" onClick={() => void run(() => acceptFn({ data: { bookingId: b.id } }), "Job accepted.")}>
            <Check className="h-4 w-4 mr-1" /> Accept job
          </Button>
        )}
        {isWorker && b.status === "accepted" && (
          <Button size="sm" variant="outline" onClick={adv("confirmed", "Booking confirmed.")}>
            <BadgeCheck className="h-4 w-4 mr-1" /> Confirm booking
          </Button>
        )}
        {isWorker && b.status === "confirmed" && (
          <Button size="sm" onClick={adv("in_progress", "Work started.")}><Play className="h-4 w-4 mr-1" /> Start work</Button>
        )}
        {isWorker && b.status === "in_progress" && (
          <Button size="sm" onClick={adv("completed", "Work finished — returned to customer.")}>
            <Flag className="h-4 w-4 mr-1" /> Finish work
          </Button>
        )}
        {isCustomer && b.status === "completed" && (
          <Button size="sm" onClick={adv("customer_confirmed", "Completion confirmed.")}>
            <BadgeCheck className="h-4 w-4 mr-1" /> Confirm completion
          </Button>
        )}
        {isCustomer && (b.status === "completed" || b.status === "customer_confirmed") && (
          <Dialog open={review === b.id} onOpenChange={(o) => setReview(o ? b.id : null)}>
            <DialogTrigger asChild><Button size="sm" variant="outline"><Star className="h-4 w-4 mr-1" /> Submit rating</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Rate {b.workerProfile?.full_name ?? "the worker"}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                {[
                  { label: "Job performance", value: perf, set: setPerf },
                  { label: "Behaviour & professionalism", value: behave, set: setBehave },
                ].map((r) => (
                  <div key={r.label} className="flex items-center justify-between">
                    <Label>{r.label}</Label>
                    <span className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <button key={i} type="button" onClick={() => r.set(i)} aria-label={`${r.label} ${i} stars`}>
                          <Star className={`h-5 w-5 ${i <= r.value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                        </button>
                      ))}
                    </span>
                  </div>
                ))}
                <div><Label>Comment (optional)</Label><Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} /></div>
              </div>
              <DialogFooter><Button onClick={submitReview}>Submit rating</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
        {isCustomer && b.status === "rated" && (
          <Button size="sm" variant="outline" onClick={adv("closed", "Job closed.")}>Close job</Button>
        )}
        {(isCustomer || isWorker) && ["requested", "matched", "accepted", "confirmed"].includes(b.status) && (
          <Button size="sm" variant="outline" className="text-red-600" onClick={adv("cancelled", "Booking cancelled.")}>
            <X className="h-4 w-4 mr-1" /> Cancel
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-hero-band/30">
      <SiteHeader />
      <main className="flex-1 mx-auto w-full max-w-5xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Workflow className="h-5 w-5" /></span>
            <div>
              <h1 className="font-serif text-3xl font-bold text-ink">Job workflow</h1>
              <p className="text-sm text-muted-foreground">
                Process every booking: accepted → work started → work finished → returned to customer → confirmed → rated.
              </p>
            </div>
          </div>
          <Button asChild variant="outline"><Link to="/services/orders">My orders</Link></Button>
        </div>

        {/* Status table — management visibility over the pipeline. */}
        <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCell label="Total bookings" value={stats.total} />
          <StatCell label="Awaiting action" value={stats.pending} tone="text-amber-600" />
          <StatCell label="Accepted" value={stats.accepted} tone="text-sky-700" />
          <StatCell label="Declined / cancelled" value={stats.declined} tone="text-red-600" />
          <StatCell label="In workflow" value={stats.inFlight} />
          <StatCell label="Processed" value={stats.processed} tone="text-primary" />
        </div>
        {stats.disputed > 0 && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-red-600">
            <ShieldAlert className="h-3.5 w-3.5" /> {stats.disputed} booking(s) under dispute review.
          </p>
        )}

        <h2 className="mt-8 font-serif text-xl font-semibold text-ink">Bookings in process</h2>
        {rows.length === 0 ? (
          <div className="mt-4 rounded-2xl bg-card p-12 ring-1 ring-black/5 text-center">
            <Wrench className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground mb-4">No bookings to process yet.</p>
            <Link to="/services" className="inline-flex rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">Browse skilled workers</Link>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {rows.map((b) => (
              <div key={b.id} className="rounded-2xl bg-card p-5 ring-1 ring-black/5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{b.workerProfile?.full_name ?? "Worker"} · {b.trade ?? (b.workerProfile?.trades ?? []).join(", ")}</p>
                    <p className="text-sm text-ink/80">{b.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.address}
                      {b.scheduled_for ? ` · ${new Date(b.scheduled_for).toLocaleString()}` : ""}
                      {` · created ${new Date(b.created_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <Badge variant="outline" className="whitespace-nowrap">
                    <CircleDot className="h-3 w-3 mr-1" /> {SERVICE_STATUS_LABEL[b.status] ?? b.status}
                  </Badge>
                </div>
                <Stepper status={b.status} />
                <Actions b={b} />
              </div>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
