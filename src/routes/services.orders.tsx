import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardList, Star, Wrench, CalendarCheck, CheckCircle2, Wallet, ShieldAlert, BadgeCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { advanceServiceBooking, rateServiceWorker, raiseServiceDispute } from "@/lib/services.functions";
import { SERVICE_STATUS_LABEL, SERVICE_ACTIVE, SERVICE_DISPUTABLE } from "@/lib/service-lifecycle";

export const Route = createFileRoute("/services/orders")({
  head: () => ({
    meta: [
      { title: "Service orders portal — SahanJobs" },
      { name: "description", content: "All your skilled-worker service orders: active bookings, contract history and ratings in one portal." },
      { property: "og:title", content: "Service orders portal — SahanJobs" },
      { property: "og:description", content: "Active bookings, contract history and worker ratings in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ServiceOrdersPortal,
});

const ACTIVE = SERVICE_ACTIVE;
const LABEL = SERVICE_STATUS_LABEL;

function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-card p-5 ring-1 ring-black/5">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">{icon}</span>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function ServiceOrdersPortal() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const advanceFn = useServerFn(advanceServiceBooking);
  const rateFn = useServerFn(rateServiceWorker);
  const disputeFn = useServerFn(raiseServiceDispute);
  const [review, setReview] = useState<{ id: string; worker_id: string; name: string } | null>(null);
  const [perf, setPerf] = useState(5);
  const [behave, setBehave] = useState(5);
  const [comment, setComment] = useState("");
  const [disputeId, setDisputeId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState("");

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  const { data } = useQuery({
    enabled: !!user,
    queryKey: ["service-orders", user?.id],
    staleTime: 15_000,
    queryFn: async () => {
      const { data: orders } = await supabase
        .from("service_bookings")
        .select("*")
        .eq("customer_id", user!.id)
        .order("created_at", { ascending: false });
      const rows = orders ?? [];
      const workerIds = Array.from(new Set(rows.map((b) => b.worker_id)));
      const { data: workers } = workerIds.length
        ? await supabase.from("skill_workers").select("id, full_name, phone, trades, photo_url, hourly_rate, daily_rate, currency").in("id", workerIds)
        : { data: [] };
      const byId = new Map((workers ?? []).map((w) => [w.id, w]));
      const { data: reviews } = await supabase
        .from("service_reviews")
        .select("booking_id, performance_rating, behaviour_rating")
        .eq("customer_id", user!.id);
      const byBooking = new Map((reviews ?? []).map((r) => [r.booking_id, r]));
      return rows.map((b) => ({
        ...b,
        worker: byId.get(b.worker_id) ?? null,
        review: byBooking.get(b.id) ?? null,
      }));
    },
  });

  const rows = data ?? [];
  const active = useMemo(() => rows.filter((r) => ACTIVE.has(r.status)), [rows]);
  const history = useMemo(() => rows.filter((r) => !ACTIVE.has(r.status)), [rows]);
  const completed = rows.filter((r) => r.status === "completed");
  const awaitingRating = completed.filter((r) => !r.review);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["service-orders"] });
    qc.invalidateQueries({ queryKey: ["my-bookings"] });
    qc.invalidateQueries({ queryKey: ["skill-workers"] });
  };

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed.");
    }
  };

  const submitReview = () => {
    if (!review) return;
    void run(
      () => rateFn({ data: { bookingId: review.id, performance: perf, behaviour: behave, comment: comment || undefined } }),
      "Thanks for rating this worker.",
    );
    setReview(null); setComment(""); setPerf(5); setBehave(5);
  };

  const cancel = (id: string) =>
    void run(() => advanceFn({ data: { bookingId: id, status: "cancelled" } }), "Order cancelled.");

  const confirmCompletion = (id: string) =>
    void run(() => advanceFn({ data: { bookingId: id, status: "customer_confirmed" } }), "Completion confirmed.");

  const closeJob = (id: string) =>
    void run(() => advanceFn({ data: { bookingId: id, status: "closed" } }), "Job closed.");

  const submitDispute = () => {
    if (!disputeId) return;
    if (disputeReason.trim().length < 10) return toast.error("Please describe the issue (at least 10 characters).");
    void run(
      () => disputeFn({ data: { bookingId: disputeId, reason: disputeReason.trim() } }),
      "Dispute opened. Our team will review it.",
    );
    setDisputeId(null); setDisputeReason("");
  };

  const RatingRow = ({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) => (
    <div className="flex items-center justify-between">
      <Label>{label}</Label>
      <span className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" onClick={() => onChange(i)} aria-label={`${label} ${i} stars`}>
            <Star className={`h-5 w-5 ${i <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
          </button>
        ))}
      </span>
    </div>
  );

  /** Structured table of every order — job details, worker, customer and satisfaction score. */
  const OrdersTable = ({ list }: { list: typeof rows }) => (
    list.length === 0 ? (
      <div className="rounded-2xl bg-card p-12 ring-1 ring-black/5 text-center text-muted-foreground">No orders yet.</div>
    ) : (
      <div className="overflow-x-auto rounded-2xl bg-card ring-1 ring-black/5">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-secondary/60 text-left">
            <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-semibold">Ordered</th>
              <th className="px-4 py-3 font-semibold">Job details</th>
              <th className="px-4 py-3 font-semibold">Worker</th>
              <th className="px-4 py-3 font-semibold">Customer</th>
              <th className="px-4 py-3 font-semibold">Schedule</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Satisfaction</th>
            </tr>
          </thead>
          <tbody>
            {list.map((b) => {
              const score = b.review
                ? (b.review.performance_rating + b.review.behaviour_rating) / 2
                : null;
              return (
                <tr key={b.id} className="border-t border-black/5 align-top">
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {new Date(b.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{b.trade ?? ((b.worker?.trades ?? []).join(", ") || "Service")}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2 max-w-[260px]">{b.description}</p>
                    <p className="text-xs text-muted-foreground">{b.address}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{b.worker?.full_name ?? "—"}</p>
                    {b.worker?.phone && <p className="text-xs text-muted-foreground">{b.worker.phone}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{b.customer_name}</p>
                    {b.customer_phone && <p className="text-xs text-muted-foreground">{b.customer_phone}</p>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {b.scheduled_for ? new Date(b.scheduled_for).toLocaleString() : "Flexible"}
                  </td>
                  <td className="px-4 py-3"><Badge variant="outline">{LABEL[b.status] ?? b.status}</Badge></td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {score === null ? (
                      <span className="text-xs text-muted-foreground">Not rated</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        {score.toFixed(1)}/5
                        <span className="text-xs font-normal text-muted-foreground">({Math.round((score / 5) * 100)}%)</span>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )
  );

  const OrderList = ({ list }: { list: typeof rows }) => (
    list.length === 0 ? (
      <div className="rounded-2xl bg-card p-12 ring-1 ring-black/5 text-center">
        <Wrench className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-muted-foreground mb-4">Nothing here yet.</p>
        <Link to="/services" className="inline-flex rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">Browse skilled workers</Link>
      </div>
    ) : (
      <div className="space-y-3">
        {list.map((b) => (
          <div key={b.id} className="rounded-2xl bg-card p-5 ring-1 ring-black/5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex gap-3">
                {b.worker?.photo_url
                  ? <img src={b.worker.photo_url} alt={b.worker.full_name} className="h-12 w-12 rounded-xl object-cover ring-1 ring-black/10" />
                  : <span className="grid h-12 w-12 place-items-center rounded-xl bg-secondary text-muted-foreground"><Wrench className="h-5 w-5" /></span>}
                <div>
                  <p className="font-semibold text-ink">{b.worker?.full_name ?? "Worker"}</p>
                  <p className="text-xs text-muted-foreground">{(b.worker?.trades ?? []).join(", ")}</p>
                  <p className="mt-2 text-sm text-ink">{b.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {b.address}
                    {b.scheduled_for ? ` · ${new Date(b.scheduled_for).toLocaleString()}` : ""}
                    {` · ordered ${new Date(b.created_at).toLocaleDateString()}`}
                  </p>
                </div>
              </div>
              <Badge variant="outline">{LABEL[b.status] ?? b.status}</Badge>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {b.worker?.phone && (
                <a href={`tel:${b.worker.phone}`} className="text-xs font-semibold text-primary">{b.worker.phone}</a>
              )}
              {(b.status === "requested" || b.status === "matched") && (
                <Button size="sm" variant="outline" onClick={() => cancel(b.id)}>Cancel order</Button>
              )}
              {b.status === "completed" && (
                <Button size="sm" variant="outline" onClick={() => confirmCompletion(b.id)}>
                  <BadgeCheck className="h-4 w-4 mr-1" /> Confirm completion
                </Button>
              )}
              {(b.status === "completed" || b.status === "customer_confirmed") && !b.review && (
                <Dialog open={review?.id === b.id} onOpenChange={(o) => setReview(o ? { id: b.id, worker_id: b.worker_id, name: b.worker?.full_name ?? "worker" } : null)}>
                  <DialogTrigger asChild><Button size="sm"><Star className="h-4 w-4 mr-1" /> Rate worker</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Rate {review?.name ?? "worker"}</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                      <RatingRow label="Job performance" value={perf} onChange={setPerf} />
                      <RatingRow label="Behaviour & professionalism" value={behave} onChange={setBehave} />
                      <div><Label>Comment (optional)</Label><Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} /></div>
                    </div>
                    <DialogFooter><Button onClick={submitReview}>Submit rating</Button></DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
              {(b.status === "rated" || (b.status === "customer_confirmed" && !!b.review)) && (
                <Button size="sm" variant="outline" onClick={() => closeJob(b.id)}>Close job</Button>
              )}
              {b.review && (
                <span className="text-xs text-muted-foreground">
                  Rated {((b.review.performance_rating + b.review.behaviour_rating) / 2).toFixed(1)}★
                </span>
              )}
              {SERVICE_DISPUTABLE.has(b.status) && (
                <Dialog open={disputeId === b.id} onOpenChange={(o) => { setDisputeId(o ? b.id : null); setDisputeReason(""); }}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="text-red-600"><ShieldAlert className="h-4 w-4 mr-1" /> Dispute</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Open a dispute</DialogTitle></DialogHeader>
                    <div>
                      <Label>What went wrong?</Label>
                      <Textarea rows={4} value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)}
                        placeholder="Describe the issue — our admin team will review it." />
                    </div>
                    <DialogFooter><Button onClick={submitDispute}>Submit dispute</Button></DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
        ))}
      </div>
    )
  );

  return (
    <div className="min-h-screen flex flex-col bg-hero-band/30">
      <SiteHeader />
      <main className="flex-1 mx-auto w-full max-w-5xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><ClipboardList className="h-5 w-5" /></span>
            <div>
              <h1 className="font-serif text-3xl font-bold text-ink">Service orders</h1>
              <p className="text-sm text-muted-foreground">Every skilled-worker order you made — active bookings, contract history and ratings.</p>
            </div>
          </div>
          <Button asChild><Link to="/services"><Wrench className="h-4 w-4 mr-1" /> Book a worker</Link></Button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi icon={<CalendarCheck className="h-4 w-4" />} label="Active bookings" value={String(active.length)} sub="In progress or scheduled" />
          <Kpi icon={<CheckCircle2 className="h-4 w-4" />} label="Completed" value={String(completed.length)} sub="Finished contracts" />
          <Kpi icon={<Star className="h-4 w-4" />} label="Awaiting rating" value={String(awaitingRating.length)} sub="Rate to help others" />
          <Kpi icon={<Wallet className="h-4 w-4" />} label="Total orders" value={String(rows.length)} sub="All time" />
        </div>

        <Tabs defaultValue="active" className="mt-8">
          <TabsList>
            <TabsTrigger value="active">Active bookings ({active.length})</TabsTrigger>
            <TabsTrigger value="history">Contract history ({history.length})</TabsTrigger>
            <TabsTrigger value="ratings">Ratings ({awaitingRating.length})</TabsTrigger>
            <TabsTrigger value="table">All orders ({rows.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="active" className="mt-4"><OrderList list={active} /></TabsContent>
          <TabsContent value="history" className="mt-4"><OrderList list={history} /></TabsContent>
          <TabsContent value="ratings" className="mt-4"><OrderList list={awaitingRating} /></TabsContent>
          <TabsContent value="table" className="mt-4"><OrdersTable list={rows} /></TabsContent>
        </Tabs>
      </main>
      <SiteFooter />
    </div>
  );
}
