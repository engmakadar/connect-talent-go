import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Search, Star, MapPin, Phone, Wrench, Hammer, CalendarPlus, ArrowLeft, CheckCircle2,
  ClipboardList, Zap, Ruler, Blocks, PaintRoller, Flame, Cog, Grid3x3, AirVent, Fuel, SprayCan, Car,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

export const TRADES = [
  "Plumber", "Electrician", "Carpenter", "Mason", "Painter", "Welder",
  "Mechanic", "Tiler", "AC technician", "Generator technician", "Cleaner", "Driver",
];

/** Dedicated icon per skill category. */
export const TRADE_ICONS: Record<string, ReactNode> = {
  "Plumber": <Wrench className="h-6 w-6" />,
  "Electrician": <Zap className="h-6 w-6" />,
  "Carpenter": <Ruler className="h-6 w-6" />,
  "Mason": <Blocks className="h-6 w-6" />,
  "Painter": <PaintRoller className="h-6 w-6" />,
  "Welder": <Flame className="h-6 w-6" />,
  "Mechanic": <Cog className="h-6 w-6" />,
  "Tiler": <Grid3x3 className="h-6 w-6" />,
  "AC technician": <AirVent className="h-6 w-6" />,
  "Generator technician": <Fuel className="h-6 w-6" />,
  "Cleaner": <SprayCan className="h-6 w-6" />,
  "Driver": <Car className="h-6 w-6" />,
};


export const Route = createFileRoute("/services/")({
  head: () => ({
    meta: [
      { title: "Hand-skill services — hire trusted trades | SahanJobs" },
      { name: "description", content: "Pick a trade, compare skilled workers by price, rating and work done, then book and rate the job." },
      { property: "og:title", content: "Hand-skill services — hire trusted trades" },
      { property: "og:description", content: "Pick a trade, compare skilled workers by price, rating and work done, then book directly." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ServicesPage,
});

type Worker = {
  id: string; full_name: string; trades: string[]; bio: string | null; phone: string | null;
  location: string; hourly_rate: number | null; daily_rate: number | null; currency: string;
  available: boolean; photo_url: string | null; rating_avg: number; rating_count: number; jobs_completed: number;
  bookings_count: number; years_experience: number | null; gender: string | null;
};

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
      ))}
    </span>
  );
}

const rateOf = (w: Worker) => w.hourly_rate ?? w.daily_rate ?? Number.POSITIVE_INFINITY;

