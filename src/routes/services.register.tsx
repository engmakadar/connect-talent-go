import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Wrench, Upload, ShieldAlert, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { TRADES } from "./services.index";

export const Route = createFileRoute("/services/register")({
  head: () => ({
    meta: [
      { title: "Register a skilled worker — SahanJobs" },
      { name: "description", content: "Super Admins and Admins register verified skilled workers: identity, trades, rates, availability and photo." },
      { property: "og:title", content: "Register a skilled worker — SahanJobs" },
      { property: "og:description", content: "Admin-only registration of verified hand-skill professionals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RegisterWorkerPage,
});

const EMPTY = {
  full_name: "", phone: "", location: "", national_id: "", currency: "USD",
  photo_url: "", years_experience: "", gender: "", date_of_birth: "",
  trades: [] as string[], bio: "", hourly_rate: "", daily_rate: "", available: true, approved: true,
};

function RegisterWorkerPage() {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  const { data: workers } = useQuery({
    enabled: !!user && isAdmin,
    queryKey: ["admin-skill-workers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("skill_workers")
        .select("id, full_name, location, trades, approved, available, bookings_count, rating_avg")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const toggleTrade = (t: string) =>
    setForm((f) => ({ ...f, trades: f.trades.includes(t) ? f.trades.filter((x) => x !== t) : [...f.trades, t] }));

  const uploadPhoto = async (file: File) => {
    if (!user) return;
    setUploading(true);
    const path = `${user.id}/worker-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "")}`;
    const { error } = await supabase.storage.from("company-logos").upload(path, file, { upsert: true });
    if (error) { setUploading(false); return toast.error(error.message); }
    const { data } = supabase.storage.from("company-logos").getPublicUrl(path);
    setForm((f) => ({ ...f, photo_url: data.publicUrl }));
    setUploading(false);
    toast.success("Photo uploaded.");
  };

  const startEdit = async (id: string) => {
    const { data } = await supabase.from("skill_workers").select("*").eq("id", id).maybeSingle();
    if (!data) return;
    setEditId(id);
    setForm({
      full_name: data.full_name ?? "",
      phone: data.phone ?? "",
      location: data.location ?? "",
      national_id: data.national_id ?? "",
      currency: data.currency ?? "USD",
      photo_url: data.photo_url ?? "",
      years_experience: data.years_experience?.toString() ?? "",
      gender: data.gender ?? "",
      date_of_birth: data.date_of_birth ?? "",
      trades: data.trades ?? [],
      bio: data.bio ?? "",
      hourly_rate: data.hourly_rate?.toString() ?? "",
      daily_rate: data.daily_rate?.toString() ?? "",
      available: data.available ?? true,
      approved: data.approved ?? true,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async () => {
    if (!form.full_name.trim() || !form.location.trim() || form.trades.length === 0) {
      return toast.error("Full name, location and at least one trade are required.");
    }
    setSaving(true);
    const payload = {
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      location: form.location.trim(),
      national_id: form.national_id.trim() || null,
      currency: form.currency || "USD",
      photo_url: form.photo_url || null,
      years_experience: form.years_experience ? Number(form.years_experience) : null,
      gender: form.gender || null,
      date_of_birth: form.date_of_birth || null,
      trades: form.trades,
      bio: form.bio.trim() || null,
      hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : null,
      daily_rate: form.daily_rate ? Number(form.daily_rate) : null,
      available: form.available,
      approved: form.approved,
    };
    const { error } = editId
      ? await supabase.from("skill_workers").update(payload).eq("id", editId)
      : await supabase.from("skill_workers").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(editId ? "Worker profile updated." : "Skilled worker registered.");
    setEditId(null);
    setForm({ ...EMPTY });
    qc.invalidateQueries({ queryKey: ["admin-skill-workers"] });
    qc.invalidateQueries({ queryKey: ["skill-workers"] });
  };

  if (loading) return null;

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col bg-hero-band/40">
        <SiteHeader />
        <main className="flex-1 mx-auto w-full max-w-2xl px-6 py-20 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <h1 className="mt-4 font-serif text-2xl font-bold text-ink">Admin-only registration</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Skilled worker profiles are created and verified by SahanJob administrators.
            Contact the SahanJob team to be listed on the services portal.
          </p>
          <Button asChild className="mt-6"><Link to="/services">Browse services</Link></Button>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-hero-band/40">
      <SiteHeader />
      <main className="flex-1 mx-auto w-full max-w-5xl px-6 py-10">
        <div className="flex items-center gap-3 mb-6">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Wrench className="h-5 w-5" /></span>
          <div>
            <h1 className="font-serif text-3xl font-bold text-ink">{editId ? "Edit skilled worker" : "Register a skilled worker"}</h1>
            <p className="text-sm text-muted-foreground">Only Super Admins and Admins can create hand-skill profiles.</p>
          </div>
        </div>

        <div className="rounded-2xl bg-card p-6 ring-1 ring-black/5 space-y-4">
          <div className="flex items-center gap-4">
            {form.photo_url
              ? <img src={form.photo_url} alt="Worker" className="h-20 w-20 rounded-xl object-cover ring-1 ring-black/10" />
              : <span className="grid h-20 w-20 place-items-center rounded-xl bg-secondary text-muted-foreground"><Wrench className="h-7 w-7" /></span>}
            <div>
              <input
                ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadPhoto(f); }}
              />
              <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-1" /> {uploading ? "Uploading…" : "Upload profile picture"}
              </Button>
              <p className="mt-1 text-xs text-muted-foreground">JPG or PNG, square works best.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div><Label>Full name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Location / town</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
            <div><Label>National ID card number</Label><Input value={form.national_id} onChange={(e) => setForm({ ...form, national_id: e.target.value })} /></div>
            <div>
              <Label>Gender</Label>
              <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Date of birth</Label><Input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></div>
            <div><Label>Years of experience</Label><Input type="number" value={form.years_experience} onChange={(e) => setForm({ ...form, years_experience: e.target.value })} /></div>
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

          <div><Label>About your work</Label><Textarea rows={4} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Specialities, areas covered, notable jobs…" /></div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-xl bg-secondary/50 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-ink">Available for work</p>
                <p className="text-xs text-muted-foreground">Turn off when fully booked.</p>
              </div>
              <Switch checked={form.available} onCheckedChange={(v) => setForm({ ...form, available: v })} />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-secondary/50 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-ink">Approved / published</p>
                <p className="text-xs text-muted-foreground">Visible on the public services portal.</p>
              </div>
              <Switch checked={form.approved} onCheckedChange={(v) => setForm({ ...form, approved: v })} />
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={save} disabled={saving} className="flex-1">
              {saving ? "Saving…" : editId ? "Update worker" : "Register worker"}
            </Button>
            {editId && <Button variant="outline" onClick={() => { setEditId(null); setForm({ ...EMPTY }); }}>Cancel</Button>}
          </div>
        </div>

        <h2 className="mt-10 mb-3 font-serif text-xl font-bold text-ink">Registered workers ({workers?.length ?? 0})</h2>
        <div className="rounded-2xl bg-card ring-1 ring-black/5 divide-y divide-black/5">
          {(workers ?? []).map((w) => (
            <div key={w.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="font-semibold text-ink">{w.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  {w.location} · {(w.trades ?? []).join(", ")} · booked {w.bookings_count}× · {Number(w.rating_avg).toFixed(1)}★
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!w.approved && <Badge variant="outline">Unpublished</Badge>}
                {!w.available && <Badge variant="outline">Busy</Badge>}
                <Button size="sm" variant="outline" onClick={() => void startEdit(w.id)}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
              </div>
            </div>
          ))}
          {(workers ?? []).length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">No skilled workers registered yet.</p>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
