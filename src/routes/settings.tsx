import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  User as UserIcon, Lock, ShieldCheck, Bell, Globe, Moon, Sun, Activity,
  LogIn, KeyRound, Edit3, FileText, AlertTriangle, MonitorSmartphone, ShieldAlert, ClipboardList,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings & Privacy — SahanJobs" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex flex-col bg-hero-band/40">
        <SiteHeader />
        <div className="flex-1 grid place-items-center text-sm text-muted-foreground">Loading…</div>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-hero-band/40">
      <SiteHeader />
      <section className="mx-auto w-full max-w-5xl px-4 md:px-8 py-10 flex-1">
        <h1 className="font-display text-3xl font-bold text-ink">Settings & Privacy</h1>
        <p className="text-muted-foreground mt-1">Manage your personal info, preferences and security.</p>

        <Tabs defaultValue="personal" className="mt-8">
          <TabsList className="bg-white ring-1 ring-black/5 shadow-sm rounded-full p-1 h-auto">
            <TabsTrigger value="personal" className="rounded-full px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <UserIcon className="h-4 w-4 mr-1.5" /> Personal Information
            </TabsTrigger>
            <TabsTrigger value="preferences" className="rounded-full px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Bell className="h-4 w-4 mr-1.5" /> Preferences
            </TabsTrigger>
            <TabsTrigger value="activity" className="rounded-full px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Activity className="h-4 w-4 mr-1.5" /> Activity Log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="personal" className="mt-6 space-y-6"><PersonalSection /></TabsContent>
          <TabsContent value="preferences" className="mt-6 space-y-6"><PreferencesSection /></TabsContent>
          <TabsContent value="activity" className="mt-6 space-y-6"><ActivitySection /></TabsContent>
        </Tabs>
      </section>
      <SiteFooter />
    </div>
  );
}

function Card({ icon: Icon, title, description, children }: { icon: typeof UserIcon; title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-sm p-6">
      <div className="flex items-start gap-3 mb-5">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

/* ------------------------- Personal Information ------------------------- */

function PersonalSection() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: profile } = useQuery({
    queryKey: ["my-profile", user!.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("first_name, last_name, full_name, username, email, phone, location, headline, bio")
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const [form, setForm] = useState({ first_name: "", last_name: "", phone: "", location: "", headline: "", bio: "" });
  useEffect(() => {
    if (profile) setForm({
      first_name: profile.first_name ?? "",
      last_name: profile.last_name ?? "",
      phone: profile.phone ?? "",
      location: profile.location ?? "",
      headline: profile.headline ?? "",
      bio: profile.bio ?? "",
    });
  }, [profile]);

  const save = async () => {
    const full_name = `${form.first_name} ${form.last_name}`.trim();
    const { error } = await supabase.from("profiles").update({ ...form, full_name }).eq("id", user!.id);
    if (error) return toast.error(error.message);
    await logActivity("profile_edit", { fields: Object.keys(form) });
    toast.success("Profile updated.");
    qc.invalidateQueries({ queryKey: ["my-profile", user!.id] });
  };

  return (
    <>
      <Card icon={UserIcon} title="Profile and personal details">
        <div className="grid gap-4 md:grid-cols-2">
          <div><Label>First name</Label><Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
          <div><Label>Last name</Label><Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
          <div><Label>Email</Label><Input value={profile?.email ?? ""} readOnly disabled /></div>
          <div><Label>Username</Label><Input value={profile?.username ?? ""} readOnly disabled /></div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
          <div className="md:col-span-2"><Label>Headline</Label><Input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} /></div>
          <div className="md:col-span-2"><Label>Bio</Label><Input value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></div>
        </div>
        <div className="mt-5 flex justify-end"><Button onClick={save}>Save changes</Button></div>
      </Card>

      <ChangePasswordCard />
      <TwoFactorCard />
    </>
  );
}

function ChangePasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (next.length < 8) return toast.error("Password must be at least 8 characters.");
    if (next !== confirm) return toast.error("Passwords do not match.");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: next });
    setSaving(false);
    if (error) return toast.error(error.message);
    await logActivity("password_change");
    toast.success("Password updated.");
    setCurrent(""); setNext(""); setConfirm("");
  };

  return (
    <Card icon={Lock} title="Change password" description="We recommend a strong password you don't use elsewhere.">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2"><Label>Current password</Label><Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
        <div><Label>New password</Label><Input type="password" value={next} onChange={(e) => setNext(e.target.value)} /></div>
        <div><Label>Confirm new password</Label><Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
      </div>
      <div className="mt-5 flex justify-end"><Button onClick={submit} disabled={saving || !next}>Update password</Button></div>
    </Card>
  );
}

