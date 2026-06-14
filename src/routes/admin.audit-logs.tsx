import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin-shell";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, History } from "lucide-react";

export const Route = createFileRoute("/admin/audit-logs")({
  head: () => ({ meta: [{ title: "Audit Logs — SahanJobs Admin" }] }),
  component: () => (
    <AdminShell pageKey="audit_logs" title="Audit Logs" subtitle="Immutable record of every action taken on the platform.">
      <AuditTable />
    </AdminShell>
  ),
});

function AuditTable() {
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, action, actor_email, resource_type, resource_id, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return data ?? [];
    return (data ?? []).filter((r) =>
      r.action.toLowerCase().includes(t) ||
      (r.actor_email || "").toLowerCase().includes(t) ||
      (r.resource_type || "").toLowerCase().includes(t) ||
      (r.resource_id || "").toLowerCase().includes(t),
    );
  }, [data, q]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by action, user, resource…" className="pl-9 h-11 bg-white" />
      </div>

      <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="h-40 bg-secondary animate-pulse" />
        ) : !filtered.length ? (
          <div className="p-16 text-center text-muted-foreground">
            <History className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
            <p>No audit entries.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-secondary/50">
                <tr className="text-left">
                  <th className="px-5 py-3 font-semibold">When</th>
                  <th className="px-5 py-3 font-semibold">Actor</th>
                  <th className="px-5 py-3 font-semibold">Action</th>
                  <th className="px-5 py-3 font-semibold">Resource</th>
                  <th className="px-5 py-3 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/30 align-top">
                    <td className="px-5 py-3 whitespace-nowrap text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="px-5 py-3 font-medium">{r.actor_email || "system"}</td>
                    <td className="px-5 py-3">
                      <Badge variant="secondary" className="text-[10px] font-mono">{r.action}</Badge>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {r.resource_type ? `${r.resource_type}${r.resource_id ? `: ${r.resource_id.slice(0, 8)}` : ""}` : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <pre className="text-[10px] text-muted-foreground max-w-xs truncate">{JSON.stringify(r.metadata ?? {})}</pre>
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
