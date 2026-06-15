import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Users, Plus, Search, MoreHorizontal, Ban, PowerOff, Trash2, Pencil, Mail, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { CompanyLogo } from "@/components/company-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  inviteCompanyUser, updateCompanyUser, suspendCompanyUser, deleteCompanyUser,
  setCompanyUserPassword, sendCompanyUserReset,
} from "@/lib/company-users.functions";

export const Route = createFileRoute("/company/users")({
  head: () => ({ meta: [{ title: "Team users — SahanJobs" }] }),
  component: CompanyUsersPage,
});

type Row = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  suspended: boolean;
  deactivated: boolean;
  created_at: string;
  role: "owner" | "manager" | "recruiter" | "viewer" | null;
  team_id: string | null;
  team_name: string | null;
};

function CompanyUsersPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const { data: prof, isLoading: profLoading } = useQuery({
    enabled: !!user,
    queryKey: ["my-company", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("company_id, full_name").eq("id", user!.id).maybeSingle();
      if (!data?.company_id) return null;
      const { data: c } = await supabase.from("companies").select("id, name, logo_url").eq("id", data.company_id).maybeSingle();
      return { company: c, name: data.full_name };
    },
  });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  if (loading || profLoading) {
    return <Shell><div className="py-20 text-center text-sm text-muted-foreground">Loading…</div></Shell>;
  }
  if (!prof?.company) {
    return (
      <Shell>
        <div className="py-20 text-center">
          <Users className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <h2 className="font-display text-xl font-bold text-ink">No company assigned</h2>
          <p className="text-sm text-muted-foreground mt-1">Your account isn't linked to a company yet. Contact your administrator.</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-3">
          <CompanyLogo company={prof.company.name} logoUrl={prof.company.logo_url} size={44} className="h-11 w-11" />
          <div>
            <h1 className="font-display text-2xl font-bold text-ink">Team users</h1>
            <p className="text-sm text-muted-foreground">Manage your company's internal users.</p>
          </div>
        </div>
        <InviteDialog companyId={prof.company.id} />
      </div>
      <UsersTable companyId={prof.company.id} company={prof.company} />
    </Shell>
  );
}


function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-hero-band/40">
      <SiteHeader />
      <section className="mx-auto w-full max-w-6xl px-4 md:px-8 py-10 flex-1">{children}</section>
      <SiteFooter />
    </div>
  );
}