function TwoFactorCard() {
  const [enabling, setEnabling] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const { data: factors, refetch } = useQuery({
    queryKey: ["mfa-factors"],
    queryFn: async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      return data;
    },
  });

  const totp = factors?.totp?.[0];

  const startEnroll = async () => {
    setEnabling(true);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    if (error) { setEnabling(false); return toast.error(error.message); }
    setFactorId(data.id);
    setQr(data.totp.qr_code);
    setSecret(data.totp.secret);
  };

  const verify = async () => {
    if (!factorId) return;
    const { data: ch, error: cerr } = await supabase.auth.mfa.challenge({ factorId });
    if (cerr) return toast.error(cerr.message);
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code });
    if (error) {
      await logActivity("2fa_fail");
      return toast.error(error.message);
    }
    await logActivity("2fa_enable");
    toast.success("Two-factor authentication enabled.");
    setEnabling(false); setFactorId(null); setQr(null); setSecret(null); setCode("");
    refetch();
  };

  const disable = async () => {
    if (!totp) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: totp.id });
    if (error) return toast.error(error.message);
    await logActivity("2fa_disable");
    toast.success("Two-factor authentication disabled.");
    refetch();
  };

  return (
    <Card icon={ShieldCheck} title="Two-factor authentication" description="Add an extra layer of security to your account.">
      {totp?.status === "verified" ? (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge className="bg-emerald-100 text-emerald-700 border-0">Enabled</Badge>
            <span className="text-sm text-muted-foreground">Authenticator app</span>
          </div>
          <Button variant="outline" onClick={disable}>Disable 2FA</Button>
        </div>
      ) : enabling && qr ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Scan this QR code in your authenticator app, then enter the 6-digit code below.</p>
          <div className="flex flex-col md:flex-row gap-5 items-start">
            <div className="bg-white p-3 rounded-lg ring-1 ring-black/5" dangerouslySetInnerHTML={{ __html: qr }} />
            <div className="flex-1 space-y-2">
              <Label>Or enter this secret manually</Label>
              <Input value={secret ?? ""} readOnly className="font-mono text-xs" />
              <Label className="mt-3 block">Verification code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} placeholder="123456" />
              <div className="flex gap-2 mt-2">
                <Button variant="outline" onClick={() => { setEnabling(false); setQr(null); setFactorId(null); }}>Cancel</Button>
                <Button onClick={verify}>Verify & enable</Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Not enabled.</span>
          <Button onClick={startEnroll}>Enable 2FA</Button>
        </div>
      )}
    </Card>
  );
}

/* ----------------------------- Preferences ----------------------------- */

