import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { TRADES } from "./services.index";

export const Route = createFileRoute("/services/register")({
  head: () => ({
    meta: [
      { title: "Register as a skilled worker — SahanJobs" },
      { name: "description", content: "Create your hand-skill profile: trades, rates, location and availability, and start receiving bookings." },
      { property: "og:title", content: "Register as a skilled worker — SahanJobs" },
      { property: "og:description", content: "Create your hand-skill profile and start receiving bookings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RegisterWorkerPage,
});

function RegisterWorkerPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: "", trades: [] as string[], bio: "", phone: "", location: "",
    hourly_rate: "", daily_rate: "", currency: "USD", available: true,
  });

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  const { data: existing } = useQuery({
    enabled: !!user,
    queryKey: ["my-worker-profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("skill_workers").select("*").eq("user_id", user!.id).maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (!existing) return;
    setForm({
      full_name: existing.full_name ?? "",
      trades: existing.trades ?? [],
      bio: existing.bio ?? "",
      phone: existing.phone ?? "",
      location: existing.location ?? "",
      hourly_rate: existing.hourly_rate?.toString() ?? "",
      daily_rate: existing.daily_rate?.toString() ?? "",
      currency: existing.currency ?? "USD",
      available: existing.available ?? true,
    });
  }, [existing]);

  const toggleTrade = (t: string) =>
    setForm((f) => ({ ...f, trades: f.trades.includes(t) ? f.trades.filter((x) => x !== t) : [...f.trades, t] }));

  const save = async () => {
    if (!user) return;
    if (!form.full_name.trim() || !form.location.trim() || form.trades.length === 0) {
      return toast.error("Name, location and at least one trade are required.");
    }
    setSaving(true);
    const payload = {
      user_id: user.id,
      full_name: form.full_name.trim(),
      trades: form.trades,
      bio: form.bio.trim() || null,
      phone: form.phone.trim() || null,
      location: form.location.trim(),
      hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : null,
      daily_rate: form.daily_rate ? Number(form.daily_rate) : null,
      currency: form.currency,
      available: form.available,
    };
    const { error } = await supabase.from("skill_workers").upsert(payload, { onConflict: "user_id" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Your service profile is live.");
    navigate({ to: "/services" });
  };

  return (
    <div className="min-h-screen flex flex-col bg-hero-band/40">
      <SiteHeader />
      <main className="flex-1 mx-auto w-full max-w-3xl px-6 py-10">
        <div className="flex items-center gap-3 mb-6">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Wrench className="h-5 w-5" /></span>
          <div>
            <h1 className="font-serif text-3xl font-bold text-ink">{existing ? "Edit your service profile" : "Offer your skills"}</h1>
            <p className="text-sm text-muted-foreground">Customers can find, contact and book you directly.</p>
          </div>
        </div>

        <div className="rounded-2xl bg-card p-6 ring-1 ring-black/5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label>Full name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Location / town</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
            <div><Label>Currency</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></div>
            <div><Label>Hourly rate</Label><Input type="number" value={form.hourly_rate} onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })} /></div>
            <div><Label>Daily rate</Label><Input type="number" value={form.daily_rate} onChange={(e) => setForm({ ...form, daily_rate: e.target.value })} /></div>
          </div>

          <div>
            <Label>Trades</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {TRADES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTrade(t)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition ${
                    form.trades.includes(t) ? "bg-primary text-primary-foreground ring-primary" : "bg-white text-ink ring-black/10 hover:bg-secondary"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div><Label>About your work</Label><Textarea rows={4} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Years of experience, specialities, areas you cover…" /></div>

          <div className="flex items-center justify-between rounded-xl bg-secondary/50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ink">Available for work</p>
              <p className="text-xs text-muted-foreground">Turn off when you're fully booked.</p>
            </div>
            <Switch checked={form.available} onCheckedChange={(v) => setForm({ ...form, available: v })} />
          </div>

          <Button onClick={save} disabled={saving} className="w-full">{saving ? "Saving…" : existing ? "Update profile" : "Publish profile"}</Button>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