function UsersTable({ companyId, company }: { companyId: string; company: { id: string; name: string; logo_url: string | null } }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended" | "deactivated">("all");
  const suspend = useServerFn(suspendCompanyUser);
  const del = useServerFn(deleteCompanyUser);

  const { data, isLoading } = useQuery({
    queryKey: ["company-users", companyId],
    queryFn: async (): Promise<Row[]> => {
      const [profs, roles, members] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, phone, suspended, deactivated, created_at").eq("company_id", companyId).order("created_at", { ascending: false }),
        supabase.from("company_member_roles").select("user_id, role").eq("company_id", companyId),
        supabase.from("company_team_members").select("user_id, team:company_teams!inner(id, name, company_id)").eq("team.company_id", companyId),
      ]);
      const roleByUser = new Map<string, Row["role"]>();
      (roles.data ?? []).forEach((r: any) => roleByUser.set(r.user_id, r.role));
      const teamByUser = new Map<string, { id: string; name: string }>();
      ((members.data ?? []) as any[]).forEach((m) => teamByUser.set(m.user_id, m.team));
      return (profs.data ?? []).map((p) => ({
        ...p,
        role: roleByUser.get(p.id) ?? null,
        team_id: teamByUser.get(p.id)?.id ?? null,
        team_name: teamByUser.get(p.id)?.name ?? null,
      }));
    },
  });

  const filtered = useMemo(() => {
    let out = data ?? [];
    if (statusFilter === "active") out = out.filter((r) => !r.suspended && !r.deactivated);
    if (statusFilter === "suspended") out = out.filter((r) => r.suspended);
    if (statusFilter === "deactivated") out = out.filter((r) => r.deactivated);
    const t = q.trim().toLowerCase();
    if (!t) return out;
    return out.filter((r) =>
      (r.full_name || "").toLowerCase().includes(t) ||
      (r.email || "").toLowerCase().includes(t) ||
      (r.team_name || "").toLowerCase().includes(t)
    );
  }, [data, statusFilter, q]);

  const onSuspend = async (r: Row, suspended: boolean) => {
    try { await suspend({ data: { company_id: companyId, user_id: r.id, suspended } }); toast.success("Updated."); qc.invalidateQueries({ queryKey: ["company-users", companyId] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };
  const onDeactivate = async (r: Row, deactivated: boolean) => {
    try { await suspend({ data: { company_id: companyId, user_id: r.id, deactivated } }); toast.success("Updated."); qc.invalidateQueries({ queryKey: ["company-users", companyId] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };
  const onDelete = async (r: Row) => {
    if (!confirm(`Permanently delete ${r.full_name || r.email}? This cannot be undone.`)) return;
    try { await del({ data: { company_id: companyId, user_id: r.id } }); toast.success("User deleted."); qc.invalidateQueries({ queryKey: ["company-users", companyId] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or team…" className="pl-9 h-11 bg-white" />
        </div>
        <div className="inline-flex rounded-full bg-secondary p-1 text-xs font-semibold">
          {(["all", "active", "suspended", "deactivated"] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-full capitalize ${statusFilter === s ? "bg-primary text-primary-foreground shadow-sm" : "text-ink-soft hover:text-ink"}`}>{s}</button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-sm overflow-hidden">
        {isLoading ? <div className="h-40 bg-secondary animate-pulse" />
          : !filtered.length ? <div className="py-16 text-center"><Users className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" /><p className="text-sm text-muted-foreground">No users.</p></div>
          : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-secondary/50">
                <tr className="text-left">
                  <th className="px-5 py-3 font-semibold">Name</th>
                  <th className="px-5 py-3 font-semibold">Role</th>
                  <th className="px-5 py-3 font-semibold">Team</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/30">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <CompanyLogo company={company.name} logoUrl={company.logo_url} size={32} className="h-8 w-8 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-ink truncate">{r.full_name || "—"}</p>
                          <p className="text-xs text-muted-foreground inline-flex items-center gap-1 truncate"><Mail className="h-3 w-3" />{r.email}</p>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4"><Badge variant="outline" className="capitalize text-[10px]">{r.role ?? "—"}</Badge></td>
                    <td className="px-5 py-4 text-muted-foreground text-xs">{r.team_name || "—"}</td>
                    <td className="px-5 py-4">
                      {r.deactivated ? <Badge variant="destructive">Deactivated</Badge>
                       : r.suspended ? <Badge className="bg-amber-100 text-amber-800 border-0">Suspended</Badge>
                       : <Badge className="bg-emerald-100 text-emerald-700 border-0">Active</Badge>}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <EditDialog companyId={companyId} row={r} />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onSuspend(r, !r.suspended)}><Ban className="mr-2 h-4 w-4" /> {r.suspended ? "Unsuspend" : "Suspend"}</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onDeactivate(r, !r.deactivated)}><PowerOff className="mr-2 h-4 w-4" /> {r.deactivated ? "Reactivate" : "Deactivate"}</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <CompanyPasswordItems companyId={companyId} row={r} />
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => onDelete(r)}><Trash2 className="mr-2 h-4 w-4" /> Delete user</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function InviteDialog({ companyId }: { companyId: string }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", phone: "", role: "recruiter" as "manager" | "recruiter" | "viewer", team_id: "", password: "" });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ tempPassword: string | null } | null>(null);
  const invite = useServerFn(inviteCompanyUser);
  const qc = useQueryClient();

  const { data: teams } = useQuery({
    enabled: open,
    queryKey: ["company-teams", companyId],
    queryFn: async () => (await supabase.from("company_teams").select("id, name").eq("company_id", companyId).order("name")).data ?? [],
  });

  const submit = async () => {
    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim()) return toast.error("First name, last name, email are required.");
    setSaving(true);
    try {
      const res = await invite({ data: {
        company_id: companyId,
        first_name: form.first_name, last_name: form.last_name, email: form.email, phone: form.phone,
        role: form.role,
        team_id: form.team_id || null,
        password: form.password || undefined,
      } });
      toast.success("User invited.");
      setResult({ tempPassword: res.tempPassword });
      qc.invalidateQueries({ queryKey: ["company-users", companyId] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  };

  const close = () => { setForm({ first_name: "", last_name: "", email: "", phone: "", role: "recruiter", team_id: "", password: "" }); setResult(null); setOpen(false); };

  return (
    <Dialog open={open} onOpenChange={(v) => v ? setOpen(true) : close()}>
      <DialogTrigger asChild><Button className="rounded-full bg-primary hover:bg-primary/90"><Plus className="h-4 w-4 mr-1" /> Add user</Button></DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{result ? "User invited" : "Add team user"}</DialogTitle></DialogHeader>
        {result ? (
          <div className="space-y-3">
            <p className="text-sm">Share these credentials with the new user:</p>
            <div className="rounded-lg bg-secondary p-3 text-sm">
              <p><span className="font-semibold">Email:</span> {form.email}</p>
              {result.tempPassword && <p><span className="font-semibold">Temp password:</span> <code className="font-mono">{result.tempPassword}</code></p>}
              {!result.tempPassword && <p className="text-muted-foreground">Password was set as provided.</p>}
            </div>
            <DialogFooter><Button onClick={close}>Done</Button></DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>First name *</Label><Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
                <div><Label>Last name *</Label><Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
              </div>
              <div><Label>Email *</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div>
                  <Label>Role</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as never })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="recruiter">Recruiter</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Team (optional)</Label>
                <Select value={form.team_id || "none"} onValueChange={(v) => setForm({ ...form, team_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="No team" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No team</SelectItem>
                    {(teams ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Password (optional)</Label>
                <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Leave blank to auto-generate" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={close}>Cancel</Button>
              <Button onClick={submit} disabled={saving}>{saving ? "Inviting…" : "Invite user"}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ companyId, row }: { companyId: string; row: Row }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    first_name: row.full_name?.split(" ")[0] ?? "",
    last_name: row.full_name?.split(" ").slice(1).join(" ") ?? "",
    phone: row.phone ?? "",
    role: (row.role ?? "recruiter") as "manager" | "recruiter" | "viewer",
    team_id: row.team_id ?? "",
  });
  const [saving, setSaving] = useState(false);
  const update = useServerFn(updateCompanyUser);
  const qc = useQueryClient();

  const { data: teams } = useQuery({
    enabled: open,
    queryKey: ["company-teams", companyId],
    queryFn: async () => (await supabase.from("company_teams").select("id, name").eq("company_id", companyId).order("name")).data ?? [],
  });

  const save = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) return toast.error("Name required.");
    setSaving(true);
    try {
      await update({ data: {
        company_id: companyId, user_id: row.id,
        first_name: form.first_name, last_name: form.last_name, phone: form.phone,
        role: form.role,
        team_id: form.team_id || null,
      } });
      toast.success("User updated.");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["company-users", companyId] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><Pencil className="h-4 w-4" /></Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit user</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>First name</Label><Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
            <div><Label>Last name</Label><Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div>
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as never })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="recruiter">Recruiter</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Team</Label>
            <Select value={form.team_id || "none"} onValueChange={(v) => setForm({ ...form, team_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="No team" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No team</SelectItem>
                {(teams ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompanyPasswordItems({ companyId, row }: { companyId: string; row: Row }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const setPass = useServerFn(setCompanyUserPassword);
  const sendReset = useServerFn(sendCompanyUserReset);

  const submitSet = async () => {
    if (pw.length < 8) return toast.error("Min 8 chars.");
    setSaving(true);
    try {
      await setPass({ data: { company_id: companyId, user_id: row.id, password: pw } });
      toast.success("Password updated.");
      setOpen(false); setPw("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  };

  const sendLink = async () => {
    try {
      const res = await sendReset({ data: { company_id: companyId, user_id: row.id } });
      if (res.actionLink) { setLink(res.actionLink); toast.success("Reset link generated."); }
      else toast.success("Reset email sent.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  return (
    <>
      <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setOpen(true); }}>
        <KeyRound className="mr-2 h-4 w-4" /> Set new password
      </DropdownMenuItem>
      <DropdownMenuItem onClick={sendLink}>
        <Mail className="mr-2 h-4 w-4" /> Send reset email
      </DropdownMenuItem>
      <Dialog open={open || !!link} onOpenChange={(v) => { if (!v) { setOpen(false); setLink(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{link ? "Password reset link" : `Set password${row.email ? ` for ${row.email}` : ""}`}</DialogTitle></DialogHeader>
          {link ? (
            <div className="space-y-3">
              <p className="text-sm">Share this one-time link with the user (expires shortly):</p>
              <Input readOnly value={link} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <DialogFooter><Button onClick={() => setLink(null)}>Done</Button></DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <div><Label>New password</Label><Input type="text" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Min 8 characters" /></div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={submitSet} disabled={saving || pw.length < 8}>{saving ? "Saving…" : "Set password"}</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
