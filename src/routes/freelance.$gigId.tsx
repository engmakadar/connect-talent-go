import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Star, Clock, Briefcase, ArrowLeft, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/freelance/$gigId")({
  head: () => ({
    meta: [
      { title: "Freelance service — SahanJobs" },
      { name: "description", content: "Review the service package, delivery time, ratings and place a secure order." },
      { property: "og:title", content: "Freelance service — SahanJobs" },
      { property: "og:description", content: "Review the service package, delivery time, ratings and place a secure order." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GigPage,
});

function GigPage() {
  const { gigId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [requirements, setRequirements] = useState("");

  const { data: gig, isLoading } = useQuery({
    queryKey: ["freelance-gig", gigId],
    queryFn: async () => {
      const { data, error } = await supabase.from("freelance_gigs").select("*").eq("id", gigId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: seller } = useQuery({
    enabled: !!gig?.freelancer_id,
    queryKey: ["freelance-seller", gig?.freelancer_id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("full_name, headline, avatar_url, location").eq("id", gig!.freelancer_id).maybeSingle();
      return data;
    },
  });

  const { data: reviews } = useQuery({
    queryKey: ["freelance-reviews", gigId],
    queryFn: async () => {
      const { data } = await supabase
        .from("freelance_reviews")
        .select("id, rating, comment, created_at")
        .eq("gig_id", gigId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const order = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in required");
      if (!gig) throw new Error("Service unavailable");
      const { error } = await supabase.from("freelance_orders").insert({
        gig_id: gig.id,
        client_id: user.id,
        freelancer_id: gig.freelancer_id,
        price: gig.price,
        currency: gig.currency,
        requirements,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Order placed — the freelancer has been notified.");
      qc.invalidateQueries({ queryKey: ["freelance-my-orders"] });
      navigate({ to: "/freelance/orders" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not place the order."),
  });

  useEffect(() => { setRequirements(""); }, [gigId]);

  return (
    <div className="min-h-screen flex flex-col bg-hero-band/30">
      <SiteHeader />
      <main className="flex-1 mx-auto w-full max-w-5xl px-6 py-10">
        <Link to="/freelance" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to marketplace
        </Link>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading service…</p>
        ) : !gig ? (
          <p className="text-sm text-muted-foreground">This service is no longer available.</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <div className="rounded-2xl bg-card ring-1 ring-black/5 overflow-hidden">
                <div className="h-52 bg-secondary/60 grid place-items-center overflow-hidden">
                  {gig.cover_url
                    ? <img src={gig.cover_url} alt={gig.title} className="h-full w-full object-cover" />
                    : <Briefcase className="h-10 w-10 text-muted-foreground/40" />}
                </div>
                <div className="p-6">
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-primary">{gig.category}</span>
                  <h1 className="mt-1 font-serif text-2xl md:text-3xl font-bold text-ink">{gig.title}</h1>
                  <div className="mt-3 flex items-center gap-4 text-sm">
                    <span className="inline-flex items-center gap-1 text-amber-600 font-semibold">
                      <Star className="h-4 w-4 fill-current" /> {Number(gig.rating_avg).toFixed(1)}
                      <span className="text-muted-foreground font-normal">({gig.rating_count} reviews)</span>
                    </span>
                    <span className="text-muted-foreground">{gig.orders_count} orders completed</span>
                  </div>
                  <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">{gig.description}</p>
                  {gig.tags?.length > 0 && (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {gig.tags.map((t) => <span key={t} className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-ink">{t}</span>)}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-card p-6 ring-1 ring-black/5">
                <h2 className="font-serif text-lg font-semibold text-ink mb-4">Ratings &amp; reviews</h2>
                {(reviews ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No reviews yet — be the first to order.</p>
                ) : (
                  <ul className="space-y-4">
                    {reviews!.map((r) => (
                      <li key={r.id} className="border-b border-black/5 pb-4 last:border-0 last:pb-0">
                        <div className="flex items-center gap-1 text-amber-500">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} className={`h-3.5 w-3.5 ${i < r.rating ? "fill-current" : "opacity-25"}`} />
                          ))}
                          <span className="ml-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
                        </div>
                        {r.comment && <p className="mt-1.5 text-sm text-ink-soft">{r.comment}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-2xl bg-card p-6 ring-1 ring-black/5">
                <p className="text-3xl font-bold text-ink">{gig.currency} {Number(gig.price).toLocaleString()}</p>
                <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" /> Delivery in {gig.delivery_days} days
                </p>
                <Textarea
                  value={requirements}
                  onChange={(e) => setRequirements(e.target.value)}
                  placeholder="Describe what you need from this freelancer…"
                  className="mt-4 min-h-[110px]"
                />
                {user ? (
                  <Button className="mt-4 w-full" disabled={order.isPending || user.id === gig.freelancer_id} onClick={() => order.mutate()}>
                    {user.id === gig.freelancer_id ? "This is your listing" : order.isPending ? "Placing order…" : "Order now"}
                  </Button>
                ) : (
                  <Button className="mt-4 w-full" onClick={() => navigate({ to: "/auth" })}>Sign in to order</Button>
                )}
                <p className="mt-3 inline-flex items-start gap-2 text-[11px] text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  Orders are tracked on SahanJobs; payment is released once you mark the work delivered.
                </p>
              </div>

              <div className="rounded-2xl bg-card p-6 ring-1 ring-black/5">
                <h2 className="text-sm font-semibold text-ink mb-2">About the freelancer</h2>
                <p className="font-semibold text-ink">{seller?.full_name ?? "SahanJobs freelancer"}</p>
                {seller?.headline && <p className="text-xs text-muted-foreground">{seller.headline}</p>}
                {seller?.location && <p className="text-xs text-muted-foreground mt-1">{seller.location}</p>}
              </div>
            </aside>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
