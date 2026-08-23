import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CompanyLogo } from "@/components/company-logo";
import { Users, Pencil, Search, MoreHorizontal, Ban, PowerOff, Power, Building2, Trash2, CheckCircle2, Users2, Mail } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import { useServerFn } from "@tanstack/react-start";
import { activateUser } from "@/lib/admin-actions.functions";
import { sendPasswordReset } from "@/lib/admin-password.functions";
import { addExistingUserToCompanyTeam } from "@/lib/company-users.functions";


export const Route = createFileRoute("/admin/users")({
  head: () => ({ meta: [{ title: "All Users — SahanJobs Admin" }] }),
  component: AdminUsers,
});

type Company = { id: string; name: string; logo_url: string | null };
type Sub = { plan: string; active: boolean };

type Row = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  username: string | null;
  email: string | null;
  location: string | null;
  headline: string | null;
  suspended: boolean;
  deactivated: boolean;
  email_verified: boolean;
  pending_approval: boolean;
  company_id: string | null;
  created_at: string;
  last_login_at: string | null;
  roles: string[];
  company: Company | null;
  subscription_plan: string | null;
  team_count: number;
  team_id: string | null;
  team_name: string | null;
};



type RoleFilter = "all" | "employer" | "jobseeker";

function AdminUsers() {
  return (
    <AdminShell
      pageKey="all_users"
      title="All Users"
      subtitle="Complete directory of platform users. Team enrollment happens in each company's Enrollment page."
    >
      <UsersTable />
    </AdminShell>
  );
}

