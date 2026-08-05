import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus, Trash2, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { GIG_CATEGORIES } from "./freelance.index";

export const Route = createFileRoute("/freelance/new")({
  head: () => ({
    meta: [
      { title: "Sell a service — SahanJobs Freelance" },
      { name: "description", content: "Publish a freelance service listing on SahanJobs and manage your existing gigs." },
      { property: "og:title", content: "Sell a service — SahanJobs Freelance" },
      { property: "og:description", content: "Publish a freelance service listing on SahanJobs and manage your existing gigs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewGigPage,
});

function NewGigPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: "", description: "", category: "General",
    price: "50", currency: "USD", delivery_days: "3", tags: "", cover_url: "",
  });

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  const { data: mine } = useQuery({
    enabled: !!user,
    queryKey: ["freelance-my-gigs", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("freelance_gigs")
        .select("id, title, price, currency, active, orders_count, rating_avg")
        .eq("freelancer_id", user!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in required");
      if (form.title.trim().length < 6) throw new Error("Give your service a descriptive title.");
      const { error } = await supabase.from("freelance_gigs").insert({
        freelancer_id: user.id,
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        price: Number(form.price) || 0,
        currency: form.currency,
        delivery_days: Number(form.delivery_days) || 1,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        cover_url: form.cover_url.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Service published.");
      setForm({ title: "", description: "", category: "General", price: "50", currency: "USD", delivery_days: "3", tags: "", cover_url: "" });
      qc.invalidateQueries({ queryKey: ["freelance-my-gigs"] });
      qc.invalidateQueries({ queryKey: ["freelance-gigs"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not publish."),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("freelance_gigs").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["freelance-my-gigs"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("freelance_gigs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Listing removed.");
      qc.invalidateQueries({ queryKey: ["freelance-my-gigs"] });
    },
  });

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="min-h-screen flex flex-col bg-hero-band/30">
      <SiteHeader />
      <main className="flex-1 mx-auto w-full max-w-5xl px-6 py-10">
        <h1 className="font-serif text-3xl font-bold text-ink">Sell a service</h1>
        <p className="mt-1 text-sm text-muted-foreground">Publish a fixed-price package clients can order in one click.</p>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl bg-card p-6 ring-1 ring-black/5 space-y-4">
            <Field label="Service title">
              <Input value={form.title} onChange={(e) => set("title")(e.target.value)} placeholder="I will design a modern brand identity" />
            </Field>
            <Field label="Description">
              <Textarea value={form.description} onChange={(e) => set("description")(e.target.value)} className="min-h-[120px]" placeholder="What's included, revisions, what you need from the client…" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <Select value={form.category} onValueChange={set("category")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{GIG_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Delivery (days)">
                <Input type="number" min={1} value={form.delivery_days} onChange={(e) => set("delivery_days")(e.target.value)} />
              </Field>
              <Field label="Price">
                <Input type="number" min={0} value={form.price} onChange={(e) => set("price")(e.target.value)} />
              </Field>
              <Field label="Currency">
                <Select value={form.currency} onValueChange={set("currency")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["USD", "KES", "ETB", "SOS", "EUR"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Tags (comma separated)">
              <Input value={form.tags} onChange={(e) => set("tags")(e.target.value)} placeholder="logo, branding, figma" />
            </Field>
            <Field label="Cover image URL (optional)">
              <Input value={form.cover_url} onChange={(e) => set("cover_url")(e.target.value)} placeholder="https://…" />
            </Field>
            <Button className="w-full" disabled={create.isPending} onClick={() => create.mutate()}>
              <Plus className="h-4 w-4 mr-2" /> {create.isPending ? "Publishing…" : "Publish service"}
            </Button>
          </div>

          <div className="rounded-2xl bg-card p-6 ring-1 ring-black/5">
            <h2 className="font-serif text-lg font-semibold text-ink mb-4">My listings</h2>
            {(mine ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">You haven't published any services yet.</p>
            ) : (
              <ul className="space-y-3">
                {mine!.map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/40 p-3">
                    <div className="min-w-0">
                      <Link to="/freelance/$gigId" params={{ gigId: g.id }} className="font-semibold text-ink hover:text-primary line-clamp-1">
                        {g.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {g.currency} {Number(g.price).toLocaleString()} · {g.orders_count} orders · {Number(g.rating_avg).toFixed(1)}★
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" variant="outline" onClick={() => toggle.mutate({ id: g.id, active: !g.active })}>
                        {g.active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      </Button>
                      <Button size="sm" variant="outline" className="text-destructive" onClick={() => remove.mutate(g.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
