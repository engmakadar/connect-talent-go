import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin-shell";
import { ADMIN_NAV, ALL_PAGE_KEYS, type AdminPageKey } from "@/lib/admin-nav";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Search, Lock, Check } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/admin/roles")({
  head: () => ({ meta: [{ title: "Roles & RBAC — SahanJobs Admin" }] }),
  component: RolesPage,
});

type ProfileRow = { id: string; full_name: string | null; email: string | null };

function RolesPage() {
  return (
    <AdminShell pageKey="roles_rbac" title="Roles & RBAC" subtitle="Grant individual admin users access to specific pages. Admins see everything by default.">
      <RolesContent />
    </AdminShell>
  );
}

function RolesContent() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const [q, setQ] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Users + their roles + their page_permissions
  const { data: users } = useQuery({
    queryKey: ["rbac-users"],
    queryFn: async () => {
      const [{ data: profiles, error: pe }, { data: roles, error: re }, { data: perms, error: pere }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("page_permissions").select("user_id, page_key"),
      ]);
      if (pe) throw pe; if (re) throw re; if (pere) throw pere;
      const roleMap = new Map<string, string[]>();
      roles?.forEach((r) => { const a = roleMap.get(r.user_id) ?? []; a.push(r.role); roleMap.set(r.user_id, a); });
      const permMap = new Map<string, Set<string>>();
      perms?.forEach((p) => { const s = permMap.get(p.user_id) ?? new Set(); s.add(p.page_key); permMap.set(p.user_id, s); });
      return (profiles ?? [])
        .map((p: ProfileRow) => ({
          ...p,
          roles: roleMap.get(p.id) ?? [],
          pages: Array.from(permMap.get(p.id) ?? []) as AdminPageKey[],
        }))
        // Only Employer and Super Admin accounts are managed through RBAC.
        .filter((p) => p.roles.includes("employer") || p.roles.includes("admin"));
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return users ?? [];
    return (users ?? []).filter((u) =>
      (u.full_name || "").toLowerCase().includes(term) || (u.email || "").toLowerCase().includes(term),
    );
  }, [users, q]);

  const selectedUser = useMemo(() => users?.find((u) => u.id === selectedUserId) ?? null, [users, selectedUserId]);
  const selectedSet = useMemo(() => new Set(selectedUser?.pages ?? []), [selectedUser]);
  const isFullAdmin = selectedUser?.roles.includes("admin") ?? false;

  const togglePage = async (pageKey: AdminPageKey, on: boolean) => {
    if (!selectedUser) return;
    if (on) {
      const { error } = await supabase.from("page_permissions").insert({
        user_id: selectedUser.id, page_key: pageKey, granted_by: me?.id ?? null,
      });
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("page_permissions")
        .delete().eq("user_id", selectedUser.id).eq("page_key", pageKey);
      if (error) return toast.error(error.message);
    }
    toast.success("Permissions updated.");
    qc.invalidateQueries({ queryKey: ["rbac-users"] });
    qc.invalidateQueries({ queryKey: ["page-permissions"] });
  };

  const grantAll = async () => {
    if (!selectedUser) return;
    const rows = ALL_PAGE_KEYS.filter((k) => !selectedSet.has(k))
      .map((k) => ({ user_id: selectedUser.id, page_key: k, granted_by: me?.id ?? null }));
    if (!rows.length) return;
    const { error } = await supabase.from("page_permissions").insert(rows);
    if (error) return toast.error(error.message);
    toast.success("All pages granted.");
    qc.invalidateQueries({ queryKey: ["rbac-users"] });
  };

  const revokeAll = async () => {
    if (!selectedUser) return;
    const { error } = await supabase.from("page_permissions").delete().eq("user_id", selectedUser.id);
    if (error) return toast.error(error.message);
    toast.success("All pages revoked.");
    qc.invalidateQueries({ queryKey: ["rbac-users"] });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      {/* Users column */}
      <aside className="rounded-2xl bg-white ring-1 ring-black/5 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-black/5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search users…" className="pl-9 h-10 bg-secondary border-0 rounded-lg" />
          </div>
        </div>
        <ul className="max-h-[640px] overflow-y-auto divide-y divide-black/5">
          {filtered.length === 0 ? (
            <li className="p-6 text-sm text-muted-foreground text-center">No users.</li>
          ) : filtered.map((u) => (
            <li key={u.id}>
              <button
                onClick={() => setSelectedUserId(u.id)}
                className={`w-full text-left px-4 py-3 hover:bg-secondary/50 transition-colors ${selectedUserId === u.id ? "bg-primary/5" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary font-bold text-xs">
                    {(u.full_name?.[0] ?? u.email?.[0] ?? "?").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{u.full_name || "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {u.roles.map((r) => (
                    <Badge key={r} variant={r === "admin" ? "default" : "secondary"} className="text-[10px] h-4 px-1.5">{r}</Badge>
                  ))}
                  {u.pages.length > 0 && !u.roles.includes("admin") && (
                    <Badge className="bg-gold/15 text-gold-foreground border-0 text-[10px] h-4 px-1.5">{u.pages.length} pages</Badge>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Permissions panel */}
      <section className="rounded-2xl bg-white ring-1 ring-black/5 shadow-sm">
        {!selectedUser ? (
          <div className="p-16 text-center text-muted-foreground">
            <Lock className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
            <p>Select a user from the left to manage their page permissions.</p>
          </div>
        ) : (
          <div>
            <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-5 border-b border-black/5">
              <div>
                <h2 className="font-display text-lg font-semibold">{selectedUser.full_name || selectedUser.email}</h2>
                <p className="text-xs text-muted-foreground">{selectedUser.email}</p>
              </div>
              <div className="flex gap-2">
                {!isFullAdmin && (
                  <>
                    <button onClick={grantAll} className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">Grant all</button>
                    <button onClick={revokeAll} className="rounded-full bg-secondary px-4 py-1.5 text-xs font-semibold hover:bg-secondary/80">Revoke all</button>
                  </>
                )}
              </div>
            </header>

            {isFullAdmin && (
              <div className="mx-6 mt-5 rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary flex items-center gap-2">
                <Check className="h-4 w-4" />
                This user holds the <strong>admin</strong> role and implicitly has access to every page.
              </div>
            )}

            <div className="p-6 space-y-6">
              {ADMIN_NAV.map((section) => (
                <div key={section.title}>
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft mb-3">{section.title}</h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const checked = isFullAdmin || selectedSet.has(item.key);
                      return (
                        <label
                          key={item.key}
                          className={`flex items-center gap-3 rounded-lg border border-black/5 bg-secondary/30 px-3 py-2.5 ${
                            isFullAdmin ? "opacity-70" : "hover:bg-secondary cursor-pointer"
                          }`}
                        >
                          <Checkbox
                            checked={checked}
                            disabled={isFullAdmin}
                            onCheckedChange={(v) => togglePage(item.key, !!v)}
                          />
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span className="flex-1 text-sm">{item.label}</span>
                          {item.soon && <Badge className="bg-muted text-muted-foreground border-0 text-[9px] h-4 px-1.5">SOON</Badge>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
