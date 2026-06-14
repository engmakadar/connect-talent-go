import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin-shell";
import { CompanyLogo } from "@/components/company-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft, Users, Plus, MoreHorizontal, Ban, PowerOff, Trash2, Pencil, UsersRound,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/companies/$companyId")({
  head: () => ({ meta: [{ title: "Company — SahanJobs Admin" }] }),
  component: CompanyDetail,
});

type Company = {
  id: string; name: string; logo_url: string | null; website: string | null;
  contact_email: string | null; location: string | null; description: string | null;
};
type Team = { id: string; name: string; description: string | null };
type Employee = {
  id: string; full_name: string | null; email: string | null; headline: string | null;
  suspended: boolean; deactivated: boolean; team_id: string | null; team_name: string | null;
};

function CompanyDetail() {
  const { companyId } = Route.useParams();

  return (
    <AdminShell pageKey="employers" title="Company" subtitle="Employees, teams and access control.">
      <CompanyHeader companyId={companyId} />
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <EmployeesPanel companyId={companyId} />
        <TeamsPanel companyId={companyId} />
      </div>
    </AdminShell>
  );
}

function CompanyHeader({ companyId }: { companyId: string }) {
  const { data: company } = useQuery({
    queryKey: ["company-detail", companyId],
    queryFn: async (): Promise<Company | null> => {
      const { data } = await supabase.from("companies")
        .select("id, name, logo_url, website, contact_email, location, description")
        .eq("id", companyId).maybeSingle();
      return data as Company | null;
    },
  });

  return (
    <div className="flex items-center gap-4">
      <Link to="/admin/companies" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> All companies
      </Link>
      {company && (
        <div className="flex items-center gap-3 ml-2">
          <CompanyLogo company={company.name} logoUrl={company.logo_url} size={48} className="h-12 w-12" />
          <div>
            <h2 className="font-display text-xl font-bold text-ink">{company.name}</h2>
            <p className="text-xs text-muted-foreground">{company.location || "—"}{company.website && ` · ${company.website}`}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function EmployeesPanel({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["company-employees", companyId],
    queryFn: async (): Promise<Employee[]> => {
      const [profs, members, teams] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, headline, suspended, deactivated").eq("company_id", companyId).order("created_at", { ascending: false }),
        supabase.from("company_team_members").select("user_id, team_id, team:company_teams!inner(id, name, company_id)").eq("team.company_id", companyId),
        supabase.from("company_teams").select("id, name").eq("company_id", companyId),
      ]);
      const teamByUser = new Map<string, { id: string; name: string }>();
      ((members.data ?? []) as { user_id: string; team_id: string; team: { id: string; name: string } }[]).forEach((m) => {
        teamByUser.set(m.user_id, m.team);
      });
      return (profs.data ?? []).map((p) => ({
        ...p,
        team_id: teamByUser.get(p.id)?.id ?? null,
        team_name: teamByUser.get(p.id)?.name ?? null,
      })) as Employee[];
    },
  });

  const { data: teams } = useQuery({
    queryKey: ["company-teams", companyId],
    queryFn: async (): Promise<Team[]> => {
      const { data } = await supabase.from("company_teams").select("id, name, description").eq("company_id", companyId).order("name");
      return data ?? [];
    },
  });

  const assignTeam = async (userId: string, teamId: string | null) => {
    // remove existing membership for this user within this company
    const { data: existing } = await supabase
      .from("company_team_members")
      .select("id, team:company_teams!inner(company_id)")
      .eq("user_id", userId)
      .eq("team.company_id", companyId);
    if (existing?.length) {
      await supabase.from("company_team_members").delete().in("id", existing.map((e) => e.id));
    }
    if (teamId) {
      const { error } = await supabase.from("company_team_members").insert({ user_id: userId, team_id: teamId });
      if (error) return toast.error(error.message);
    }
    toast.success("Team updated.");
    qc.invalidateQueries({ queryKey: ["company-employees", companyId] });
  };

  const setStatus = async (id: string, patch: { suspended?: boolean; deactivated?: boolean }) => {
    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Status updated.");
    qc.invalidateQueries({ queryKey: ["company-employees", companyId] });
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this employee from the company?")) return;
    const { error } = await supabase.from("profiles").update({ company_id: null }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Employee removed from company.");
    qc.invalidateQueries({ queryKey: ["company-employees", companyId] });
  };

  return (
    <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between">
        <h3 className="font-display font-bold text-ink flex items-center gap-2"><Users className="h-4 w-4" /> Employees</h3>
        <span className="text-xs text-muted-foreground">{data?.length ?? 0} total</span>
      </div>
      {isLoading ? (
        <div className="h-40 bg-secondary animate-pulse" />
      ) : !data?.length ? (
        <p className="py-12 text-sm text-muted-foreground text-center">No employees yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-secondary/50">
              <tr className="text-left">
                <th className="px-5 py-3 font-semibold">Name</th>
                <th className="px-5 py-3 font-semibold">Team</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.map((e) => (
                <tr key={e.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/30">
                  <td className="px-5 py-3">
                    <p className="font-medium text-ink">{e.full_name || "—"}</p>
                    <p className="text-xs text-muted-foreground">{e.email}</p>
                  </td>
                  <td className="px-5 py-3">
                    <Select value={e.team_id ?? "none"} onValueChange={(v) => assignTeam(e.id, v === "none" ? null : v)}>
                      <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="No team" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No team</SelectItem>
                        {(teams ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-5 py-3">
                    {e.deactivated ? <Badge variant="destructive">Deactivated</Badge>
                     : e.suspended ? <Badge className="bg-amber-100 text-amber-800 border-0">Suspended</Badge>
                     : <Badge className="bg-emerald-100 text-emerald-700 border-0">Active</Badge>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setStatus(e.id, { suspended: !e.suspended })}>
                          <Ban className="mr-2 h-4 w-4" /> {e.suspended ? "Unsuspend" : "Suspend"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setStatus(e.id, { deactivated: !e.deactivated })}>
                          <PowerOff className="mr-2 h-4 w-4" /> {e.deactivated ? "Reactivate" : "Deactivate"}
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => remove(e.id)}>
                          <Trash2 className="mr-2 h-4 w-4" /> Remove from company
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TeamsPanel({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["company-teams", companyId],
    queryFn: async (): Promise<Team[]> => {
      const { data } = await supabase.from("company_teams").select("id, name, description").eq("company_id", companyId).order("name");
      return data ?? [];
    },
  });

  const remove = async (id: string) => {
    if (!confirm("Delete this team? Members will be unassigned.")) return;
    const { error } = await supabase.from("company_teams").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Team deleted.");
    qc.invalidateQueries({ queryKey: ["company-teams", companyId] });
    qc.invalidateQueries({ queryKey: ["company-employees", companyId] });
  };

  return (
    <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between">
        <h3 className="font-display font-bold text-ink flex items-center gap-2"><UsersRound className="h-4 w-4" /> Teams</h3>
        <TeamDialog companyId={companyId} mode="create" />
      </div>
      {isLoading ? (
        <div className="h-32 bg-secondary animate-pulse" />
      ) : !data?.length ? (
        <p className="py-10 text-sm text-muted-foreground text-center px-5">No teams yet. Create one to organize employees.</p>
      ) : (
        <ul className="divide-y divide-black/5">
          {data.map((t) => (
            <li key={t.id} className="px-5 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-ink">{t.name}</p>
                {t.description && <p className="text-xs text-muted-foreground truncate">{t.description}</p>}
              </div>
              <div className="flex items-center gap-1">
                <TeamDialog companyId={companyId} mode="edit" team={t} />
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(t.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TeamDialog({ companyId, mode, team }: { companyId: string; mode: "create" | "edit"; team?: Team }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(team?.name ?? "");
  const [description, setDescription] = useState(team?.description ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return toast.error("Team name required.");
    setSaving(true);
    try {
      if (mode === "create") {
        const { error } = await supabase.from("company_teams").insert({ company_id: companyId, name, description: description || null });
        if (error) throw error;
        toast.success("Team created.");
      } else if (team) {
        const { error } = await supabase.from("company_teams").update({ name, description: description || null }).eq("id", team.id);
        if (error) throw error;
        toast.success("Team updated.");
      }
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["company-teams", companyId] });
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
          <Button size="sm" variant="outline" className="h-8"><Plus className="h-3.5 w-3.5" /> New team</Button>
        ) : (
          <Button variant="ghost" size="icon" className="h-8 w-8"><Pencil className="h-4 w-4" /></Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{mode === "create" ? "Create team" : "Edit team"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
