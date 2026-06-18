import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Receipt, Download, Search, CheckCircle2, Clock, XCircle, Sparkles } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadReceipt } from "@/lib/receipt";

export const Route = createFileRoute("/admin/transactions")({
  head: () => ({ meta: [{ title: "Transactions & Invoices — SahanJobs Admin" }] }),
  component: () => (
    <AdminShell pageKey="transactions" title="Transactions & Invoices" subtitle="All subscription payments across companies and jobseekers.">
      <TransactionsTable />
    </AdminShell>
  ),
});

type Row = {
  id: string;
  created_at: string;
  amount: number;
  currency: string;
  method: string;
  reference: string | null;
  status: string;
  notes: string | null;
  plan_id: string | null;
  company_id: string | null;
  user_id: string;
};

function TransactionsTable() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-transactions"],
    queryFn: async () => {
      const [tx, plans, companies, profiles] = await Promise.all([
        supabase.from("payment_transactions").select("id, created_at, amount, currency, method, reference, status, notes, plan_id, company_id, user_id").order("created_at", { ascending: false }).limit(500),
        supabase.from("subscription_plans").select("id, name"),
        supabase.from("companies").select("id, name"),
        supabase.from("profiles").select("id, full_name, email"),
      ]);
      const planMap = new Map((plans.data ?? []).map((p) => [p.id, p.name]));
      const companyMap = new Map((companies.data ?? []).map((c) => [c.id, c.name]));
      const profileMap = new Map((profiles.data ?? []).map((p) => [p.id, p]));
      return ((tx.data as Row[]) ?? []).map((t) => ({
        ...t,
        plan_name: t.plan_id ? planMap.get(t.plan_id) ?? null : null,
        company_name: t.company_id ? companyMap.get(t.company_id) ?? null : null,
        payer: profileMap.get(t.user_id) ?? null,
      }));
    },
  });

  const filtered = useMemo(() => {
    const list = data ?? [];
    return list.filter((t) => {
      if (status !== "all" && t.status !== status) return false;
      if (!q) return true;
      const hay = [t.company_name, t.plan_name, t.payer?.full_name, t.payer?.email, t.reference, t.method].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q.toLowerCase());
    });
  }, [data, q, status]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search company, payer, plan, reference…" className="pl-10" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="h-40 bg-secondary animate-pulse" />
        ) : !filtered.length ? (
          <div className="py-16 text-center">
            <Receipt className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground text-sm">No transactions found.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-secondary/50 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Company / Payer</th>
                <th className="px-4 py-3 font-semibold">Plan</th>
                <th className="px-4 py-3 font-semibold">Method</th>
                <th className="px-4 py-3 font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/30">
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{new Date(t.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{t.company_name ?? t.payer?.full_name ?? "Jobseeker"}</div>
                    <div className="text-xs text-muted-foreground">{t.payer?.email ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3">{t.plan_name ?? "—"}</td>
                  <td className="px-4 py-3 capitalize">{t.method.replace("_", " ")}</td>
                  <td className="px-4 py-3 font-semibold">
                    {t.method === "free_trial" ? (
                      <Badge className="bg-amber-100 text-amber-800 border-0"><Sparkles className="h-3 w-3 mr-1" /> Free</Badge>
                    ) : `${t.currency} ${Number(t.amount).toFixed(2)}`}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => downloadReceipt({
                      id: t.id, created_at: t.created_at, amount: t.amount, currency: t.currency,
                      method: t.method, reference: t.reference, status: t.status, notes: t.notes,
                      plan_name: t.plan_name, payer_name: t.payer?.full_name ?? null,
                      payer_email: t.payer?.email ?? null, company_name: t.company_name,
                    })}>
                      <Download className="h-3.5 w-3.5" /> Receipt
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

function StatusBadge({ status }: { status: string }) {
  if (status === "approved" || status === "confirmed") return <Badge className="bg-emerald-100 text-emerald-800 border-0"><CheckCircle2 className="h-3 w-3 mr-1" /> {status}</Badge>;
  if (status === "rejected" || status === "failed") return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> {status}</Badge>;
  return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> {status}</Badge>;
}
