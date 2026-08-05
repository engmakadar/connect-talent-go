import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Package, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/freelance/orders")({
  head: () => ({
    meta: [
      { title: "Freelance orders — SahanJobs" },
      { name: "description", content: "Track the freelance services you have ordered and the work you are delivering." },
      { property: "og:title", content: "Freelance orders — SahanJobs" },
      { property: "og:description", content: "Track the freelance services you have ordered and the work you are delivering." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrdersPage,
});

const NEXT: Record<string, { to: string; label: string }> = {
  pending: { to: "in_progress", label: "Start work" },
  in_progress: { to: "delivered", label: "Mark delivered" },
};

function OrdersPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [reviewFor, setReviewFor] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  const { data } = useQuery({
    enabled: !!user,
    queryKey: ["freelance-my-orders", user?.id],
    queryFn: async () => {
      const { data: orders } = await supabase
        .from("freelance_orders")
        .select("id, gig_id, client_id, freelancer_id, price, currency, requirements, status, created_at")
        .or(`client_id.eq.${user!.id},freelancer_id.eq.${user!.id}`)
        .order("created_at", { ascending: false });
      const rows = orders ?? [];
      const gigIds = Array.from(new Set(rows.map((r) => r.gig_id)));
      const { data: gigs } = gigIds.length
        ? await supabase.from("freelance_gigs").select("id, title").in("id", gigIds)
        : { data: [] };
      const { data: reviews } = await supabase.from("freelance_reviews").select("order_id").eq("client_id", user!.id);
      const reviewed = new Set((reviews ?? []).map((r) => r.order_id));
      const titles = new Map((gigs ?? []).map((g) => [g.id, g.title]));
      return rows.map((r) => ({ ...r, gigTitle: titles.get(r.gig_id) ?? "Service", reviewed: reviewed.has(r.id) }));
    },
  });

  const advance = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("freelance_orders").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Order updated.");
      qc.invalidateQueries({ queryKey: ["freelance-my-orders"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed."),
  });

  const submitReview = useMutation({
    mutationFn: async (order: { id: string; gig_id: string }) => {
      const { error } = await supabase.from("freelance_reviews").insert({
        order_id: order.id, gig_id: order.gig_id, client_id: user!.id, rating, comment: comment || null,
      });
      if (error) throw error;
      await supabase.from("freelance_orders").update({ status: "completed" }).eq("id", order.id);
    },
    onSuccess: () => {
      toast.success("Thanks for your review.");
      setReviewFor(null); setComment(""); setRating(5);
      qc.invalidateQueries({ queryKey: ["freelance-my-orders"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save the review."),
  });

  const buying = (data ?? []).filter((o) => o.client_id === user?.id);
  const selling = (data ?? []).filter((o) => o.freelancer_id === user?.id);

  const List = ({ rows, side }: { rows: typeof buying; side: "buying" | "selling" }) => {
    if (rows.length === 0) {
      return (
        <div className="rounded-2xl bg-card p-12 ring-1 ring-black/5 text-center">
          <Package className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground mb-4">No orders here yet.</p>
          <Button asChild><Link to="/freelance">Browse the marketplace</Link></Button>
        </div>
      );
    }
    return (
      <ul className="space-y-3">
        {rows.map((o) => (
          <li key={o.id} className="rounded-2xl bg-card p-5 ring-1 ring-black/5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Link to="/freelance/$gigId" params={{ gigId: o.gig_id }} className="font-semibold text-ink hover:text-primary">
                  {o.gigTitle}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {new Date(o.created_at).toLocaleDateString()} · {o.currency} {Number(o.price).toLocaleString()}
                </p>
                {o.requirements && <p className="mt-2 text-sm text-ink-soft whitespace-pre-wrap">{o.requirements}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">{o.status.replace("_", " ")}</Badge>
                {side === "selling" && NEXT[o.status] && (
                  <Button size="sm" onClick={() => advance.mutate({ id: o.id, status: NEXT[o.status].to })}>
                    {NEXT[o.status].label}
                  </Button>
                )}
                {side === "buying" && o.status === "delivered" && !o.reviewed && (
                  <Button size="sm" onClick={() => setReviewFor(reviewFor === o.id ? null : o.id)}>
                    <Star className="h-3.5 w-3.5 mr-1" /> Rate &amp; complete
                  </Button>
                )}
                {side === "buying" && o.status === "pending" && (
                  <Button size="sm" variant="outline" className="text-destructive" onClick={() => advance.mutate({ id: o.id, status: "cancelled" })}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>

            {reviewFor === o.id && (
              <div className="mt-4 rounded-xl bg-secondary/40 p-4">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" aria-label={`${n} stars`} onClick={() => setRating(n)}>
                      <Star className={`h-5 w-5 ${n <= rating ? "fill-current text-amber-500" : "text-muted-foreground/40"}`} />
                    </button>
                  ))}
                </div>
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="How was the delivery?" className="mt-3" />
                <Button className="mt-3" size="sm" disabled={submitReview.isPending} onClick={() => submitReview.mutate(o)}>
                  Submit review
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-hero-band/30">
      <SiteHeader />
      <main className="flex-1 mx-auto w-full max-w-4xl px-6 py-10">
        <h1 className="font-serif text-3xl font-bold text-ink mb-6">Freelance orders</h1>
        <Tabs defaultValue="buying">
          <TabsList>
            <TabsTrigger value="buying">Orders I placed ({buying.length})</TabsTrigger>
            <TabsTrigger value="selling">Work I deliver ({selling.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="buying" className="mt-4"><List rows={buying} side="buying" /></TabsContent>
          <TabsContent value="selling" className="mt-4"><List rows={selling} side="selling" /></TabsContent>
        </Tabs>
      </main>
      <SiteFooter />
    </div>
  );
}
