import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Building2, Plus, Globe, Mail, Phone, MapPin, Upload, Pencil, Trash2, BadgeCheck, Clock, X, UsersRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/companies")({
  head: () => ({ meta: [{ title: "Employers — SahanJobs Admin" }] }),
  component: () => (
    <AdminShell
      pageKey="employers"
      title="Employers / Companies"
      subtitle="All enrolled organizations. Verify, assign subscription plans, manage logos."
      actions={<CompanyDialog mode="create" />}
    >
      <CompaniesTable />
    </AdminShell>
  ),
});

type Company = {
  id: string;
  name: string;
  logo_url: string | null;
  website: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  location: string | null;
  description: string | null;
  verification_status: "pending" | "verified" | "rejected";
  subscription_plan: string | null;
  created_at: string;
};

const PLANS = ["Free", "Starter", "Business", "Enterprise"];

function CompaniesTable() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-companies-with-teams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (data ?? []).map((c) => c.id);
      const teamsMap = new Map<string, { id: string; name: string; member_count: number }[]>();
      const memberByCompany = new Map<string, number>();
      if (ids.length) {
        const { data: teams } = await supabase.from("company_teams").select("id, name, company_id").in("company_id", ids);
        const { data: members } = await supabase.from("company_team_members").select("team_id");
        const counts = new Map<string, number>();
        (members ?? []).forEach((m) => counts.set(m.team_id, (counts.get(m.team_id) ?? 0) + 1));
        (teams ?? []).forEach((t) => {
          const arr = teamsMap.get(t.company_id) ?? [];
          const mc = counts.get(t.id) ?? 0;
          arr.push({ id: t.id, name: t.name, member_count: mc });
          teamsMap.set(t.company_id, arr);
          memberByCompany.set(t.company_id, (memberByCompany.get(t.company_id) ?? 0) + mc);
        });
        // Also count company members via profiles.company_id (covers users not in any team)
        const { data: profs } = await supabase.from("profiles").select("company_id").in("company_id", ids);
        const profCounts = new Map<string, number>();
        (profs ?? []).forEach((p) => p.company_id && profCounts.set(p.company_id, (profCounts.get(p.company_id) ?? 0) + 1));
        profCounts.forEach((v, k) => memberByCompany.set(k, Math.max(memberByCompany.get(k) ?? 0, v)));
      }
      return (data as Company[]).map((c) => ({
        ...c,
        teams: teamsMap.get(c.id) ?? [],
        member_total: memberByCompany.get(c.id) ?? 0,
      }));
    },
  });

  const setStatus = async (id: string, status: Company["verification_status"]) => {
    const { error } = await supabase.from("companies").update({
      verification_status: status,
      verified_at: status === "verified" ? new Date().toISOString() : null,
    }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Company ${status}.`);
    qc.invalidateQueries({ queryKey: ["admin-companies-with-teams"] });
  };

  const setPlan = async (id: string, plan: string) => {
    const { error } = await supabase.from("companies").update({ subscription_plan: plan }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Plan updated.");
    qc.invalidateQueries({ queryKey: ["admin-companies-with-teams"] });
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this company?")) return;
    const { error } = await supabase.from("companies").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Company removed.");
    qc.invalidateQueries({ queryKey: ["admin-companies-with-teams"] });
  };

  if (isLoading) return <div className="h-40 rounded-2xl bg-white animate-pulse ring-1 ring-black/5" />;
  if (!data?.length)
    return (
      <div className="rounded-2xl bg-white p-16 text-center ring-1 ring-black/5">
        <Building2 className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground mb-4">No companies enrolled yet.</p>
        <CompanyDialog mode="create" />
      </div>
    );

  return (
    <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-secondary/50">
            <tr className="text-left">
              <th className="px-5 py-3 font-semibold">Company</th>
              <th className="px-5 py-3 font-semibold">Contact</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold">Plan</th>
              <th className="px-5 py-3 font-semibold">Members</th>
              <th className="px-5 py-3 font-semibold">Team</th>
              <th className="px-5 py-3 font-semibold">Enrolled</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {data.map((c) => (
              <tr key={c.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/30 align-top">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    {c.logo_url ? (
                      <img src={c.logo_url} alt="" className="h-11 w-11 rounded-lg object-cover ring-1 ring-black/5" />
                    ) : (
                      <div className="h-11 w-11 rounded-lg bg-primary/10 text-primary grid place-items-center font-bold">
                        {c.name[0]?.toUpperCase()}
                      </div>
                    )}
                    <div>
                      <a href={`/admin/companies/${c.id}`} className="font-semibold text-ink hover:text-primary">{c.name}</a>
                      {c.website && (
                        <a href={c.website} target="_blank" rel="noreferrer" className="block text-xs text-primary inline-flex items-center gap-1">
                          <Globe className="h-3 w-3" /> {c.website.replace(/^https?:\/\//, "")}
                        </a>
                      )}
                      {c.location && <p className="text-xs text-muted-foreground inline-flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3" />{c.location}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4 text-muted-foreground text-xs">
                  {c.contact_email && <div className="flex items-center gap-1"><Mail className="h-3 w-3" /> {c.contact_email}</div>}
                  {c.contact_phone && <div className="flex items-center gap-1 mt-1"><Phone className="h-3 w-3" /> {c.contact_phone}</div>}
                </td>
                <td className="px-5 py-4">
                  <StatusBadge status={c.verification_status} />
                  <div className="flex gap-1 mt-2">
                    {c.verification_status !== "verified" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setStatus(c.id, "verified")}>
                        <BadgeCheck className="h-3 w-3" /> Verify
                      </Button>
                    )}
                    {c.verification_status !== "rejected" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" onClick={() => setStatus(c.id, "rejected")}>
                        <X className="h-3 w-3" /> Reject
                      </Button>
                    )}
                  </div>
                </td>
                <td className="px-5 py-4">
                  <Select value={c.subscription_plan ?? "Free"} onValueChange={(v) => setPlan(c.id, v)}>
                    <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PLANS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-5 py-4 text-sm font-semibold text-ink">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs">
                    <UsersRound className="h-3 w-3" />
                    {(c as Company & { member_total: number }).member_total}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <TeamsCell companyId={c.id} teams={(c as Company & { teams: { id: string; name: string; member_count: number }[] }).teams} />
                </td>
                <td className="px-5 py-4 text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</td>
                <td className="px-5 py-4 text-right">
                  <div className="inline-flex gap-1">
                    <CompanyDialog mode="edit" company={c} />
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(c.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Company["verification_status"] }) {
  if (status === "verified") return <Badge className="bg-primary/10 text-primary border-0"><BadgeCheck className="h-3 w-3" /> Verified</Badge>;
  if (status === "rejected") return <Badge variant="destructive"><X className="h-3 w-3" /> Rejected</Badge>;
  return <Badge variant="secondary"><Clock className="h-3 w-3" /> Pending</Badge>;
}

function CompanyDialog({ mode, company }: { mode: "create" | "edit"; company?: Company }) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(company?.logo_url ?? null);
  const [form, setForm] = useState({
    name: company?.name ?? "",
    website: company?.website ?? "",
    contact_email: company?.contact_email ?? "",
    contact_phone: company?.contact_phone ?? "",
    location: company?.location ?? "",
    description: company?.description ?? "",
    logo_url: company?.logo_url ?? "",
    subscription_plan: company?.subscription_plan ?? "Free",
  });

  const onLogo = async (file: File) => {
    const ext = file.name.split(".").pop() || "png";
    const path = `${user?.id ?? "anon"}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("company-logos").upload(path, file, { upsert: true });
    if (error) return toast.error(error.message);
    const { data } = supabase.storage.from("company-logos").getPublicUrl(path);
    setForm((f) => ({ ...f, logo_url: data.publicUrl }));
    setLogoPreview(data.publicUrl);
    toast.success("Logo uploaded.");
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Company name is required.");
    setSaving(true);
    try {
      if (mode === "create") {
        const { error } = await supabase.from("companies").insert({ ...form, created_by: user?.id, verification_status: "verified" });
        if (error) throw error;
        toast.success("Company enrolled.");
      } else if (company) {
        const { error } = await supabase.from("companies").update(form).eq("id", company.id);
        if (error) throw error;
        toast.success("Company updated.");
      }
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-companies-with-teams"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button className="rounded-full bg-primary hover:bg-primary/90"><Plus className="h-4 w-4" /> Enroll company</Button>
        ) : (
          <Button variant="ghost" size="icon" className="h-8 w-8"><Pencil className="h-4 w-4" /></Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Enroll new company" : "Edit company"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Logo</Label>
            <div className="mt-1.5 flex items-center gap-4">
              <div className="h-16 w-16 rounded-lg ring-1 ring-black/5 bg-secondary grid place-items-center overflow-hidden">
                {logoPreview ? <img src={logoPreview} className="h-full w-full object-cover" alt="" /> : <Building2 className="h-6 w-6 text-muted-foreground" />}
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer rounded-full bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80">
                <Upload className="h-4 w-4" /> Upload
                <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onLogo(e.target.files[0])} />
              </label>
            </div>
          </div>
          <div><Label>Company name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Website</Label><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://..." /></div>
            <div><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
            <div><Label>Contact email</Label><Input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></div>
            <div><Label>Contact phone</Label><Input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} /></div>
          </div>
          <div>
            <Label>Subscription plan</Label>
            <Select value={form.subscription_plan} onValueChange={(v) => setForm({ ...form, subscription_plan: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PLANS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Description</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TeamsCell({ companyId, teams }: { companyId: string; teams: { id: string; name: string; member_count: number }[] }) {
  if (!teams.length) {
    return (
      <Link to="/admin/companies/$companyId" params={{ companyId }} className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1">
        <UsersRound className="h-3 w-3" /> No teams · Add
      </Link>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5 max-w-[260px]">
      {teams.slice(0, 4).map((t) => (
        <Link key={t.id} to="/admin/companies/$companyId" params={{ companyId }}
          className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-medium hover:bg-primary/20">
          <UsersRound className="h-3 w-3" /> {t.name}
          <span className="text-primary/70">·{t.member_count}</span>
        </Link>
      ))}
      {teams.length > 4 && (
        <Link to="/admin/companies/$companyId" params={{ companyId }} className="text-[11px] text-muted-foreground hover:text-primary">+{teams.length - 4} more</Link>
      )}
    </div>
  );
}
