import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Search, Star, Clock, Plus, Package, Briefcase, ArrowLeft, CheckCircle2,
  PenTool, Languages, Code2, Megaphone, Clapperboard, LineChart, BarChart3, Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/freelance/")({
  head: () => ({
    meta: [
      { title: "Freelance Marketplace — SahanJobs" },
      { name: "description", content: "Browse freelance categories, compare freelancer profiles, ratings and rates, then hire in a few clicks." },
      { property: "og:title", content: "Freelance Marketplace — SahanJobs" },
      { property: "og:description", content: "Browse freelance categories, compare freelancer profiles, ratings and rates, then hire in a few clicks." },
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

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  "General": <Sparkles className="h-6 w-6" />,
  "Design & Creative": <PenTool className="h-6 w-6" />,
  "Writing & Translation": <Languages className="h-6 w-6" />,
  "Development & IT": <Code2 className="h-6 w-6" />,
  "Digital Marketing": <Megaphone className="h-6 w-6" />,
  "Video & Animation": <Clapperboard className="h-6 w-6" />,
  "Business & Consulting": <LineChart className="h-6 w-6" />,
  "Data & Analytics": <BarChart3 className="h-6 w-6" />,
};

type Gig = {
  id: string; freelancer_id: string; title: string; description: string; category: string;
  price: number; currency: string; delivery_days: number; tags: string[] | null;
  cover_url: string | null; rating_avg: number; rating_count: number; orders_count: number;
};

type Seller = { id: string; full_name: string | null; avatar_url: string | null; headline: string | null; location: string | null };

function FreelanceIndex() {
  const [cat, setCat] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("rating");

  const { data, isLoading } = useQuery({
    queryKey: ["freelance-gigs"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: gigs, error } = await supabase
        .from("freelance_gigs")
        .select("id, freelancer_id, title, description, category, price, currency, delivery_days, tags, cover_url, rating_avg, rating_count, orders_count")
        .eq("active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const rows = (gigs ?? []) as Gig[];
      const ids = Array.from(new Set(rows.map((g) => g.freelancer_id)));
      let sellers: Seller[] = [];
      if (ids.length) {
        const { data: people } = await (supabase as unknown as {
          from: (t: string) => { select: (c: string) => { in: (col: string, v: string[]) => Promise<{ data: Seller[] | null }> } };
        }).from("freelancer_public").select("id, full_name, avatar_url, headline, location").in("id", ids);
        sellers = people ?? [];
      }
      const byId = new Map(sellers.map((s) => [s.id, s]));
      return rows.map((g) => ({ ...g, seller: byId.get(g.freelancer_id) ?? null }));
    },
  });

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of data ?? []) m.set(g.category, (m.get(g.category) ?? 0) + 1);
    return m;
  }, [data]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    let rows = (data ?? []).filter((g) => {
      if (cat && g.category !== cat) return false;
      if (!term) return true;
      return `${g.title} ${g.description} ${(g.tags ?? []).join(" ")} ${g.seller?.full_name ?? ""}`.toLowerCase().includes(term);
    });
    rows = [...rows].sort((a, b) =>
      sort === "price" ? Number(a.price) - Number(b.price)
        : sort === "delivery" ? a.delivery_days - b.delivery_days
          : sort === "orders" ? b.orders_count - a.orders_count
            : Number(b.rating_avg) - Number(a.rating_avg));
    return rows;
  }, [data, q, cat, sort]);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <SiteHeader />
      <main className="flex-1">
        <section className="bg-hero-band/40 border-b border-black/5 py-10">
          <div className="mx-auto max-w-7xl px-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                {cat && (
                  <button onClick={() => setCat(null)} className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <ArrowLeft className="h-3.5 w-3.5" /> All categories
                  </button>
                )}
                <h1 className="font-serif text-3xl md:text-4xl font-bold tracking-tight text-ink">
                  {cat ?? "Freelance Marketplace"}
                </h1>
                <p className="mt-2 text-sm text-ink-soft max-w-2xl">
                  {cat
                    ? "Browse services in this category and hire the freelancer that fits your budget and timeline."
                    : "Pick a category to see the services on offer and the freelancers behind them."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline"><Link to="/freelance/orders"><Package className="h-4 w-4 mr-2" /> My orders</Link></Button>
                <Button asChild variant="outline"><Link to="/freelance/dashboard">Freelancer dashboard</Link></Button>
                <Button asChild><Link to="/freelance/profile"><Plus className="h-4 w-4 mr-2" /> Create freelancer profile</Link></Button>
              </div>

            </div>

            {cat && (
              <div className="mt-6 flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search services or freelancers…" className="pl-9 bg-white" />
                </div>
                <Select value={sort} onValueChange={setSort}>
                  <SelectTrigger className="w-[200px] bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rating">Top rated</SelectItem>
                    <SelectItem value="orders">Most jobs completed</SelectItem>
                    <SelectItem value="price">Lowest price</SelectItem>
                    <SelectItem value="delivery">Fastest delivery</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-10">
          {!cat ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {GIG_CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => { setCat(c); setQ(""); }}
                  className="text-left rounded-2xl bg-card p-6 ring-1 ring-black/5 hover:ring-primary/40 hover:shadow-sm transition"
                >
                  <span className="inline-grid h-12 w-12 place-items-center rounded-xl bg-primary-soft text-primary">
                    {CATEGORY_ICONS[c] ?? <Briefcase className="h-6 w-6" />}
                  </span>
                  <h2 className="mt-4 font-semibold text-ink">{c}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {(counts.get(c) ?? 0)} service{(counts.get(c) ?? 0) === 1 ? "" : "s"} available
                  </p>
                </button>
              ))}
            </div>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">Loading services…</p>
          ) : list.length === 0 ? (
            <div className="rounded-2xl bg-card p-12 ring-1 ring-black/5 text-center">
              <Briefcase className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground mb-4">No services published in {cat} yet.</p>
              <Button asChild><Link to="/freelance/new">Be the first to sell a service</Link></Button>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((g) => (
                <Link
                  key={g.id}
                  to="/freelance/$gigId"
                  params={{ gigId: g.id }}
                  className="rounded-2xl bg-card ring-1 ring-black/5 overflow-hidden hover:ring-primary/40 transition flex flex-col"
                >
                  <div className="h-40 bg-secondary/60 grid place-items-center overflow-hidden">
                    {g.cover_url
                      ? <img src={g.cover_url} alt={g.title} loading="lazy" className="h-full w-full object-cover" />
                      : <Briefcase className="h-8 w-8 text-muted-foreground/40" />}
                  </div>

                  {/* Freelancer profile — Upwork-style prominent identity block */}
                  <div className="flex items-center gap-3 px-5 pt-5">
                    {g.seller?.avatar_url ? (
                      <img src={g.seller.avatar_url} alt={g.seller.full_name ?? "Freelancer"} loading="lazy"
                        className="h-14 w-14 rounded-full object-cover ring-2 ring-primary/20" />
                    ) : (
                      <span className="grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary text-lg font-bold ring-2 ring-primary/20">
                        {(g.seller?.full_name ?? "S").slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-ink truncate">{g.seller?.full_name ?? "SahanJobs freelancer"}</p>
                      <p className="text-xs text-muted-foreground truncate">{g.seller?.headline ?? g.category}</p>
                      <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
                        <Star className="h-3.5 w-3.5 fill-current" /> {Number(g.rating_avg).toFixed(1)}
                        <span className="font-normal text-muted-foreground">({g.rating_count})</span>
                      </span>
                    </div>
                  </div>

                  <div className="p-5 pt-4 flex-1 flex flex-col">
                    <h3 className="font-semibold text-ink line-clamp-2">{g.title}</h3>
                    <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{g.description}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> {g.orders_count} jobs completed</span>
                      <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {g.delivery_days}d delivery</span>
                    </div>
                    <p className="mt-auto pt-4 text-lg font-bold text-ink">
                      {g.currency} {Number(g.price).toLocaleString()}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">starting rate</span>
                    </p>
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
