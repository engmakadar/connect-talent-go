import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Megaphone, Send, Users, Building2, Mail, MessageSquare, Bell } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AdminShell } from "@/components/admin-shell";
import { supabase } from "@/integrations/supabase/client";
import { publishAnnouncement } from "@/lib/announcements.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/announcements")({
  head: () => ({ meta: [{ title: "Announcements — SahanJobs Admin" }] }),
  component: () => (
    <AdminShell pageKey="announcements" title="Announcements" subtitle="Broadcast messages to users across the platform.">
      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <ComposePanel />
        <HistoryPanel />
      </div>
    </AdminShell>
  ),
});

function ComposePanel() {
  const qc = useQueryClient();
  const publish = useServerFn(publishAnnouncement);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<"all" | "employers" | "jobseekers" | "company">("all");
  const [companyId, setCompanyId] = useState<string>("");
  const [channels, setChannels] = useState({ in_app: true, email: false, sms: false });
  const [saving, setSaving] = useState(false);

  const { data: companies } = useQuery({
    enabled: audience === "company",
    queryKey: ["companies-options"],
    queryFn: async () => (await supabase.from("companies").select("id, name").order("name")).data ?? [],
  });

  const submit = async () => {
    if (!title.trim() || !body.trim()) return toast.error("Title and message are required.");
    if (audience === "company" && !companyId) return toast.error("Select a company.");
    const enabled = (Object.entries(channels) as [keyof typeof channels, boolean][])
      .filter(([, v]) => v).map(([k]) => k);
    if (!enabled.length) return toast.error("Pick at least one delivery channel.");
    setSaving(true);
    try {
      const res = await publish({ data: {
        title, body, audience,
        company_id: audience === "company" ? companyId : null,
        channels: enabled,
      }});
      toast.success(`Sent to ${res.recipients} ${res.recipients === 1 ? "user" : "users"}.`);
      setTitle(""); setBody("");
      qc.invalidateQueries({ queryKey: ["announcements"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to publish");
    } finally { setSaving(false); }
  };

  return (
    <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-sm p-6 h-fit">
      <div className="flex items-center gap-2 mb-5">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Megaphone className="h-5 w-5" /></div>
        <h2 className="font-display text-lg font-bold text-ink">New announcement</h2>
      </div>
      <div className="space-y-4">
        <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. New feature release" /></div>
        <div><Label>Message</Label><Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message…" /></div>
        <div>
          <Label>Audience</Label>
          <Select value={audience} onValueChange={(v) => setAudience(v as never)}>
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all"><Users className="h-3.5 w-3.5 inline mr-1.5" />Everyone</SelectItem>
              <SelectItem value="employers"><Building2 className="h-3.5 w-3.5 inline mr-1.5" />Employers</SelectItem>
              <SelectItem value="jobseekers"><Users className="h-3.5 w-3.5 inline mr-1.5" />Jobseekers</SelectItem>
              <SelectItem value="company"><Building2 className="h-3.5 w-3.5 inline mr-1.5" />Specific company</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {audience === "company" && (
          <div>
            <Label>Company</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {(companies ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="rounded-lg border border-border p-3 space-y-2.5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Delivery channels</Label>
          <ChannelToggle label="In-app notification" icon={Bell} checked={channels.in_app} onChange={(v) => setChannels({ ...channels, in_app: v })} />
          <ChannelToggle label="Email broadcast" icon={Mail} checked={channels.email} onChange={(v) => setChannels({ ...channels, email: v })} hint="Queued for delivery" />
          <ChannelToggle label="SMS notification" icon={MessageSquare} checked={channels.sms} onChange={(v) => setChannels({ ...channels, sms: v })} hint="Queued for delivery" />
        </div>
        <Button onClick={submit} disabled={saving} className="w-full h-11"><Send className="h-4 w-4" /> {saving ? "Sending…" : "Publish"}</Button>
      </div>
    </div>
  );
}

function ChannelToggle({ label, icon: Icon, checked, onChange, hint }: { label: string; icon: typeof Mail; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <div>
          <p className="text-sm text-ink">{label}</p>
          {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function HistoryPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["announcements"],
    queryFn: async () => {
      const { data } = await supabase
        .from("announcements")
        .select("id, title, body, audience, channels, company_id, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  return (
    <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-black/5">
        <h2 className="font-display font-bold text-ink">Recent announcements</h2>
      </div>
      {isLoading ? (
        <div className="h-40 bg-secondary animate-pulse" />
      ) : !data?.length ? (
        <div className="py-16 text-center"><Megaphone className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" /><p className="text-muted-foreground text-sm">No announcements yet.</p></div>
      ) : (
        <ul className="divide-y divide-black/5 max-h-[640px] overflow-y-auto">
          {data.map((a) => (
            <li key={a.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{a.title}</p>
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{a.body}</p>
                </div>
                <Badge variant="outline" className="text-[10px] capitalize shrink-0">{a.audience}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(a.channels as string[] ?? []).map((c) => (
                  <Badge key={c} className="bg-secondary text-ink-soft border-0 text-[10px]">{c.replace("_", "-")}</Badge>
                ))}
                <span className="text-[10px] text-muted-foreground ml-auto">{new Date(a.created_at).toLocaleString()}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
