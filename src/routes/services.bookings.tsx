import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CalendarCheck, Star, Wrench, ShieldAlert, Check, X, Play, Flag, BadgeCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { acceptServiceBooking, advanceServiceBooking, rateServiceWorker, raiseServiceDispute } from "@/lib/services.functions";
import { SERVICE_STATUS_LABEL, SERVICE_DISPUTABLE } from "@/lib/service-lifecycle";

export const Route = createFileRoute("/services/bookings")({
  head: () => ({
    meta: [
      { title: "My service bookings — SahanJobs" },
      { name: "description", content: "Track your hand-skill service bookings through the full job lifecycle and rate completed work." },
      { property: "og:title", content: "My service bookings — SahanJobs" },
      { property: "og:description", content: "Track your hand-skill service bookings and rate completed work." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BookingsPage,
});

const STATUS_STYLE: Record<string, string> = {
  requested: "bg-amber-100 text-amber-800 border-0",
  matched: "bg-amber-100 text-amber-800 border-0",
  accepted: "bg-sky-100 text-sky-800 border-0",
  confirmed: "bg-sky-100 text-sky-800 border-0",
  in_progress: "bg-indigo-100 text-indigo-800 border-0",
  completed: "bg-primary/10 text-primary border-0",
  customer_confirmed: "bg-primary/10 text-primary border-0",
  rated: "bg-primary/10 text-primary border-0",
  closed: "bg-muted text-muted-foreground border-0",
  cancelled: "bg-muted text-muted-foreground border-0",
  disputed: "bg-red-100 text-red-800 border-0",
};

function BookingsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const acceptFn = useServerFn(acceptServiceBooking);
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
    queryKey: ["my-bookings", user?.id],
    staleTime: 15_000,
    queryFn: async () => {
      const { data: worker } = await supabase.from("skill_workers").select("id").eq("user_id", user!.id).maybeSingle();
      const [{ data: asCustomer }, { data: asWorker }] = await Promise.all([
        supabase.from("service_bookings").select("*").eq("customer_id", user!.id).order("created_at", { ascending: false }),
        worker
          ? supabase.from("service_bookings").select("*").eq("worker_id", worker.id).order("created_at", { ascending: false })
          : Promise.resolve({ data: [] as never[] }),
      ]);
      const workerIds = Array.from(new Set((asCustomer ?? []).map((b) => b.worker_id)));
      const { data: workers } = workerIds.length
        ? await supabase.from("skill_workers").select("id, full_name, phone, trades").in("id", workerIds)
        : { data: [] };
      const byId = new Map((workers ?? []).map((w) => [w.id, w]));
      const { data: reviews } = await supabase.from("service_reviews").select("booking_id").eq("customer_id", user!.id);
      const reviewed = new Set((reviews ?? []).map((r) => r.booking_id));
      return {
        isWorker: !!worker,
        asCustomer: (asCustomer ?? []).map((b) => ({ ...b, worker: byId.get(b.worker_id) ?? null, reviewed: reviewed.has(b.id) })),
        asWorker: asWorker ?? [],
      };
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["my-bookings"] });
    qc.invalidateQueries({ queryKey: ["service-orders"] });
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
      "Thanks for your rating.",
    );
    setReview(null); setComment(""); setPerf(5); setBehave(5);
  };

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
          <button key={i} type="button" onClick={() => onChange(i)}>
            <Star className={`h-5 w-5 ${i <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
          </button>
        ))}
      </span>
    </div>
  );

  const DisputeButton = ({ bookingId }: { bookingId: string }) => (
    <Dialog open={disputeId === bookingId} onOpenChange={(o) => { setDisputeId(o ? bookingId : null); setDisputeReason(""); }}>
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
  );

  return (
    <div className="min-h-screen flex flex-col bg-hero-band/40">
      <SiteHeader />
      <main className="flex-1 mx-auto w-full max-w-4xl px-6 py-10">
        <div className="flex items-center gap-3 mb-6">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><CalendarCheck className="h-5 w-5" /></span>
          <div>
            <h1 className="font-serif text-3xl font-bold text-ink">Service bookings</h1>
            <p className="text-sm text-muted-foreground">Full job lifecycle: request → accept → confirm → in progress → completed → confirmed → rated → closed.</p>
          </div>
        </div>

        <Tabs defaultValue="customer">
          <TabsList>
            <TabsTrigger value="customer">My requests ({data?.asCustomer.length ?? 0})</TabsTrigger>
            {data?.isWorker && <TabsTrigger value="worker">Jobs for me ({data?.asWorker.length ?? 0})</TabsTrigger>}
          </TabsList>

          <TabsContent value="customer" className="space-y-3 mt-4">
            {(data?.asCustomer.length ?? 0) === 0 ? (
              <div className="rounded-2xl bg-card p-12 ring-1 ring-black/5 text-center">
                <Wrench className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground mb-4">You haven't booked any services yet.</p>
                <Link to="/services" className="inline-flex rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">Browse skilled workers</Link>
              </div>
            ) : data?.asCustomer.map((b) => (
              <div key={b.id} className="rounded-2xl bg-card p-5 ring-1 ring-black/5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{b.worker?.full_name ?? "Worker"}</p>
                    <p className="text-xs text-muted-foreground">{b.worker?.trades?.join(", ")}</p>
                    <p className="mt-2 text-sm text-ink">{b.description}</p>
                    <p className="text-xs text-muted-foreground">{b.address}{b.scheduled_for ? ` · ${new Date(b.scheduled_for).toLocaleString()}` : ""}</p>
                  </div>
                  <Badge variant="outline" className={STATUS_STYLE[b.status] ?? ""}>{SERVICE_STATUS_LABEL[b.status] ?? b.status}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(b.status === "requested" || b.status === "matched") && (
                    <Button size="sm" variant="outline"
                      onClick={() => void run(() => advanceFn({ data: { bookingId: b.id, status: "cancelled" } }), "Booking cancelled.")}>
                      Cancel
                    </Button>
                  )}
                  {b.status === "completed" && (
                    <Button size="sm" variant="outline"
                      onClick={() => void run(() => advanceFn({ data: { bookingId: b.id, status: "customer_confirmed" } }), "Completion confirmed.")}>
                      <BadgeCheck className="h-4 w-4 mr-1" /> Confirm completion
                    </Button>
                  )}
                  {(b.status === "completed" || b.status === "customer_confirmed") && !b.reviewed && (
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
                  {(b.status === "rated" || b.status === "customer_confirmed") && (
                    <Button size="sm" variant="outline"
                      onClick={() => void run(() => advanceFn({ data: { bookingId: b.id, status: "closed" } }), "Job closed.")}>
                      Close job
                    </Button>
                  )}
                  {b.reviewed && b.status !== "closed" && <span className="text-xs text-muted-foreground self-center">Rated ✓</span>}
                  {SERVICE_DISPUTABLE.has(b.status) && <DisputeButton bookingId={b.id} />}
                </div>
              </div>
            ))}
          </TabsContent>

          {data?.isWorker && (
            <TabsContent value="worker" className="space-y-3 mt-4">
              {data.asWorker.length === 0 ? (
                <div className="rounded-2xl bg-card p-12 ring-1 ring-black/5 text-center text-muted-foreground">No booking requests yet.</div>
              ) : data.asWorker.map((b) => (
                <div key={b.id} className="rounded-2xl bg-card p-5 ring-1 ring-black/5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-ink">{b.customer_name}</p>
                      {b.customer_phone && <a href={`tel:${b.customer_phone}`} className="text-xs text-primary">{b.customer_phone}</a>}
                      <p className="mt-2 text-sm text-ink">{b.description}</p>
                      <p className="text-xs text-muted-foreground">{b.address}{b.scheduled_for ? ` · ${new Date(b.scheduled_for).toLocaleString()}` : ""}</p>
                    </div>
                    <Badge variant="outline" className={STATUS_STYLE[b.status] ?? ""}>{SERVICE_STATUS_LABEL[b.status] ?? b.status}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(b.status === "requested" || b.status === "matched") && (
                      <>
                        <Button size="sm" onClick={() => void run(() => acceptFn({ data: { bookingId: b.id } }), "Job accepted.")}>
                          <Check className="h-4 w-4 mr-1" /> Accept job
                        </Button>
                        <Button size="sm" variant="outline"
                          onClick={() => void run(() => advanceFn({ data: { bookingId: b.id, status: "cancelled" } }), "Job declined.")}>
                          <X className="h-4 w-4 mr-1" /> Decline
                        </Button>
                      </>
                    )}
                    {b.status === "accepted" && (
                      <Button size="sm" onClick={() => void run(() => advanceFn({ data: { bookingId: b.id, status: "confirmed" } }), "Job confirmed.")}>
                        <BadgeCheck className="h-4 w-4 mr-1" /> Confirm job
                      </Button>
                    )}
                    {b.status === "confirmed" && (
                      <Button size="sm" onClick={() => void run(() => advanceFn({ data: { bookingId: b.id, status: "in_progress" } }), "Job started.")}>
                        <Play className="h-4 w-4 mr-1" /> Start job
                      </Button>
                    )}
                    {b.status === "in_progress" && (
                      <Button size="sm" onClick={() => void run(() => advanceFn({ data: { bookingId: b.id, status: "completed" } }), "Marked completed.")}>
                        <Flag className="h-4 w-4 mr-1" /> Mark completed
                      </Button>
                    )}
                    {SERVICE_DISPUTABLE.has(b.status) && <DisputeButton bookingId={b.id} />}
                  </div>
                </div>
              ))}
            </TabsContent>
          )}
        </Tabs>
      </main>
      <SiteFooter />
    </div>
  );
}
