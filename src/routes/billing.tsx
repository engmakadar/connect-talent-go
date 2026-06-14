import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Receipt, CheckCircle2, Clock, XCircle, CreditCard, Smartphone, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCompanySummary } from "@/hooks/use-company-summary";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/billing")({
  head: () => ({ meta: [{ title: "Billing & Invoices — SahanJobs" }] }),
  component: BillingPage,
});

type Tx = {
  id: string;
  amount: number;
  currency: string;
  method: string;
  reference: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  plan_id: string | null;
};

function methodLabel(m: string) {
  const map: Record<string, string> = {
    free_trial: "Free trial",
    visa: "Visa card",
    mastercard: "Mastercard",
    paypal: "PayPal",
    evc: "EVC Plus (Mobile money)",
    zaad: "Zaad (Mobile money)",
    sahal: "Sahal (Mobile money)",
    mpesa: "M-Pesa (Mobile money)",
  };
  return map[m] ?? m;
}

function methodIcon(m: string) {
  if (m === "free_trial") return Sparkles;
  if (["evc", "zaad", "sahal", "mpesa"].includes(m)) return Smartphone;
  return CreditCard;
}

function BillingPage() {
  const { user, loading } = useAuth();
  const { data: cs } = useCompanySummary();
  const companyId = cs?.company?.id ?? null;

  const { data: txs, isLoading } = useQuery({
    enabled: !!user && !!companyId,
    queryKey: ["billing-transactions", companyId],
    queryFn: async (): Promise<Tx[]> => {
      const { data, error } = await supabase
        .from("payment_transactions")
        .select("id, amount, currency, method, reference, status, notes, created_at, plan_id")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Tx[];
    },
  });

  const onTrial = !!cs?.onTrial;
  const trialDaysLeft = cs?.trialDaysLeft ?? 0;
  const trialExpired = !!cs?.trialExpired;

  return (
    <div className="min-h-screen flex flex-col bg-hero-band/40">
      <SiteHeader />
      <section className="bg-hero-band border-b border-black/5">
        <div className="mx-auto max-w-5xl px-4 md:px-8 py-10">
          <Badge className="bg-primary/10 text-primary border-0 mb-3">
            <Receipt className="h-3 w-3 mr-1" /> Billing & Invoices
          </Badge>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-ink">Payments & invoices</h1>
          <p className="mt-2 text-muted-foreground">All subscription transactions for {cs?.company?.name ?? "your company"}.</p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 md:px-8 py-10 flex-1 space-y-6">
        {/* Trial status card */}
        {onTrial && (
          <div className="rounded-2xl bg-white p-5 ring-1 ring-amber-200 shadow-sm flex items-center gap-4">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-amber-100 text-amber-800">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <p className="font-semibold text-ink">Free trial active</p>
              <p className="text-sm text-muted-foreground">
                {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} remaining. Choose a paid plan before it ends to keep posting jobs.
              </p>
            </div>
            <Badge className="bg-amber-100 text-amber-800 border-0">{trialDaysLeft}d left</Badge>
          </div>
        )}
        {trialExpired && (
          <div className="rounded-2xl bg-white p-5 ring-1 ring-destructive/30 shadow-sm flex items-center gap-4">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-destructive/10 text-destructive">
              <XCircle className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <p className="font-semibold text-ink">Trial expired</p>
              <p className="text-sm text-muted-foreground">Subscribe to a paid plan to restore full posting access.</p>
            </div>
          </div>
        )}

        {/* Invoices */}
        {loading || isLoading ? (
          <div className="h-40 rounded-2xl bg-white animate-pulse ring-1 ring-black/5" />
        ) : !companyId ? (
          <div className="rounded-2xl bg-white p-12 text-center ring-1 ring-black/5">
            <p className="text-muted-foreground">Link your account to a company to see invoices.</p>
          </div>
        ) : !txs?.length ? (
          <div className="rounded-2xl bg-white p-12 text-center ring-1 ring-black/5">
            <Receipt className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">No transactions yet.</p>
          </div>
        ) : (
          <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-secondary/50 text-left">
                <tr>
                  <th className="px-5 py-3 font-semibold">Date</th>
                  <th className="px-5 py-3 font-semibold">Type</th>
                  <th className="px-5 py-3 font-semibold">Payment method</th>
                  <th className="px-5 py-3 font-semibold">Amount</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {txs.map((tx) => {
                  const Icon = methodIcon(tx.method);
                  const isTrial = tx.method === "free_trial";
                  return (
                    <tr key={tx.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/30">
                      <td className="px-5 py-4 text-muted-foreground">{new Date(tx.created_at).toLocaleDateString()}</td>
                      <td className="px-5 py-4">
                        {isTrial ? (
                          <Badge className="bg-amber-100 text-amber-800 border-0">
                            <Sparkles className="h-3 w-3 mr-1" /> Free trial
                          </Badge>
                        ) : (
                          <Badge variant="outline">Subscription</Badge>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className="grid h-8 w-8 place-items-center rounded-lg bg-secondary text-ink">
                            <Icon className="h-4 w-4" />
                          </span>
                          <div>
                            <p className="font-medium text-ink">{methodLabel(tx.method)}</p>
                            {tx.reference && <p className="text-xs text-muted-foreground">Ref: {tx.reference}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-semibold">
                        {isTrial ? "Free" : `${tx.currency} ${Number(tx.amount).toFixed(2)}`}
                      </td>
                      <td className="px-5 py-4"><StatusBadge status={tx.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <SiteFooter />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "approved" || status === "confirmed") return <Badge className="bg-emerald-100 text-emerald-800 border-0"><CheckCircle2 className="h-3 w-3 mr-1" /> Confirmed</Badge>;
  if (status === "rejected" || status === "failed") return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Rejected</Badge>;
  return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> Pending</Badge>;
}
