import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  Wrench, Upload, User, Award, MapPin, CalendarCheck, CheckCircle2,
  ChevronLeft, ChevronRight, BadgeCheck, Clock,
} from "lucide-react";
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
import { TRADES } from "@/lib/trades";

export const Route = createFileRoute("/services/register")({
  head: () => ({
    meta: [
      { title: "Become a skilled worker — SahanJobs Services" },
      { name: "description", content: "Multi-step enrollment for hand-skill professionals: personal info, trades, certifications, service area and availability. Verified by our team before you appear in matching." },
      { property: "og:title", content: "Become a skilled worker — SahanJobs Services" },
      { property: "og:description", content: "Register as a verified hand-skill professional and receive job requests." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkerEnrollmentPage,
});

const STEPS = [
  { id: "account", label: "Account", icon: User },
  { id: "personal", label: "Personal info", icon: User },
  { id: "skills", label: "Skills & trades", icon: Wrench },
  { id: "certifications", label: "Certifications", icon: Award },
  { id: "area", label: "Service area", icon: MapPin },
  { id: "availability", label: "Availability", icon: CalendarCheck },
] as const;

type Cert = { name: string; issuer: string; year: string };

const EMPTY = {
  full_name: "", phone: "", gender: "", date_of_birth: "", national_id: "",
  photo_url: "", trades: [] as string[], years_experience: "",
  hourly_rate: "", daily_rate: "", currency: "USD",
  certifications: [] as Cert[],
  location: "", latitude: "", longitude: "", service_radius_km: "25",
  available: true, bio: "",
};

function WorkerEnrollmentPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  // Existing worker profile (if any) — shows verification status instead of the wizard.
  const { data: existing, isLoading } = useQuery({
    enabled: !!user,
    queryKey: ["my-worker-profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("skill_workers")
        .select("id, full_name, approved, suspended, available, verified_at, trades, location")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  // Pre-fill identity from the account profile.
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
      full_name: f.full_name || me.full_name || "",
      phone: f.phone || me.phone || "",
      location: f.location || me.location || "",
    }));
  }, [me]);

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

  const stepValid = (s: number): boolean => {
    switch (STEPS[s].id) {
      case "account": return !!user;
      case "personal": return !!form.full_name.trim();
      case "skills": return form.trades.length > 0;
      case "certifications": return true;
      case "area": return !!form.location.trim();
      case "availability": return true;
      default: return false;
    }
  };

  const next = () => {
    if (!stepValid(step)) {
      const needs = ["", "your full name", "at least one trade", "", "your location / town", ""][step];
      return toast.error(`Please provide ${needs} before continuing.`);
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const submit = async () => {
    if (!user) return;
    if (!stepValid(1) || !stepValid(2) || !stepValid(4)) {
      return toast.error("Full name, at least one trade and a location are required.");
    }
    setSaving(true);
    const { error } = await supabase.from("skill_workers").insert({
      user_id: user.id,
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      gender: form.gender || null,
      date_of_birth: form.date_of_birth || null,
      national_id: form.national_id.trim() || null,
      photo_url: form.photo_url || null,
      trades: form.trades,
      years_experience: form.years_experience ? Number(form.years_experience) : null,
      hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : null,
      daily_rate: form.daily_rate ? Number(form.daily_rate) : null,
      currency: form.currency || "USD",
      certifications: form.certifications.filter((c) => c.name.trim()),
      location: form.location.trim(),
      latitude: form.latitude ? Number(form.latitude) : null,
      longitude: form.longitude ? Number(form.longitude) : null,
      service_radius_km: form.service_radius_km ? Number(form.service_radius_km) : 25,
      available: form.available,
      bio: form.bio.trim() || null,
      approved: false, // verified by an admin before appearing in matching
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Enrollment submitted. Our team will verify your profile before you appear in matching.");
    navigate({ to: "/services/bookings" });
  };

  const addCert = () => setForm((f) => ({ ...f, certifications: [...f.certifications, { name: "", issuer: "", year: "" }] }));
  const setCert = (i: number, patch: Partial<Cert>) =>
    setForm((f) => ({ ...f, certifications: f.certifications.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const removeCert = (i: number) =>
    setForm((f) => ({ ...f, certifications: f.certifications.filter((_, j) => j !== i) }));

  return (
    <div className="min-h-screen flex flex-col bg-hero-band/40">
      <SiteHeader />
      <main className="flex-1 mx-auto w-full max-w-3xl px-6 py-10">
        <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          <Wrench className="h-3.5 w-3.5" /> Worker enrollment
        </span>
        <h1 className="mt-3 font-serif text-3xl font-bold text-ink">Register as a skilled worker</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Complete the steps below. An admin verifies every profile before it appears in customer matching.
        </p>

        {isLoading ? (
          <p className="mt-10 text-muted-foreground">Loading…</p>
        ) : existing ? (
          <div className="mt-8 rounded-2xl bg-card p-8 ring-1 ring-black/5 text-center">
            {existing.approved ? (
              <>
                <BadgeCheck className="mx-auto h-10 w-10 text-primary" />
                <h2 className="mt-3 text-lg font-semibold text-ink">You're a verified worker</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {existing.full_name} · {existing.location} · {(existing.trades ?? []).join(", ")}
                  {existing.suspended ? " · currently suspended" : existing.available ? "" : " · marked busy"}
                </p>
                <Button className="mt-5" asChild><Link to="/services/bookings">View incoming jobs</Link></Button>
              </>
            ) : (
              <>
                <Clock className="mx-auto h-10 w-10 text-amber-500" />
                <h2 className="mt-3 text-lg font-semibold text-ink">Verification pending</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your profile was submitted and is awaiting admin verification. You'll appear in matching once approved.
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Stepper */}
            <ol className="mt-8 flex flex-wrap items-center gap-2">
              {STEPS.map((s, i) => (
                <li key={s.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => i < step && setStep(i)}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${
                      i === step ? "bg-primary text-primary-foreground ring-primary"
                        : i < step ? "bg-primary/10 text-primary ring-primary/30"
                          : "bg-white text-muted-foreground ring-black/10"
                    }`}
                  >
                    {i < step ? <CheckCircle2 className="h-3.5 w-3.5" /> : <s.icon className="h-3.5 w-3.5" />}
                    {s.label}
                  </button>
                  {i < STEPS.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />}
                </li>
              ))}
            </ol>

            <div className="mt-6 rounded-2xl bg-card p-6 ring-1 ring-black/5 space-y-4">
              {STEPS[step].id === "account" && (
                <>
                  <h2 className="font-semibold text-ink">Your account</h2>
                  <p className="text-sm text-muted-foreground">
                    You're enrolling with the account <span className="font-medium text-ink">{user?.email}</span>.
                    Job requests and notifications will reach you here.
                  </p>
                  <div className="flex items-center gap-4">
                    {form.photo_url
                      ? <img src={form.photo_url} alt="Worker profile" className="h-20 w-20 rounded-xl object-cover ring-1 ring-black/10" />
                      : <span className="grid h-20 w-20 place-items-center rounded-xl bg-secondary text-muted-foreground"><User className="h-7 w-7" /></span>}
                    <div>
                      <input ref={fileRef} type="file" accept="image/*" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadPhoto(f); }} />
                      <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                        <Upload className="h-4 w-4 mr-1" /> {uploading ? "Uploading…" : "Profile photo"}
                      </Button>
                      <p className="mt-1 text-xs text-muted-foreground">Optional — helps customers trust you.</p>
                    </div>
                  </div>
                </>
              )}

              {STEPS[step].id === "personal" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><Label>Full name *</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
                  <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
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
                  <div className="sm:col-span-2"><Label>National ID number</Label><Input value={form.national_id} onChange={(e) => setForm({ ...form, national_id: e.target.value })} /></div>
                </div>
              )}

              {STEPS[step].id === "skills" && (
                <>
                  <div>
                    <Label>Your trades *</Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {TRADES.map((t) => (
                        <button key={t} type="button" onClick={() => toggleTrade(t)}
                          className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition ${
                            form.trades.includes(t) ? "bg-primary text-primary-foreground ring-primary" : "bg-white text-ink ring-black/10 hover:bg-secondary"
                          }`}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div><Label>Years of experience</Label><Input type="number" value={form.years_experience} onChange={(e) => setForm({ ...form, years_experience: e.target.value })} /></div>
                    <div><Label>Currency</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></div>
                    <div><Label>Hourly rate</Label><Input type="number" value={form.hourly_rate} onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })} /></div>
                    <div><Label>Daily rate</Label><Input type="number" value={form.daily_rate} onChange={(e) => setForm({ ...form, daily_rate: e.target.value })} /></div>
                  </div>
                </>
              )}

              {STEPS[step].id === "certifications" && (
                <>
                  <div className="flex items-center justify-between">
                    <Label>Certifications & training (optional)</Label>
                    <Button type="button" size="sm" variant="outline" onClick={addCert}>Add certification</Button>
                  </div>
                  {form.certifications.length === 0 && (
                    <p className="text-sm text-muted-foreground">No certifications added — you can skip this step.</p>
                  )}
                  {form.certifications.map((c, i) => (
                    <div key={i} className="grid gap-3 sm:grid-cols-[1fr_1fr_100px_auto] items-end rounded-xl bg-secondary/40 p-3">
                      <div><Label>Name</Label><Input value={c.name} onChange={(e) => setCert(i, { name: e.target.value })} placeholder="e.g. Electrical installation" /></div>
                      <div><Label>Issuer</Label><Input value={c.issuer} onChange={(e) => setCert(i, { issuer: e.target.value })} placeholder="e.g. TVET centre" /></div>
                      <div><Label>Year</Label><Input inputMode="numeric" value={c.year} onChange={(e) => setCert(i, { year: e.target.value })} /></div>
                      <Button type="button" size="sm" variant="ghost" onClick={() => removeCert(i)}>Remove</Button>
                    </div>
                  ))}
                </>
              )}

              {STEPS[step].id === "area" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2"><Label>Location / town *</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
                  <div><Label>Latitude (optional)</Label><Input inputMode="decimal" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} placeholder="2.0469" /></div>
                  <div><Label>Longitude (optional)</Label><Input inputMode="decimal" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} placeholder="45.3182" /></div>
                  <div className="sm:col-span-2">
                    <Label>Service radius (km)</Label>
                    <Input type="number" value={form.service_radius_km} onChange={(e) => setForm({ ...form, service_radius_km: e.target.value })} />
                    <p className="mt-1 text-xs text-muted-foreground">Customers within this distance get a higher distance match score for you.</p>
                  </div>
                </div>
              )}

              {STEPS[step].id === "availability" && (
                <>
                  <div className="flex items-center justify-between rounded-xl bg-secondary/50 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">Available for work</p>
                      <p className="text-xs text-muted-foreground">Only available workers are eligible for matching.</p>
                    </div>
                    <Switch checked={form.available} onCheckedChange={(v) => setForm({ ...form, available: v })} />
                  </div>
                  <div><Label>About your work</Label><Textarea rows={4} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Specialities, areas covered, notable jobs…" /></div>
                  <div className="rounded-xl bg-primary/5 px-4 py-3 text-xs text-muted-foreground">
                    After submitting, an admin verifies your profile. Until then you won't appear in customer matching.
                  </div>
                </>
              )}

              <div className="flex items-center justify-between pt-2">
                <Button type="button" variant="outline" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Back
                </Button>
                {step < STEPS.length - 1 ? (
                  <Button type="button" onClick={next}>Continue <ChevronRight className="h-4 w-4 ml-1" /></Button>
                ) : (
                  <Button type="button" onClick={() => void submit()} disabled={saving}>
                    {saving ? "Submitting…" : "Submit for verification"}
                  </Button>
                )}
              </div>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Admins can also register workers directly from the console.{" "}
              <Link to="/services" className="text-primary font-medium">Back to services</Link>
            </p>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