function UsersTable() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const activate = useServerFn(activateUser);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-users-full"],
    queryFn: async (): Promise<Row[]> => {
      const [profilesRes, rolesRes, companiesRes, subsRes, teamMembersRes] = await Promise.all([
        supabase.from("profiles")
          .select("id, full_name, first_name, last_name, phone, username, email, location, headline, suspended, deactivated, email_verified, pending_approval, company_id, created_at, last_login_at")
          .order("created_at", { ascending: false }),

        supabase.from("user_roles").select("user_id, role"),
        supabase.from("companies").select("id, name, logo_url"),
        supabase.from("subscriptions").select("company_id, plan, active"),
        supabase.from("company_team_members").select("user_id, team_id, team:company_teams!inner(id, name, company_id)"),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (rolesRes.error) throw rolesRes.error;

      const rolesByUser = new Map<string, string[]>();
      rolesRes.data?.forEach((r) => {
        const arr = rolesByUser.get(r.user_id) ?? [];
        arr.push(r.role);
        rolesByUser.set(r.user_id, arr);
      });
      const companyById = new Map<string, Company>();
      (companiesRes.data ?? []).forEach((c) => companyById.set(c.id, c));
      const subByCompany = new Map<string, Sub>();
      (subsRes.data ?? []).forEach((s) => {
        if (!s.company_id) return;
        if (!subByCompany.has(s.company_id) || s.active) subByCompany.set(s.company_id, { plan: s.plan, active: s.active });
      });
      const teamByCompany = new Map<string, number>();
      (profilesRes.data ?? []).forEach((p) => {
        if (p.company_id) teamByCompany.set(p.company_id, (teamByCompany.get(p.company_id) ?? 0) + 1);
      });
      const teamByUser = new Map<string, { id: string; name: string }>();
      (teamMembersRes.data ?? []).forEach((tm: any) => {
        if (tm.team) teamByUser.set(tm.user_id, { id: tm.team.id, name: tm.team.name });
      });

      return (profilesRes.data ?? []).map((p): Row => {
        const company = p.company_id ? companyById.get(p.company_id) ?? null : null;
        const isEmployer = (rolesByUser.get(p.id) ?? []).includes("employer");
        const sub = company ? subByCompany.get(company.id) ?? null : null;
        const t = teamByUser.get(p.id) ?? null;
        return {
          ...p,
          roles: rolesByUser.get(p.id) ?? [],
          company,
          subscription_plan: isEmployer && sub ? sub.plan : null,
          team_count: company ? teamByCompany.get(company.id) ?? 0 : 0,
          team_id: t?.id ?? null,
          team_name: t?.name ?? null,
        };
      });
    },
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    let out = rows ?? [];
    if (roleFilter !== "all") out = out.filter((r) => r.roles.includes(roleFilter));
    const t = q.trim().toLowerCase();
    if (!t) return out;
    return out.filter((r) =>
      (r.full_name || "").toLowerCase().includes(t) ||
      (r.username || "").toLowerCase().includes(t) ||
      (r.email || "").toLowerCase().includes(t) ||
      (r.location || "").toLowerCase().includes(t) ||
      (r.company?.name || "").toLowerCase().includes(t),
    );
  }, [rows, q, roleFilter]);

  const setSuspended = async (id: string, suspended: boolean) => {
    const { error } = await supabase.from("profiles").update({ suspended }).eq("id", id);
    if (error) return toast.error(error.message);
    await logAudit({ action: suspended ? "user.suspend" : "user.unsuspend", resource_type: "user", resource_id: id });
    toast.success(suspended ? "User suspended." : "User reactivated.");
    qc.invalidateQueries({ queryKey: ["admin-users-full"] });
  };

  const setDeactivated = async (id: string, deactivated: boolean) => {
    const { error } = await supabase.from("profiles").update({ deactivated }).eq("id", id);
    if (error) return toast.error(error.message);
    await logAudit({ action: "user.deactivate", resource_type: "user", resource_id: id, metadata: { deactivated } });
    toast.success(deactivated ? "Account deactivated." : "Account restored.");
    qc.invalidateQueries({ queryKey: ["admin-users-full"] });
  };

  const removeUser = async (id: string) => {
    if (id === user?.id) return toast.error("You cannot remove yourself.");
    if (!confirm("Permanently deactivate and remove this user's profile data? This cannot be undone from the panel.")) return;
    const { error } = await supabase.from("profiles").update({ deactivated: true, suspended: true }).eq("id", id);
    if (error) return toast.error(error.message);
    await supabase.from("user_roles").delete().eq("user_id", id);
    await logAudit({ action: "user.deactivate", resource_type: "user", resource_id: id, metadata: { hard: true } });
    toast.success("User removed.");
    qc.invalidateQueries({ queryKey: ["admin-users-full"] });
  };

  const activateNow = async (id: string) => {
    try {
      await activate({ data: { userId: id } });
      await logAudit({ action: "user.profile_update", resource_type: "user", resource_id: id, metadata: { activated: true } });
      toast.success("Account activated.");
      qc.invalidateQueries({ queryKey: ["admin-users-full"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to activate");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by username, name, email, company or location…" className="pl-9 h-11 bg-white" />
        </div>
        <div className="inline-flex rounded-full bg-secondary p-1 text-xs font-semibold">
          {(["all", "employer", "jobseeker"] as const).map((r) => (
            <button key={r} onClick={() => setRoleFilter(r)}
              className={`px-3 py-1.5 rounded-full transition capitalize ${roleFilter === r ? "bg-primary text-primary-foreground shadow-sm" : "text-ink-soft hover:text-ink"}`}>
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="h-40 bg-secondary animate-pulse" />
        ) : !filtered?.length ? (
          <div className="py-12 text-center"><Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground" /><p className="text-muted-foreground">No users.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-secondary/50">
                <tr className="text-left">
                  <th className="px-5 py-3 font-semibold">User</th>
                  <th className="px-5 py-3 font-semibold">Username</th>
                  <th className="px-5 py-3 font-semibold">Role</th>
                  <th className="px-5 py-3 font-semibold">Company</th>
                  <th className="px-5 py-3 font-semibold">Location</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Plan</th>
                  <th className="px-5 py-3 font-semibold">Joined</th>
                  <th className="px-5 py-3 font-semibold">Last Login</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/30 align-middle">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary font-semibold text-xs">
                          {(r.full_name?.[0] ?? r.email?.[0] ?? "?").toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{r.full_name || "—"}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[220px]" title={r.id}>{r.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground font-mono text-xs">@{r.username || "—"}</td>
                    <td className="px-5 py-4"><RoleBadges roles={r.roles} /></td>
                    <td className="px-5 py-4">
                      {r.company ? (
                        <div className="flex items-center gap-2 min-w-0">
                          <CompanyLogo company={r.company.name} logoUrl={r.company.logo_url} size={28} className="h-7 w-7 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate max-w-[180px]">{r.company.name}</p>
                            <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[180px]" title={r.company.id}>{r.company.id.slice(0, 8)}…</p>
                          </div>
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{r.location || "—"}</td>
                    <td className="px-5 py-4"><StatusBadge row={r} /></td>
                    <td className="px-5 py-4">
                      {r.subscription_plan ? (
                        <Badge variant="outline" className="capitalize text-[10px]">{r.subscription_plan}</Badge>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-5 py-4 text-muted-foreground whitespace-nowrap text-xs">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-4 text-muted-foreground whitespace-nowrap text-xs">
                      {r.last_login_at ? new Date(r.last_login_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—"}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <EditUserDialog row={r} onSaved={() => qc.invalidateQueries({ queryKey: ["admin-users-full"] })} />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {r.company && (
                              <DropdownMenuItem asChild>
                                <a href={`/admin/companies`}><Building2 className="mr-2 h-4 w-4" /> View company</a>
                              </DropdownMenuItem>
                            )}
                            {r.pending_approval && (
                              <DropdownMenuItem onClick={() => activateNow(r.id)}>
                                <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" /> Approve account
                              </DropdownMenuItem>
                            )}
                            {!r.pending_approval && !r.email_verified && (
                              <DropdownMenuItem onClick={() => activateNow(r.id)}>
                                <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" /> Activate account
                              </DropdownMenuItem>
                            )}

                            <DropdownMenuItem onClick={() => setSuspended(r.id, !r.suspended)} disabled={r.id === user?.id}>
                              <Ban className="mr-2 h-4 w-4" /> {r.suspended ? "Unsuspend" : "Suspend"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setDeactivated(r.id, !r.deactivated)} disabled={r.id === user?.id}>
                              {r.deactivated ? <Power className="mr-2 h-4 w-4" /> : <PowerOff className="mr-2 h-4 w-4" />}
                              {r.deactivated ? "Reactivate" : "Deactivate"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <AddToCompanyTeamItem userId={r.id} currentCompanyId={r.company_id} onChanged={() => qc.invalidateQueries({ queryKey: ["admin-users-full"] })} />
                            <DropdownMenuSeparator />
                            <PasswordResetMenuItems userId={r.id} email={r.email} />
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => removeUser(r.id)} disabled={r.id === user?.id}>
                              <Trash2 className="mr-2 h-4 w-4" /> Remove
                            </DropdownMenuItem>
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

function RoleBadges({ roles }: { roles: string[] }) {
  if (!roles.length) return <span className="text-muted-foreground text-xs">—</span>;
  const map: Record<string, { label: string; cls: string }> = {
    admin: { label: "Super Admin", cls: "bg-violet-100 text-violet-800" },
    employer: { label: "Employer", cls: "bg-sky-100 text-sky-800" },
    jobseeker: { label: "Jobseeker", cls: "bg-emerald-100 text-emerald-800" },
  };
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((r) => {
        const m = map[r] ?? { label: r, cls: "bg-secondary text-ink" };
        return <Badge key={r} className={`${m.cls} border-0 text-[10px]`}>{m.label}</Badge>;
      })}
    </div>
  );
}

function StatusBadge({ row }: { row: Row }) {
  if (row.deactivated) return <Badge variant="destructive" className="text-[10px]">Deactivated</Badge>;
  if (row.suspended) return <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px]">Suspended</Badge>;
  if (row.pending_approval) return <Badge className="bg-orange-100 text-orange-800 border-0 text-[10px]">Pending approval</Badge>;
  if (!row.email_verified) return <Badge className="bg-slate-100 text-slate-700 border-0 text-[10px]">Awaiting activation</Badge>;
  if (!row.last_login_at) return <Badge className="bg-blue-100 text-blue-800 border-0 text-[10px]">Activated</Badge>;
  return <Badge className="bg-emerald-100 text-emerald-800 border-0 text-[10px]">Active</Badge>;
}


function EditUserDialog({ row, onSaved }: { row: Row; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    first_name: row.first_name ?? "",
    last_name: row.last_name ?? "",
    phone: row.phone ?? "",
    location: row.location ?? "",
    headline: row.headline ?? "",
    company_id: row.company_id ?? "",
    team_id: row.team_id ?? "",
    company_role: "recruiter" as "owner" | "manager" | "recruiter" | "viewer",
  });
  const [roleSet, setRoleSet] = useState<Set<string>>(new Set(row.roles));
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();
  const qc = useQueryClient();

  // Password reset state
  const sendReset = useServerFn(sendPasswordReset);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  const { data: companies } = useQuery({
    queryKey: ["companies-options"],
    queryFn: async () => (await supabase.from("companies").select("id, name").order("name")).data ?? [],
    enabled: open,
  });

  const { data: teams } = useQuery({
    queryKey: ["company-teams-options", form.company_id],
    queryFn: async () => (await supabase.from("company_teams").select("id, name").eq("company_id", form.company_id).order("name")).data ?? [],
    enabled: open && !!form.company_id,
  });

  // Load the current company_member_roles.role for this user+company so the
  // selector reflects what's already stored, instead of always defaulting.
  useQuery({
    queryKey: ["cmr-current", row.id, form.company_id],
    enabled: open && !!form.company_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("company_member_roles").select("role")
        .eq("user_id", row.id).eq("company_id", form.company_id).maybeSingle();
      if (data?.role) setForm((f) => ({ ...f, company_role: data.role as typeof f.company_role }));
      return data ?? null;
    },
  });

  const toggleRole = (r: string) => {
    const n = new Set(roleSet);
    if (n.has(r)) {
      n.delete(r);
    } else {
      if (r === "admin") { n.delete("employer"); n.delete("jobseeker"); }
      if ((r === "employer" || r === "jobseeker") && n.has("admin")) {
        toast.error("Super Admin cannot also hold Employer or Jobseeker roles.");
        return;
      }
      n.add(r);
    }
    setRoleSet(n);
  };

  const sendResetEmail = async () => {
    setPwBusy(true);
    try {
      const res = await sendReset({ data: { userId: row.id } });
      await logAudit({ action: "user.password_reset", resource_type: "user", resource_id: row.id });
      if (res.actionLink) setResetLink(res.actionLink);
      toast.success(res.actionLink ? "Reset link generated." : "Reset email sent.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send reset");
    } finally { setPwBusy(false); }
  };

  const save = async () => {
    const isEmployer = roleSet.has("employer");
    if (isEmployer && !form.company_id) {
      toast.error("Company members must be linked to a company. Choose one before saving.");
      return;
    }
    if (!isEmployer && form.company_id) {
      toast.error("Only Company role can be linked to a company. Remove the company or grant Company role.");
      return;
    }
    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast.error("First name and last name are required.");
      return;
    }
    setSaving(true);
    try {
      const full_name = `${form.first_name.trim()} ${form.last_name.trim()}`.trim();
      const update = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        full_name,
        phone: form.phone.trim() || null,
        location: form.location || null,
        headline: form.headline || null,
        company_id: isEmployer ? (form.company_id || null) : null,
      };
      const { error } = await supabase.from("profiles").update(update).eq("id", row.id);
      if (error) throw error;

      // Sync roles
      const original = new Set(row.roles);
      const toAdd = [...roleSet].filter((r) => !original.has(r));
      const toRemove = [...original].filter((r) => !roleSet.has(r) && !(row.id === user?.id && r === "admin"));
      for (const r of toAdd) {
        await supabase.from("user_roles").insert({ user_id: row.id, role: r as never });
      }
      for (const r of toRemove) {
        await supabase.from("user_roles").delete().eq("user_id", row.id).eq("role", r as never);
      }

      // Company membership sync — write company_member_roles for the selected company.
      if (isEmployer && form.company_id) {
        // Remove any membership rows for OTHER companies and stale role rows for this company.
        await supabase.from("company_member_roles").delete().eq("user_id", row.id).neq("company_id", form.company_id);
        await supabase.from("company_member_roles").delete().eq("user_id", row.id).eq("company_id", form.company_id);
        const { error: cmrErr } = await supabase.from("company_member_roles").insert({
          user_id: row.id, company_id: form.company_id, role: form.company_role as never,
        });
        if (cmrErr) throw cmrErr;
        await supabase.from("profiles").update({ company_id: form.company_id }).eq("id", row.id);
      }
      if (!isEmployer && original.has("employer")) {
        await supabase.from("company_member_roles").delete().eq("user_id", row.id);
      }

      // Team membership sync (scoped to the selected company)
      if (form.company_id) {
        const { data: existing } = await supabase
          .from("company_team_members")
          .select("id, team:company_teams!inner(company_id)")
          .eq("user_id", row.id)
          .eq("team.company_id", form.company_id);
        if (existing?.length) {
          await supabase.from("company_team_members").delete().in("id", existing.map((e: any) => e.id));
        }
        if (form.team_id) {
          await supabase.from("company_team_members").insert({ user_id: row.id, team_id: form.team_id });
        }
      } else {
        // No company → drop all team memberships
        await supabase.from("company_team_members").delete().eq("user_id", row.id);
      }

      if (toAdd.length || toRemove.length) {
        await logAudit({
          action: "user.role_change", resource_type: "user", resource_id: row.id,
          metadata: {
            previous_roles: [...original], new_roles: [...roleSet],
            added: toAdd, removed: toRemove,
            company_id: isEmployer ? form.company_id : null,
            actor_id: user?.id ?? null,
          },
        });
      }
      await logAudit({ action: "user.profile_update", resource_type: "user", resource_id: row.id, metadata: { ...update, roles: [...roleSet], team_id: form.team_id || null } });
      toast.success("User updated.");
      setOpen(false);
      setResetLink(null);
      onSaved();
      qc.invalidateQueries({ queryKey: ["admin-users-full"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setResetLink(null); } }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8"><Pencil className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>First name *</Label><Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
            <div><Label>Last name *</Label><Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Email</Label>
              <Input value={row.email ?? ""} readOnly className="bg-secondary/40" />
              <p className="text-[11px] text-muted-foreground mt-1">Email is managed by sign-in and cannot be edited here.</p>
            </div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 555…" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="City, Country" /></div>
            <div><Label>Headline</Label><Input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} /></div>
          </div>
          <div>
            <Label>Roles</Label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {(["jobseeker", "employer", "admin"] as const).map((r) => {
                const active = roleSet.has(r);
                const disabled = row.id === user?.id && r === "admin";
                return (
                  <button key={r} type="button" disabled={disabled} onClick={() => toggleRole(r)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize ring-1 transition ${active ? "bg-primary text-primary-foreground ring-primary" : "bg-secondary text-ink-soft ring-transparent hover:ring-black/10"} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
                    {r === "admin" ? "Super Admin" : r === "employer" ? "Company" : r}
                  </button>
                );
              })}
            </div>
          </div>
          {roleSet.has("employer") && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Company</Label>
                  <Select value={form.company_id} onValueChange={(v) => setForm({ ...form, company_id: v, team_id: "" })}>
                    <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                    <SelectContent>
                      {(companies ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">Company role requires a linked company.</p>
                </div>
                <div>
                  <Label>Team</Label>
                  <Select value={form.team_id || "__none"} onValueChange={(v) => setForm({ ...form, team_id: v === "__none" ? "" : v })} disabled={!form.company_id}>
                    <SelectTrigger><SelectValue placeholder={form.company_id ? "Select team" : "Pick a company first"} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">No team</SelectItem>
                      {(teams ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Company role</Label>
                <Select
                  value={form.company_role}
                  onValueChange={(v) => setForm({ ...form, company_role: v as typeof form.company_role })}
                  disabled={!form.company_id}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Owner</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="recruiter">Recruiter</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">Saved into <code>company_member_roles</code> for the selected company.</p>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label className="text-xs uppercase tracking-wide">Password reset</Label>
                <p className="text-[11px] text-muted-foreground">Send a reset email to let the user choose a new password.</p>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={sendResetEmail} disabled={pwBusy}>
                  <Mail className="h-3.5 w-3.5 mr-1" /> {pwBusy ? "Sending…" : "Send reset"}
                </Button>
              </div>
            </div>
            {resetLink && (
              <div className="rounded-md bg-secondary p-2 text-xs space-y-1">
                <p className="text-muted-foreground">One-time reset link:</p>
                <Input readOnly value={resetLink} className="font-mono text-[11px] bg-white" onFocus={(e) => e.currentTarget.select()} />
              </div>
            )}
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

function TeamCountButton({ company, count }: { company: Company; count: number }) {
  const [open, setOpen] = useState(false);
  const { data: members, isLoading } = useQuery({
    enabled: open,
    queryKey: ["company-members", company.id],
    queryFn: async () => {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email, headline, last_login_at")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false });
      if (!profs?.length) return [] as { id: string; full_name: string | null; email: string | null; headline: string | null; last_login_at: string | null; roles: string[] }[];
      const ids = profs.map((p) => p.id);
      const { data: roleRows } = await supabase.from("user_roles").select("user_id, role").in("user_id", ids);
      const rolesMap = new Map<string, string[]>();
      (roleRows ?? []).forEach((r) => {
        const arr = rolesMap.get(r.user_id) ?? [];
        arr.push(r.role);
        rolesMap.set(r.user_id, arr);
      });
      return profs.map((p) => ({ ...p, roles: rolesMap.get(p.id) ?? [] }));
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium hover:bg-secondary/70 transition cursor-pointer"
        >
          <Users2 className="h-3.5 w-3.5 text-muted-foreground" />
          {count}
          <span className="text-muted-foreground">{count === 1 ? "member" : "members"}</span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <CompanyLogo company={company.name} logoUrl={company.logo_url} size={28} className="h-7 w-7" />
            {company.name} · Team ({count})
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="h-24 bg-secondary animate-pulse rounded-md" />
        ) : !members?.length ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No members yet.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {members.map((m) => (
              <li key={m.id} className="py-3 flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary font-semibold text-xs">
                  {(m.full_name?.[0] ?? m.email?.[0] ?? "?").toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{m.full_name || "—"}</p>
                  <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                </div>
                <div className="flex flex-wrap gap-1 justify-end">
                  {m.roles.map((r) => (
                    <Badge key={r} variant="outline" className="text-[10px] capitalize">{r === "admin" ? "Super Admin" : r}</Badge>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}


function PasswordResetMenuItems({ userId, email }: { userId: string; email: string | null }) {
  const [saving, setSaving] = useState(false);
  const sendReset = useServerFn(sendPasswordReset);
  const [link, setLink] = useState<string | null>(null);

  const sendLink = async () => {
    setSaving(true);
    try {
      const res = await sendReset({ data: { userId } });
      await logAudit({ action: "user.password_reset", resource_type: "user", resource_id: userId, metadata: { email: res.email } });
      if (res.actionLink) {
        setLink(res.actionLink);
        toast.success("Reset link generated.");
      } else {
        toast.success("Reset email sent.");
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  };

  return (
    <>
      <DropdownMenuItem onClick={sendLink} disabled={saving}>
        <Mail className="mr-2 h-4 w-4" /> Send reset email
      </DropdownMenuItem>
      <Dialog open={!!link} onOpenChange={(v) => { if (!v) setLink(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Password reset link{email ? ` for ${email}` : ""}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">Share this one-time link with the user (expires shortly):</p>
            <Input readOnly value={link ?? ""} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <DialogFooter><Button onClick={() => setLink(null)}>Done</Button></DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddToCompanyTeamItem({ userId, currentCompanyId, onChanged }: { userId: string; currentCompanyId: string | null; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState<string>("");
  const [role, setRole] = useState<"owner" | "manager" | "recruiter" | "viewer">("recruiter");
  const [saving, setSaving] = useState(false);
  const addToTeam = useServerFn(addExistingUserToCompanyTeam);

  const { data: companies } = useQuery({
    queryKey: ["companies-options"],
    queryFn: async () => (await supabase.from("companies").select("id, name").order("name")).data ?? [],
    enabled: open,
  });

  const submit = async () => {
    if (!companyId) return toast.error("Pick a company.");
    setSaving(true);
    try {
      await addToTeam({ data: { user_id: userId, company_id: companyId, role } });
      await logAudit({ action: "user.role_change", resource_type: "user", resource_id: userId, metadata: { added_to_company: companyId, role } });
      toast.success("User added to company team.");
      setOpen(false); setCompanyId("");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add to team");
    } finally { setSaving(false); }
  };

  return (
    <>
      <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setOpen(true); }}>
        <Building2 className="mr-2 h-4 w-4" /> {currentCompanyId ? "Change / add company team" : "Add to company team"}
      </DropdownMenuItem>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add user to company team</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Company</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                <SelectContent>
                  {(companies ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Team role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="recruiter">Recruiter</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-[11px] text-muted-foreground">
              The user will be granted the Employer app role and linked to this company. Only Super Admins and company Owners/Managers can perform this action.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving ? "Adding…" : "Add to team"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
