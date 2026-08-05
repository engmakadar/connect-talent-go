import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { UserRound, Upload, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export const Route = createFileRoute("/freelance/profile")({
  head: () => ({
    meta: [
      { title: "Freelancer profile — SahanJobs" },
      { name: "description", content: "Create your freelancer profile: summary, work experience, skills and hourly rate." },
      { property: "og:title", content: "Freelancer profile — SahanJobs" },
      { property: "og:description", content: "Summary, work experience, skills and hourly rate for clients to hire you." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FreelancerProfilePage,
});

type Exp = { role: string; company: string; period: string; details: string };

function FreelancerProfilePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    title: "", summary: "", expertise: "", skills: "", hourly_rate: "",
    currency: "USD", photo_url: "", location: "", available: true,
  });
  const [experience, setExperience] = useState<Exp[]>([]);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  const { data: existing } = useQuery({
    enabled: !!user,
    queryKey: ["freelancer-profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("freelancer_profiles").select("*").eq("user_id", user!.id).maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (!existing) return;
    setForm({
      title: existing.title ?? "",
      summary: existing.summary ?? "",
      expertise: existing.expertise ?? "",
      skills: (existing.skills ?? []).join(", "),
      hourly_rate: existing.hourly_rate?.toString() ?? "",
      currency: existing.currency ?? "USD",
      photo_url: existing.photo_url ?? "",
      location: existing.location ?? "",
      available: existing.available ?? true,
    });
    setExperience(Array.isArray(existing.experience) ? (existing.experience as unknown as Exp[]) : []);
  }, [existing]);

  const uploadPhoto = async (file: File) => {
    if (!user) return;
    setUploading(true);
    const path = `${user.id}/freelancer-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "")}`;
    const { error } = await supabase.storage.from("company-logos").upload(path, file, { upsert: true });
    if (error) { setUploading(false); return toast.error(error.message); }
    const { data } = supabase.storage.from("company-logos").getPublicUrl(path);
    setForm((f) => ({ ...f, photo_url: data.publicUrl }));
    setUploading(false);
  };

  const save = async () => {
    if (!user) return;
    if (!form.title.trim() || !form.summary.trim()) return toast.error("Professional title and summary are required.");
    setSaving(true);
    const { error } = await supabase.from("freelancer_profiles").upsert({
      user_id: user.id,
      title: form.title.trim(),
      summary: form.summary.trim(),
      expertise: form.expertise.trim() || null,
      skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean),
      experience: experience as unknown as never,
      hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : null,
      currency: form.currency || "USD",
      photo_url: form.photo_url || null,
      location: form.location.trim() || null,
      available: form.available,
    }, { onConflict: "user_id" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Freelancer profile saved.");
    qc.invalidateQueries({ queryKey: ["freelancer-profile"] });
    navigate({ to: "/freelance/dashboard" });
  };

  return (
    <div className="min-h-screen flex flex-col bg-hero-band/40">
      <SiteHeader />
      <main className="flex-1 mx-auto w-full max-w-3xl px-6 py-10">
        <div className="flex items-center gap-3 mb-6">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><UserRound className="h-5 w-5" /></span>
          <div>
            <h1 className="font-serif text-3xl font-bold text-ink">{existing ? "Edit freelancer profile" : "Create your freelancer profile"}</h1>
            <p className="text-sm text-muted-foreground">Clients see this before they order or send you a contract offer.</p>
          </div>
        </div>

        <div className="rounded-2xl bg-card p-6 ring-1 ring-black/5 space-y-4">
          <div className="flex items-center gap-4">
            {form.photo_url
              ? <img src={form.photo_url} alt="Profile" className="h-20 w-20 rounded-full object-cover ring-2 ring-primary/20" />
              : <span className="grid h-20 w-20 place-items-center rounded-full bg-secondary text-muted-foreground"><UserRound className="h-7 w-7" /></span>}
            <div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadPhoto(f); }} />
              <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-1" /> {uploading ? "Uploading…" : "Upload photo"}
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label>Professional title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Full-stack developer" /></div>
            <div><Label>Field of expertise</Label><Input value={form.expertise} onChange={(e) => setForm({ ...form, expertise: e.target.value })} placeholder="Web &amp; mobile apps" /></div>
            <div><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
            <div><Label>Hourly rate</Label><Input type="number" value={form.hourly_rate} onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })} /></div>
            <div><Label>Currency</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></div>
            <div><Label>Skills (comma separated)</Label><Input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} /></div>
          </div>

          <div><Label>Professional summary</Label><Textarea rows={5} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="What you do, who you help and results you deliver…" /></div>

          <div>
            <div className="flex items-center justify-between">
              <Label>Work experience</Label>
              <Button type="button" size="sm" variant="outline"
                onClick={() => setExperience([...experience, { role: "", company: "", period: "", details: "" }])}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add
              </Button>
            </div>
            <div className="mt-3 space-y-3">
              {experience.map((x, i) => (
                <div key={i} className="rounded-xl bg-secondary/40 p-4 space-y-2">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Input placeholder="Role" value={x.role} onChange={(e) => setExperience(experience.map((y, j) => j === i ? { ...y, role: e.target.value } : y))} />
                    <Input placeholder="Company" value={x.company} onChange={(e) => setExperience(experience.map((y, j) => j === i ? { ...y, company: e.target.value } : y))} />
                    <Input placeholder="2021 – 2024" value={x.period} onChange={(e) => setExperience(experience.map((y, j) => j === i ? { ...y, period: e.target.value } : y))} />
                  </div>
                  <Textarea rows={2} placeholder="What you delivered" value={x.details} onChange={(e) => setExperience(experience.map((y, j) => j === i ? { ...y, details: e.target.value } : y))} />
                  <Button type="button" size="sm" variant="ghost" className="text-destructive"
                    onClick={() => setExperience(experience.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                  </Button>
                </div>
              ))}
              {experience.length === 0 && <p className="text-xs text-muted-foreground">No work experience added yet.</p>}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-secondary/50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ink">Available for new contracts</p>
              <p className="text-xs text-muted-foreground">Turn off when you are fully booked.</p>
            </div>
            <Switch checked={form.available} onCheckedChange={(v) => setForm({ ...form, available: v })} />
          </div>

          <div className="flex gap-2">
            <Button onClick={save} disabled={saving} className="flex-1">{saving ? "Saving…" : "Save profile"}</Button>
            <Button asChild variant="outline"><Link to="/freelance/dashboard">Dashboard</Link></Button>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
