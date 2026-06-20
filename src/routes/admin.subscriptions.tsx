import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Receipt, Search, Sparkles, CheckCircle2, XCircle, Clock, Power, Building2, Gift } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/subscriptions")({
  head: () => ({ meta: [{ title: "Subscriptions List — SahanJobs Admin" }] }),
  component: () => (
    <AdminShell
      pageKey="subscriptions_list"
      title="Subscriptions List"
      subtitle="All companies subscribed to a plan — including free trials. Activate, deactivate, or grant a trial to override access."
    >
      <SubscriptionsPanel />
    </AdminShell>
  ),
});

type SubRow = {
  id: string;
  company_id: string;
  plan: string;
  active: boolean;
  trial_ends_at: string | null;
  valid_until: string | null;
  created_at: string;
};
type CompanyRow = { id: string; name: string; contact_email: string | null };

function SubscriptionsPanel() {
  const [tab, setTab] = useState<"all" | "active" | "expired" | "trial" | "none">("all");

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="bg-secondary">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="trial">Free Trial</TabsTrigger>
          <TabsTrigger value="expired">Expired</TabsTrigger>
          <TabsTrigger value="none">No Subscription</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "none" ? <NoSubscriptionTable /> : <SubscriptionsTable status={tab} />}
    </div>
  );
}

function SubscriptionsTable({ status }: { status: "all" | "active" | "expired" | "trial" }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-subscriptions"],
    queryFn: async () => {
      const [subs, companies] = await Promise.all([
        supabase.from("subscriptions").select("*").order("created_at", { ascending: false }),
        supabase.from("companies").select("id, name, contact_email"),
      ]);
      if (subs.error) throw subs.error;
      const companyMap = new Map((companies.data ?? []).map((c) => [c.id, c]));
      return ((subs.data as SubRow[]) ?? []).map((s) => ({
        ...s,
        company: companyMap.get(s.company_id) ?? null,
      }));
    },
  });

  const now = Date.now();
  const rows = useMemo(() => {
    const list = data ?? [];
    return list.filter((s) => {
      const isTrial = !!s.trial_ends_at;
      const endsAt = s.valid_until ? new Date(s.valid_until).getTime() : null;
      const expired = endsAt !== null && endsAt < now;
      const effectiveActive = s.active && !expired;
      if (status === "active" && !effectiveActive) return false;
      if (status === "expired" && !expired) return false;
      if (status === "trial" && !isTrial) return false;
      if (q) {
        const hay = [s.company?.name, s.company?.contact_email, s.plan].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [data, q, status, now]);

  const toggleActive = async (id: string, next: boolean) => {
    setBusy(id);
    const { error } = await supabase.from("subscriptions").update({ active: next }).eq("id", id);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(next ? "Subscription activated" : "Subscription deactivated");
    qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search company, plan…" className="pl-10" />
        </div>
      </div>

      <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="h-40 bg-secondary animate-pulse" />
        ) : !rows.length ? (
          <div className="py-16 text-center">
            <Receipt className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground text-sm">No subscriptions found.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-secondary/50 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Company</th>
                <th className="px-4 py-3 font-semibold">Plan</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Start</th>
                <th className="px-4 py-3 font-semibold">End</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const isTrial = !!s.trial_ends_at;
                const endsAt = s.valid_until ? new Date(s.valid_until).getTime() : null;
                const expired = endsAt !== null && endsAt < now;
                const effectiveActive = s.active && !expired;
                return (
                  <tr key={s.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/30">
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{s.company?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{s.company?.contact_email ?? "—"}</div>
                    </td>
                    <td className="px-4 py-3">{s.plan}</td>
                    <td className="px-4 py-3">
                      {isTrial ? (
                        <Badge className="bg-amber-100 text-amber-800 border-0"><Sparkles className="h-3 w-3 mr-1" /> Free trial</Badge>
                      ) : (
                        <Badge variant="secondary">Paid</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{new Date(s.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{s.valid_until ? new Date(s.valid_until).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-3">
                      {effectiveActive ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border-0"><CheckCircle2 className="h-3 w-3 mr-1" /> Active</Badge>
                      ) : expired ? (
                        <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Expired</Badge>
                      ) : (
                        <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> Inactive</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant={s.active ? "outline" : "default"}
                        disabled={busy === s.id}
                        onClick={() => toggleActive(s.id, !s.active)}
                      >
                        <Power className="h-3.5 w-3.5" /> {s.active ? "Deactivate" : "Activate"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function NoSubscriptionTable() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [days, setDays] = useState<string>("14");
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-companies-without-sub"],
    queryFn: async () => {
      const [companies, subs] = await Promise.all([
        supabase.from("companies").select("id, name, contact_email").order("name"),
        supabase.from("subscriptions").select("company_id"),
      ]);
      const subbed = new Set((subs.data ?? []).map((s) => s.company_id));
      return ((companies.data as CompanyRow[]) ?? []).filter((c) => !subbed.has(c.id));
    },
  });

  const rows = useMemo(() => {
    const list = data ?? [];
    if (!q) return list;
    const needle = q.toLowerCase();
    return list.filter((c) =>
      [c.name, c.contact_email].filter(Boolean).join(" ").toLowerCase().includes(needle)
    );
  }, [data, q]);

  const grantTrial = async (companyId: string) => {
    setBusy(companyId);
    const n = Math.max(1, Math.min(90, Number(days) || 14));
    const validUntil = new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from("subscriptions").insert({
      company_id: companyId,
      plan: "free_trial",
      active: true,
      trial_ends_at: validUntil,
      valid_until: validUntil,
    });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`Free trial granted for ${n} day${n === 1 ? "" : "s"}.`);
    qc.invalidateQueries({ queryKey: ["admin-companies-without-sub"] });
    qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search company…" className="pl-10" />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Trial length:</span>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[7, 14, 30, 60, 90].map((d) => <SelectItem key={d} value={String(d)}>{d} days</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="h-40 bg-secondary animate-pulse" />
        ) : !rows.length ? (
          <div className="py-16 text-center">
            <Building2 className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground text-sm">Every company has a subscription.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-secondary/50 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Company</th>
                <th className="px-4 py-3 font-semibold">Contact</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/30">
                  <td className="px-4 py-3 font-medium text-ink">{c.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.contact_email ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" disabled={busy === c.id} onClick={() => grantTrial(c.id)}>
                      <Gift className="h-3.5 w-3.5" /> Grant trial
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