function PreferencesSection() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: prefs } = useQuery({
    queryKey: ["my-prefs", user!.id],
    queryFn: async () => {
      const { data } = await supabase.from("user_preferences").select("*").eq("user_id", user!.id).maybeSingle();
      if (!data) {
        const { data: created } = await supabase.from("user_preferences").insert({ user_id: user!.id }).select("*").single();
        return created;
      }
      return data;
    },
  });

  const update = async (patch: Record<string, unknown>) => {
    const { error } = await supabase.from("user_preferences").update(patch as never).eq("user_id", user!.id);
    if (error) return toast.error(error.message);
    await logActivity("notification_pref", { changed: Object.keys(patch) });
    qc.invalidateQueries({ queryKey: ["my-prefs", user!.id] });
  };

  const notif = (prefs?.smart_notifications as Record<string, boolean>) ?? {};
  const setNotif = (key: string, v: boolean) => update({ smart_notifications: { ...notif, [key]: v } });

  const theme = prefs?.theme ?? "system";
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const apply = (t: string) => {
      const dark = t === "dark" || (t === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
      root.classList.toggle("dark", dark);
    };
    apply(theme);
  }, [theme]);

  return (
    <>
      <Card icon={Bell} title="Smart Notifications" description="Choose what alerts you want to receive.">
        {[
          { key: "new_jobs", label: "New job postings matching your profile" },
          { key: "new_tenders", label: "New tender opportunities" },
          { key: "application_updates", label: "Updates on your applications" },
          { key: "company_updates", label: "Updates from companies you follow" },
        ].map((item) => (
          <div key={item.key} className="flex items-center justify-between py-3 border-b border-black/5 last:border-0">
            <span className="text-sm text-ink">{item.label}</span>
            <Switch checked={notif[item.key] ?? true} onCheckedChange={(v) => setNotif(item.key, v)} />
          </div>
        ))}
      </Card>

      <Card icon={Globe} title="Language & Region">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Language</Label>
            <Select value={prefs?.language ?? "en"} onValueChange={(v) => update({ language: v })}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="so">Soomaali</SelectItem>
                <SelectItem value="ar">العربية</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Region</Label>
            <Select value={prefs?.region ?? "SO"} onValueChange={(v) => update({ region: v })}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SO">Somalia</SelectItem>
                <SelectItem value="KE">Kenya</SelectItem>
                <SelectItem value="ET">Ethiopia</SelectItem>
                <SelectItem value="DJ">Djibouti</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card icon={Moon} title="Display Mode" description="Pick light, dark, or follow your system.">
        <div className="inline-flex rounded-full bg-secondary p-1">
          {[
            { v: "light", l: "Light", Icon: Sun },
            { v: "dark", l: "Dark", Icon: Moon },
            { v: "system", l: "System", Icon: MonitorSmartphone },
          ].map((opt) => (
            <button key={opt.v}
              onClick={() => update({ theme: opt.v })}
              className={`px-4 py-2 rounded-full text-sm font-semibold inline-flex items-center gap-1.5 transition ${
                theme === opt.v ? "bg-primary text-primary-foreground shadow-sm" : "text-ink-soft hover:text-ink"
              }`}>
              <opt.Icon className="h-4 w-4" /> {opt.l}
            </button>
          ))}
        </div>
      </Card>
    </>
  );
}

/* ------------------------------- Activity ------------------------------- */

