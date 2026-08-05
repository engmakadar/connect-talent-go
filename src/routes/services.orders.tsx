import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Star, Wrench, CalendarCheck, CheckCircle2, Wallet } from "lucide-react";
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
  component: ServiceOrdersPortal;
});

const ACTIVE = new Set(["requested", "accepted", "in_progress"]);
const LABEL: Record<string, string> = {
  requested: "Requested", accepted: "Accepted", in_progress: "In progress",
  completed: "Completed", cancelled: "Cancelled",
};

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
  const [review, setReview] = useState<{ id: string; worker_id: string } | null>(null);
  const [perf, setPerf] = useState(5);
  const [behave, setBehave] = useState(5);
  const [comment, setComment] = useState("");

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

  const submitReview = async () => {
    if (!user || !review) return;
    const { error } = await supabase.from("service_reviews").insert({
      booking_id: review.id, worker_id: review.worker_id, customer_id: user.id,
      performance_rating: perf, behaviour_rating: behave, comment: comment.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Thanks for rating this worker.");
    setReview(null); setComment(""); setPerf(5); setBehave(5);
    qc.invalidateQueries({ queryKey: ["service-orders"] });
    qc.invalidateQueries({ queryKey: ["my-bookings"] });
    qc.invalidateQueries({ queryKey: ["skill-workers"] });
  };

  const cancel = async (id: string) => {
    const { error } = await supabase.from("service_bookings").update({ status: "cancelled" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Order cancelled.");
    qc.invalidateQueries({ queryKey: ["service-orders"] });
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
              {ACTIVE.has(b.status) && (
                <Button size="sm" variant="outline" onClick={() => void cancel(b.id)}>Cancel order</Button>
              )}
              {b.status === "completed" && !b.review && (
                <Dialog open={review?.id === b.id} onOpenChange={(o) => setReview(o ? { id: b.id, worker_id: b.worker_id } : null)}>
                  <DialogTrigger asChild><Button size="sm"><Star className="h-4 w-4 mr-1" /> Rate worker</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Rate {b.worker?.full_name ?? "worker"}</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                      <RatingRow label="Job performance" value={perf} onChange={setPerf} />
                      <RatingRow label="Behaviour & professionalism" value={behave} onChange={setBehave} />
                      <div><Label>Comment (optional)</Label><Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} /></div>
                    </div>
                    <DialogFooter><Button onClick={submitReview}>Submit rating</Button></DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
              {b.review && (
                <span className="text-xs text-muted-foreground">
                  Rated {((b.review.performance_rating + b.review.behaviour_rating) / 2).toFixed(1)}★
                </span>
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
          </TabsList>
          <TabsContent value="active" className="mt-4"><OrderList list={active} /></TabsContent>
          <TabsContent value="history" className="mt-4"><OrderList list={history} /></TabsContent>
          <TabsContent value="ratings" className="mt-4"><OrderList list={awaitingRating} /></TabsContent>
        </Tabs>
      </main>
      <SiteFooter />
    </div>
  );
}