function ServicesPage() {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [trade, setTrade] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("match");
  const [minRating, setMinRating] = useState("0");
  const [maxPrice, setMaxPrice] = useState("");
  const [booking, setBooking] = useState<Worker | null>(null);
  const [form, setForm] = useState({ description: "", address: "", scheduled_for: "", phone: "", name: "" });
  const [saving, setSaving] = useState(false);

  /** Booking details are pre-filled from the signed-in customer's stored profile. */
  const { data: me } = useQuery({
    enabled: !!user,
    queryKey: ["booking-identity", user?.id],
    staleTime: 300_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles").select("full_name, phone, location").eq("id", user!.id).maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (!me) return;
    setForm((f) => ({
      ...f,
      name: f.name || me.full_name || "",
      phone: f.phone || me.phone || "",
      address: f.address || me.location || "",
    }));
  }, [me]);

  const { data: workers, isLoading } = useQuery({
    queryKey: ["skill-workers"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("skill_workers")
        .select("id, full_name, trades, bio, phone, location, hourly_rate, daily_rate, currency, available, photo_url, rating_avg, rating_count, jobs_completed, bookings_count, years_experience, gender")
        .eq("approved", true)
        .eq("suspended", false)
        .order("rating_avg", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Worker[];
    },
  });

  /** Matching engine scores (skills 40 · distance 25 · rating 15 · availability 10 · experience 10). */
  const { data: matchScores } = useQuery({
    enabled: !!trade && sort === "match",
    queryKey: ["worker-match", trade],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("match_service_workers", { _trade: trade ?? undefined });
      if (error) throw error;
      return new Map((data ?? []).map((m) => [m.worker_id, Number(m.match_score)]));
    },
  });


  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of workers ?? []) for (const t of w.trades) m.set(t, (m.get(t) ?? 0) + 1);
    return m;
  }, [workers]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const cap = maxPrice.trim() ? Number(maxPrice) : null;
    const rows = (workers ?? []).filter((w) => {
      if (trade && !w.trades.includes(trade)) return false;
      if (Number(w.rating_avg) < Number(minRating)) return false;
      if (cap !== null && !Number.isNaN(cap) && rateOf(w) > cap) return false;
      if (!term) return true;
      return (
        w.full_name.toLowerCase().includes(term) ||
        w.location.toLowerCase().includes(term) ||
        w.trades.join(" ").toLowerCase().includes(term)
      );
    });
    return [...rows].sort((a, b) =>
      sort === "price" ? rateOf(a) - rateOf(b)
        : sort === "work" ? b.jobs_completed - a.jobs_completed
          : sort === "match" ? (matchScores?.get(b.id) ?? 0) - (matchScores?.get(a.id) ?? 0)
            : Number(b.rating_avg) - Number(a.rating_avg));
  }, [workers, q, trade, sort, minRating, maxPrice, matchScores]);

  const submitBooking = async () => {
    if (!user) return toast.error("Please sign in to book a service.");
    if (!booking) return;
    if (!form.description.trim() || !form.address.trim() || !form.name.trim()) {
      return toast.error("Name, job description and address are required.");
    }
    setSaving(true);
    const { error } = await supabase.from("service_bookings").insert({
      worker_id: booking.id,
      customer_id: user.id,
      customer_name: form.name.trim(),
      customer_phone: form.phone.trim() || null,
      description: form.description.trim(),
      address: form.address.trim(),
      scheduled_for: form.scheduled_for ? new Date(form.scheduled_for).toISOString() : null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Booking request sent.", {
      description: "Track and process the work lifecycle from your bookings page.",
      action: { label: "Open lifecycle", onClick: () => void navigate({ to: "/services/workflow" }) },
    });
    setBooking(null);
    setForm((f) => ({ ...f, description: "", scheduled_for: "" }));
    qc.invalidateQueries({ queryKey: ["my-bookings"] });
  };

  return (
    <div className="min-h-screen flex flex-col bg-hero-band/40">
      <SiteHeader />
      <main className="flex-1">
        <section className="bg-hero-band">
          <div className="mx-auto max-w-6xl px-6 py-12">
            {trade && (
              <button onClick={() => setTrade(null)} className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                <ArrowLeft className="h-3.5 w-3.5" /> All service categories
              </button>
            )}
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Hammer className="h-3.5 w-3.5" /> Hand-skill portal
            </span>
            <h1 className="mt-3 font-serif text-4xl font-bold text-ink">{trade ? `${trade} services` : "Hire trusted skilled workers"}</h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              {trade
                ? "Compare workers by price, rating and completed jobs, then book the right person."
                : "Choose a service category to see available workers, their rates and ratings."}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              {trade && (
                <>
                  <div className="relative flex-1 min-w-[220px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or town…" className="pl-9 bg-white" />
                  </div>
                  <Select value={sort} onValueChange={setSort}>
                    <SelectTrigger className="w-[180px] bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="match">Best match</SelectItem>
                      <SelectItem value="rating">Top rated</SelectItem>
                      <SelectItem value="price">Lowest price</SelectItem>
                      <SelectItem value="work">Most work done</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={minRating} onValueChange={setMinRating}>
                    <SelectTrigger className="w-[160px] bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Any rating</SelectItem>
                      <SelectItem value="3">3★ and up</SelectItem>
                      <SelectItem value="4">4★ and up</SelectItem>
                      <SelectItem value="4.5">4.5★ and up</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    inputMode="numeric"
                    placeholder="Max rate"
                    className="w-[130px] bg-white"
                  />
                </>
              )}
              {isAdmin ? (
                <Link to="/admin/skill-workers" className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
                  <Wrench className="h-4 w-4" /> Register a skilled worker
                </Link>
              ) : (
                <Link to="/services/register" className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-primary ring-1 ring-primary/30 hover:bg-primary/5">
                  <Wrench className="h-4 w-4" /> Become a worker
                </Link>
              )}
              <Link to="/services/workflow" className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink/90">
                <ClipboardList className="h-4 w-4" /> My bookings & work lifecycle
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-10">
          {!trade ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {TRADES.map((t) => (
                <button
                  key={t}
                  onClick={() => { setTrade(t); setQ(""); }}
                  className="text-left rounded-2xl bg-card p-6 ring-1 ring-black/5 hover:ring-primary/40 hover:shadow-sm transition"
                >
                  <span className="inline-grid h-12 w-12 place-items-center rounded-xl bg-primary-soft text-primary">
                    {TRADE_ICONS[t] ?? <Wrench className="h-6 w-6" />}
                  </span>
                  <h2 className="mt-4 font-semibold text-ink">{t}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {(counts.get(t) ?? 0)} worker{(counts.get(t) ?? 0) === 1 ? "" : "s"} available
                  </p>
                </button>
              ))}
            </div>
          ) : isLoading ? (
            <p className="text-muted-foreground">Loading workers…</p>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl bg-card p-12 ring-1 ring-black/5 text-center">
              <Wrench className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">No {trade.toLowerCase()}s match your filters yet.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((w) => (
                <div key={w.id} className="rounded-2xl bg-card p-5 ring-1 ring-black/5 flex flex-col">
                  <div className="flex items-start gap-3">
                    {w.photo_url ? (
                      <img src={w.photo_url} alt={w.full_name} loading="lazy" className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-black/5" />
                    ) : (
                      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary text-lg font-bold">
                        {w.full_name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-ink truncate">{w.full_name}</p>
                      <p className="text-xs text-muted-foreground inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {w.location}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <Stars value={w.rating_avg} />
                        <span className="text-[11px] text-muted-foreground">{Number(w.rating_avg).toFixed(1)} ({w.rating_count})</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {w.trades.slice(0, 4).map((t) => (
                      <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                    ))}
                    {sort === "match" && matchScores?.has(w.id) && (
                      <Badge className="bg-primary/10 text-primary border-0 text-[10px]">Match {matchScores.get(w.id)}%</Badge>
                    )}
                    {!w.available && <Badge className="bg-muted text-muted-foreground border-0 text-[10px]">Busy</Badge>}
                  </div>

                  {w.bio && <p className="mt-3 text-sm text-muted-foreground line-clamp-3">{w.bio}</p>}

                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> {w.jobs_completed} work done
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CalendarPlus className="h-3.5 w-3.5" /> booked {w.bookings_count}×
                        {w.years_experience ? ` · ${w.years_experience} yrs exp` : ""}
                      </span>
                    </span>

                    <span className="font-semibold text-ink">
                      {w.hourly_rate ? `${w.currency} ${w.hourly_rate}/hr` : w.daily_rate ? `${w.currency} ${w.daily_rate}/day` : "Rate on request"}
                    </span>
                  </div>

                  <div className="mt-4 flex gap-2">
                    {!user ? (
                      <Button size="sm" className="flex-1" asChild>
                        <Link to="/auth" search={{ mode: "signin" } as never}>
                          <CalendarPlus className="h-4 w-4 mr-1" /> Sign in to book
                        </Link>
                      </Button>
                    ) : (
                    <Dialog open={booking?.id === w.id} onOpenChange={(o) => setBooking(o ? w : null)}>
                      <DialogTrigger asChild>
                        <Button size="sm" className="flex-1"><CalendarPlus className="h-4 w-4 mr-1" /> Book</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Book {w.full_name}</DialogTitle></DialogHeader>
                        <div className="space-y-3">
                          <div><Label>Your name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                          <div><Label>Your phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                          <div><Label>What needs doing?</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                          <div><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
                          <div><Label>Preferred date & time</Label><Input type="datetime-local" value={form.scheduled_for} onChange={(e) => setForm({ ...form, scheduled_for: e.target.value })} /></div>
                        </div>
                        <DialogFooter>
                          <Button onClick={submitBooking} disabled={saving}>{saving ? "Sending…" : "Send request"}</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                    )}
                    {w.phone && (
                      <a href={`tel:${w.phone}`} className="inline-flex items-center justify-center rounded-md px-3 ring-1 ring-black/10 hover:bg-secondary">
                        <Phone className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
