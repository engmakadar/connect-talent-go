import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CalendarCheck, Star, Wrench } from "lucide-react";
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

export const Route = createFileRoute("/services/bookings")({
  head: () => ({
    meta: [
      { title: "My service bookings — SahanJobs" },
      { name: "description", content: "Track your hand-skill service bookings, update job status and rate completed work." },
      { property: "og:title", content: "My service bookings — SahanJobs" },
      { property: "og:description", content: "Track your hand-skill service bookings and rate completed work." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BookingsPage,
});

const STATUSES = ["requested", "accepted", "in_progress", "completed", "cancelled"] as const;
const LABEL: Record<string, string> = {
  requested: "Requested", accepted: "Accepted", in_progress: "In progress",
  completed: "Completed", cancelled: "Cancelled",
};

function BookingsPage() {
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

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("service_bookings").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Marked ${LABEL[status]}.`);
    qc.invalidateQueries({ queryKey: ["my-bookings"] });
  };

  const submitReview = async () => {
    if (!user || !review) return;
    const { error } = await supabase.from("service_reviews").insert({
      booking_id: review.id, worker_id: review.worker_id, customer_id: user.id,
      performance_rating: perf, behaviour_rating: behave, comment: comment.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Thanks for your rating.");
    setReview(null); setComment(""); setPerf(5); setBehave(5);
    qc.invalidateQueries({ queryKey: ["my-bookings"] });
    qc.invalidateQueries({ queryKey: ["skill-workers"] });
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

  return (
    <div className="min-h-screen flex flex-col bg-hero-band/40">
      <SiteHeader />
      <main className="flex-1 mx-auto w-full max-w-4xl px-6 py-10">
        <div className="flex items-center gap-3 mb-6">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><CalendarCheck className="h-5 w-5" /></span>
          <div>
            <h1 className="font-serif text-3xl font-bold text-ink">Service bookings</h1>
            <p className="text-sm text-muted-foreground">Track requests you've made and jobs you've been booked for.</p>
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
                  <Badge variant="outline">{LABEL[b.status] ?? b.status}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {b.status !== "cancelled" && b.status !== "completed" && (
                    <Button size="sm" variant="outline" onClick={() => setStatus(b.id, "cancelled")}>Cancel</Button>
                  )}
                  {b.status === "completed" && !b.reviewed && (
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
                  {b.reviewed && <span className="text-xs text-muted-foreground self-center">Rated ✓</span>}
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
                    <Badge variant="outline">{LABEL[b.status] ?? b.status}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {STATUSES.filter((s) => s !== b.status && s !== "requested").map((s) => (
                      <Button key={s} size="sm" variant="outline" onClick={() => setStatus(b.id, s)}>{LABEL[s]}</Button>
                    ))}
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
