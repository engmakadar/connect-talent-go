import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin-shell";
import { Briefcase, Users, ClipboardCheck, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/admin/dashboard")({
  head: () => ({ meta: [{ title: "Admin Dashboard — SahanJobs" }] }),
  component: () => (
    <AdminShell pageKey="dashboard" title="Dashboard" subtitle="Platform health at a glance.">
      <Stats />
    </AdminShell>
  ),
});

function Stats() {
  const { data } = useQuery({
    queryKey: ["admin-overview-stats"],
    queryFn: async () => {
      const [pending, approved, users, perms] = await Promise.all([
        supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "approved"),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("page_permissions").select("id", { count: "exact", head: true }),
      ]);
      return {
        pending: pending.count ?? 0, approved: approved.count ?? 0,
        users: users.count ?? 0, perms: perms.count ?? 0,
      };
    },
  });

  const tiles = [
    { label: "Pending review", value: data?.pending ?? "—", icon: ClipboardCheck, color: "from-warning/15 to-warning/5 text-warning-foreground" },
    { label: "Approved jobs", value: data?.approved ?? "—", icon: Briefcase, color: "from-primary/15 to-primary/5 text-primary" },
    { label: "Registered users", value: data?.users ?? "—", icon: Users, color: "from-blue-100 to-blue-50 text-blue-700" },
    { label: "Page grants", value: data?.perms ?? "—", icon: ShieldCheck, color: "from-gold/20 to-gold/5 text-gold-foreground" },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((t) => {
        const Icon = t.icon;
        return (
          <div key={t.label} className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.label}</p>
              <span className={`grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br ${t.color}`}><Icon className="h-4 w-4" /></span>
            </div>
            <p className="mt-3 font-display text-3xl font-bold text-ink">{t.value}</p>
          </div>
        );
      })}
    </div>
  );
}
