import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, Star, Clock, Plus, Package, Briefcase } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/freelance/")({
  head: () => ({
    meta: [
      { title: "Freelance Marketplace — SahanJobs" },
      { name: "description", content: "Hire vetted freelancers or sell your own services on the SahanJobs freelance marketplace." },
      { property: "og:title", content: "Freelance Marketplace — SahanJobs" },
      { property: "og:description", content: "Hire vetted freelancers or sell your own services on the SahanJobs freelance marketplace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FreelanceIndex,
});

export const GIG_CATEGORIES = [
  "General", "Design & Creative", "Writing & Translation", "Development & IT",
  "Digital Marketing", "Video & Animation", "Business & Consulting", "Data & Analytics",
];

function FreelanceIndex() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [sort, setSort] = useState("rating");

  const { data: gigs, isLoading } = useQuery({
    queryKey: ["freelance-gigs"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("freelance_gigs")
        .select("id, title, description, category, price, currency, delivery_days, tags, cover_url, rating_avg, rating_count, orders_count")
        .eq("active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    let rows = (gigs ?? []).filter((g) => {
      if (cat !== "all" && g.category !== cat) return false;
      if (!term) return true;
      return `${g.title} ${g.description} ${(g.tags ?? []).join(" ")}`.toLowerCase().includes(term);
    });
    rows = [...rows].sort((a, b) =>
      sort === "price" ? Number(a.price) - Number(b.price)
        : sort === "delivery" ? a.delivery_days - b.delivery_days
          : Number(b.rating_avg) - Number(a.rating_avg));
    return rows;
  }, [gigs, q, cat, sort]);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <SiteHeader />
      <main className="flex-1">
        <section className="bg-hero-band/40 border-b border-black/5 py-10">
          <div className="mx-auto max-w-7xl px-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="font-serif text-3xl md:text-4xl font-bold tracking-tight text-ink">Freelance Marketplace</h1>
                <p className="mt-2 text-sm text-ink-soft max-w-2xl">
                  Buy ready-made services from local freelancers, or publish your own listing and start earning.
                </p>
              </div>
              <div className="flex gap-2">
                <Button asChild variant="outline"><Link to="/freelance/orders"><Package className="h-4 w-4 mr-2" /> My orders</Link></Button>
                <Button asChild><Link to="/freelance/new"><Plus className="h-4 w-4 mr-2" /> Sell a service</Link></Button>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search services…" className="pl-9 bg-white" />
              </div>
              <Select value={cat} onValueChange={setCat}>
                <SelectTrigger className="w-[220px] bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {GIG_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className="w-[180px] bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rating">Top rated</SelectItem>
                  <SelectItem value="price">Lowest price</SelectItem>
                  <SelectItem value="delivery">Fastest delivery</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-10">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading services…</p>
          ) : list.length === 0 ? (
            <div className="rounded-2xl bg-card p-12 ring-1 ring-black/5 text-center">
              <Briefcase className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground mb-4">No services published yet.</p>
              <Button asChild><Link to="/freelance/new">Be the first to sell a service</Link></Button>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((g) => (
                <Link
                  key={g.id}
                  to="/freelance/$gigId"
                  params={{ gigId: g.id }}
                  className="rounded-2xl bg-card ring-1 ring-black/5 overflow-hidden hover:ring-primary/40 transition"
                >
                  <div className="h-36 bg-secondary/60 grid place-items-center overflow-hidden">
                    {g.cover_url
                      ? <img src={g.cover_url} alt={g.title} loading="lazy" className="h-full w-full object-cover" />
                      : <Briefcase className="h-8 w-8 text-muted-foreground/40" />}
                  </div>
                  <div className="p-5">
                    <span className="text-[11px] uppercase tracking-wider font-semibold text-primary">{g.category}</span>
                    <h2 className="mt-1 font-semibold text-ink line-clamp-2">{g.title}</h2>
                    <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{g.description}</p>
                    <div className="mt-4 flex items-center justify-between text-sm">
                      <span className="inline-flex items-center gap-1 text-amber-600 font-semibold">
                        <Star className="h-3.5 w-3.5 fill-current" /> {Number(g.rating_avg).toFixed(1)}
                        <span className="text-muted-foreground font-normal">({g.rating_count})</span>
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" /> {g.delivery_days}d
                      </span>
                    </div>
                    <p className="mt-3 text-lg font-bold text-ink">{g.currency} {Number(g.price).toLocaleString()}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