function ActivitySection() {
  const { user, signOut } = useAuth();
  const [range, setRange] = useState<{ from: number; to: number | null }>({ from: 0, to: 29 });
  const [search, setSearch] = useState("");

  const { data: total } = useQuery({
    queryKey: ["my-activity-count", user!.id],
    queryFn: async () => {
      const { count } = await supabase.from("user_activity_log").select("id", { count: "exact", head: true }).eq("user_id", user!.id);
      return count ?? 0;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["my-activity", user!.id, range, search],
    queryFn: async () => {
      let q = supabase.from("user_activity_log").select("*").eq("user_id", user!.id).order("created_at", { ascending: false });
      if (range.to !== null) q = q.range(range.from, range.to);
      if (search.trim()) q = q.ilike("event_type", `%${search.trim()}%`);
      const { data } = await q;
      return data ?? [];
    },
  });

  const terminateOthers = async () => {
    if (!confirm("Sign out of every other session?")) return;
    const { error } = await supabase.auth.signOut({ scope: "others" });
    if (error) return toast.error(error.message);
    await logActivity("session_terminate");
    toast.success("Other sessions ended.");
  };

  const downloadExcel = async () => {
    try {
      // Fetch all rows for export
      const { data: all } = await supabase.from("user_activity_log").select("*").eq("user_id", user!.id).order("created_at", { ascending: false });
      const xlsx = await import("xlsx");
      const rows = (all ?? []).map((e) => ({
        Time: new Date(e.created_at).toLocaleString(),
        Event: e.event_type,
        IP: e.ip ?? "",
        "User Agent": e.user_agent ?? "",
        Metadata: JSON.stringify(e.metadata ?? {}),
      }));
      const ws = xlsx.utils.json_to_sheet(rows);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "Activity");
      xlsx.writeFile(wb, `activity-log-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success("Export ready.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const totalCount = total ?? 0;
  const ranges: { label: string; from: number; to: number | null }[] = [
    { label: "1–30", from: 0, to: 29 },
    { label: "31–60", from: 30, to: 59 },
    { label: "61–90", from: 60, to: 89 },
    { label: "91–120", from: 90, to: 119 },
    { label: "All", from: 0, to: null },
  ];
  const prev = () => setRange((r) => r.to === null ? r : ({ from: Math.max(0, r.from - 30), to: Math.max(29, (r.to ?? 29) - 30) }));
  const next = () => setRange((r) => r.to === null ? r : ({ from: r.from + 30, to: (r.to ?? 29) + 30 }));

  return (
    <>
      <Card icon={MonitorSmartphone} title="Session management" description="Active devices signed in to your account.">
        <div className="flex items-center justify-between rounded-xl bg-secondary/50 p-4">
          <div>
            <p className="text-sm font-medium text-ink">This device</p>
            <p className="text-xs text-muted-foreground">
              {typeof navigator !== "undefined" ? navigator.userAgent.split(")")[0] + ")" : "Browser"}
            </p>
          </div>
          <Badge className="bg-emerald-100 text-emerald-700 border-0">Active now</Badge>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 justify-end">
          <Button variant="outline" onClick={terminateOthers}>Sign out other sessions</Button>
          <Button variant="destructive" onClick={signOut}>Sign out everywhere</Button>
        </div>
      </Card>

      <Card icon={ClipboardList} title="Activity Log" description={`${totalCount} total events recorded.`}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search events…" className="max-w-xs h-9" />
          <div className="flex flex-wrap gap-2 items-center">
            <div className="inline-flex rounded-full bg-secondary p-1 text-xs font-semibold">
              {ranges.map((r) => {
                const active = range.from === r.from && range.to === r.to;
                return (
                  <button key={r.label} onClick={() => setRange({ from: r.from, to: r.to })}
                    className={`px-3 py-1.5 rounded-full ${active ? "bg-primary text-primary-foreground shadow-sm" : "text-ink-soft hover:text-ink"}`}>
                    {r.label}
                  </button>
                );
              })}
            </div>
            <Button variant="outline" size="sm" onClick={downloadExcel}>Download Excel</Button>
          </div>
        </div>
        {isLoading ? (
          <div className="h-32 bg-secondary animate-pulse rounded-md" />
        ) : !data?.length ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No activity in this range.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {data.map((e) => <ActivityRow key={e.id} event={e} />)}
          </ul>
        )}
        {range.to !== null && totalCount > 30 && (
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>Showing {range.from + 1}–{Math.min((range.to ?? 0) + 1, totalCount)} of {totalCount}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={prev} disabled={range.from === 0}>Previous</Button>
              <Button variant="outline" size="sm" onClick={next} disabled={(range.to ?? 0) + 1 >= totalCount}>Next</Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

const EVENT_META: Record<string, { label: string; Icon: typeof LogIn; color: string }> = {
  login: { label: "Signed in", Icon: LogIn, color: "text-emerald-600" },
  password_change: { label: "Password changed", Icon: KeyRound, color: "text-amber-600" },
  "2fa_enable": { label: "2FA enabled", Icon: ShieldCheck, color: "text-emerald-600" },
  "2fa_disable": { label: "2FA disabled", Icon: ShieldAlert, color: "text-amber-600" },
  "2fa_fail": { label: "2FA failed attempt", Icon: AlertTriangle, color: "text-rose-600" },
  profile_edit: { label: "Profile updated", Icon: Edit3, color: "text-blue-600" },
  job_apply: { label: "Job application sent", Icon: FileText, color: "text-blue-600" },
  job_withdraw: { label: "Application withdrawn", Icon: FileText, color: "text-muted-foreground" },
  company_edit: { label: "Company profile updated", Icon: Edit3, color: "text-blue-600" },
  subscription_change: { label: "Subscription updated", Icon: FileText, color: "text-violet-600" },
  notification_pref: { label: "Notification preferences updated", Icon: Bell, color: "text-blue-600" },
  security_alert: { label: "Security alert", Icon: AlertTriangle, color: "text-rose-600" },
  session_terminate: { label: "Other sessions ended", Icon: ShieldCheck, color: "text-emerald-600" },
};

function ActivityRow({ event }: { event: { event_type: string; created_at: string; ip: string | null; user_agent: string | null; metadata: unknown } }) {
  const meta = EVENT_META[event.event_type] ?? { label: event.event_type, Icon: Activity, color: "text-muted-foreground" };
  const Icon = meta.Icon;
  return (
    <li className="py-3 flex items-start gap-3">
      <div className={`grid h-8 w-8 place-items-center rounded-full bg-secondary ${meta.color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink">{meta.label}</p>
        <p className="text-xs text-muted-foreground">
          {new Date(event.created_at).toLocaleString()}
          {event.ip && ` · ${event.ip}`}
          {event.user_agent && ` · ${event.user_agent.split(")")[0]})`}
        </p>
      </div>
    </li>
  );
}

/* ------------------------------ Activity log helper ------------------------------ */

async function logActivity(event_type: string, metadata: Record<string, unknown> = {}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("user_activity_log").insert({
      user_id: user.id,
      event_type,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
      metadata: metadata as never,
    });
  } catch { /* never block UI */ }
}
