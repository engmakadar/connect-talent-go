import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, Star, MapPin, Phone, Wrench, Hammer, CalendarPlus } from "lucide-react";
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

export const Route = createFileRoute("/services/")({
  head: () => ({
    meta: [
      { title: "Hand-skill services — hire trusted trades | SahanJobs" },
      { name: "description", content: "Find verified plumbers, electricians, carpenters and other skilled workers near you. Book directly and rate their work." },
      { property: "og:title", content: "Hand-skill services — hire trusted trades" },
      { property: "og:description", content: "Find verified plumbers, electricians, carpenters and other skilled workers near you." },
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

function ServicesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [trade, setTrade] = useState("all");
  const [booking, setBooking] = useState<Worker | null>(null);
  const [form, setForm] = useState({ description: "", address: "", scheduled_for: "", phone: "", name: "" });
  const [saving, setSaving] = useState(false);

  const { data: workers, isLoading } = useQuery({
    queryKey: ["skill-workers"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("skill_workers")
        .select("id, full_name, trades, bio, phone, location, hourly_rate, daily_rate, currency, available, photo_url, rating_avg, rating_count, jobs_completed")
        .eq("approved", true)
        .order("rating_avg", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Worker[];
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (workers ?? []).filter((w) => {
      if (trade !== "all" && !w.trades.includes(trade)) return false;
      if (!term) return true;
      return (
        w.full_name.toLowerCase().includes(term) ||
        w.location.toLowerCase().includes(term) ||
        w.trades.join(" ").toLowerCase().includes(term)
      );
    });
  }, [workers, q, trade]);

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
    toast.success("Booking request sent.");
    setBooking(null);
    setForm({ description: "", address: "", scheduled_for: "", phone: "", name: "" });
    qc.invalidateQueries({ queryKey: ["my-bookings"] });
  };

  return (
    <div className="min-h-screen flex flex-col bg-hero-band/40">
      <SiteHeader />
      <main className="flex-1">
        <section className="bg-hero-band">
          <div className="mx-auto max-w-6xl px-6 py-12">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Hammer className="h-3.5 w-3.5" /> Hand-skill portal
            </span>
            <h1 className="mt-3 font-serif text-4xl font-bold text-ink">Hire trusted skilled workers</h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Plumbers, electricians, carpenters, masons and more — browse profiles, check ratings, and book directly.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search trade, name or town…" className="pl-9 bg-white" />
              </div>
              <Select value={trade} onValueChange={setTrade}>
                <SelectTrigger className="w-[220px] bg-white"><SelectValue placeholder="All trades" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All trades</SelectItem>
                  {TRADES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Link to="/services/register" className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
                <Wrench className="h-4 w-4" /> Offer your skills
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-10">
          {isLoading ? (
            <p className="text-muted-foreground">Loading workers…</p>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl bg-card p-12 ring-1 ring-black/5 text-center">
              <Wrench className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">No skilled workers match your search yet.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((w) => (
                <div key={w.id} className="rounded-2xl bg-card p-5 ring-1 ring-black/5 flex flex-col">
                  <div className="flex items-start gap-3">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary font-bold">
                      {w.full_name.slice(0, 1).toUpperCase()}
                    </span>
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
                    {!w.available && <Badge className="bg-muted text-muted-foreground border-0 text-[10px]">Busy</Badge>}
                  </div>
                  {w.bio && <p className="mt-3 text-sm text-muted-foreground line-clamp-3">{w.bio}</p>}
                  <p className="mt-3 text-sm font-semibold text-ink">
                    {w.hourly_rate ? `${w.currency} ${w.hourly_rate}/hr` : w.daily_rate ? `${w.currency} ${w.daily_rate}/day` : "Rate on request"}
                  </p>
                  <div className="mt-4 flex gap-2">
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
