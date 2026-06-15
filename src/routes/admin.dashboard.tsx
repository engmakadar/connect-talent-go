import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AdminShell } from "@/components/admin-shell";
import {
  Briefcase, Users, ClipboardCheck, ShieldCheck, Wallet, CalendarClock,
  CircleAlert, ChartPie, LineChart as LineIcon,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/admin/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — SahanJobs Admin" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { isAdmin } = useAuth();
  return (
    <AdminShell
      pageKey="dashboard"
      title="Dashboard & Analytics"
      subtitle={isAdmin ? "Platform-wide KPIs and trends." : "Your company KPIs, hiring trends, and subscription activity."}
    >
      {isAdmin ? <PlatformStats /> : <CompanyDashboard />}
    </AdminShell>
  );
}

/* --------------------------------- ADMIN -------------------------------- */

function PlatformStats() {
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
      {tiles.map((t) => <KpiTile key={t.label} {...t} />)}
    </div>
  );
}

/* --------------------------------- COMPANY ------------------------------ */

const PIE_COLORS = ["hsl(var(--primary))", "#f59e0b", "#10b981", "#6366f1", "#ec4899", "#06b6d4", "#84cc16", "#f97316"];

function CompanyDashboard() {
  const { user } = useAuth();

  const { data: companyId } = useQuery({
    enabled: !!user,
    queryKey: ["my-company-id", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("company_id").eq("id", user!.id).maybeSingle();
      return data?.company_id ?? null;
    },
  });

  const { data, isLoading } = useQuery({
    enabled: companyId !== undefined,
    queryKey: ["company-dashboard", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const nowIso = new Date().toISOString();

      // Jobs (any status, including pending/rejected)
      const { data: jobs } = await supabase
        .from("jobs")
        .select("id,status,category,created_at,expires_at")
        .eq("company_id", companyId);

      const all = jobs ?? [];
      const approved = all.filter((j) => j.status === "approved");
      const active = approved.filter((j) => !j.expires_at || j.expires_at >= nowIso);
      const expired = approved.filter((j) => j.expires_at && j.expires_at < nowIso);

      // Team users (profiles linked to this company)
      const { count: teamCount } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId);

      // Subscriptions / payments
      const [{ data: txns }, { data: subs }] = await Promise.all([
        supabase
          .from("payment_transactions")
          .select("amount, status, created_at, method")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false }),
        supabase
          .from("subscriptions")
          .select("id, plan, active, valid_until, trial_ends_at, created_at")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false }),
      ]);

      const confirmed = (txns ?? []).filter((t) => t.status === "confirmed" || t.status === "approved" || t.status === "completed");
      const totalSubscribed = confirmed.reduce((sum, t) => sum + Number(t.amount ?? 0), 0);
      const subscriptionCount = (subs ?? []).length;

      // Category breakdown (pie)
      const catMap = new Map<string, number>();
      all.forEach((j) => catMap.set(j.category, (catMap.get(j.category) ?? 0) + 1));
      const pieData = Array.from(catMap, ([name, value]) => ({ name, value }));

      // Monthly distribution (last 6 months) for posting count
      const months: { key: string; label: string; count: number }[] = [];
      const today = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const label = d.toLocaleString(undefined, { month: "short" });
        months.push({ key, label, count: 0 });
      }
      all.forEach((j) => {
        const d = new Date(j.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const m = months.find((x) => x.key === key);
        if (m) m.count++;
      });

      return {
        kpis: {
          total: all.length,
          active: active.length,
          expired: expired.length,
          team: teamCount ?? 0,
        },
        pieData,
        months,
        totalSubscribed,
        subscriptionCount,
        recentTxns: (txns ?? []).slice(0, 6),
      };
    },
  });

  const tiles = useMemo(() => ([
    { label: "Total positions", value: data?.kpis.total ?? "—", icon: Briefcase, color: "from-primary/15 to-primary/5 text-primary" },
    { label: "Active positions", value: data?.kpis.active ?? "—", icon: ClipboardCheck, color: "from-emerald-100 to-emerald-50 text-emerald-700" },
    { label: "Expired positions", value: data?.kpis.expired ?? "—", icon: CircleAlert, color: "from-amber-100 to-amber-50 text-amber-700" },
    { label: "Team users", value: data?.kpis.team ?? "—", icon: Users, color: "from-blue-100 to-blue-50 text-blue-700" },
  ]), [data]);

  if (!companyId) {
    return (
      <div className="rounded-2xl bg-white p-10 ring-1 ring-black/5 text-center">
        <p className="text-sm text-muted-foreground">No company is linked to your account yet.</p>
      </div>
    );
  }

  if (isLoading || !data) {
    return <div className="h-64 rounded-2xl bg-white ring-1 ring-black/5 animate-pulse" />;
  }

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => <KpiTile key={t.label} {...t} />)}
      </div>

      {/* Subscription totals */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total subscribed</p>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-primary/15 to-primary/5 text-primary"><Wallet className="h-4 w-4" /></span>
          </div>
          <p className="mt-3 font-display text-3xl font-bold text-ink">
            ${data.totalSubscribed.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Sum of confirmed payments to date.</p>
        </div>
        <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Subscription frequency</p>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-gold/20 to-gold/5 text-gold-foreground"><CalendarClock className="h-4 w-4" /></span>
          </div>
          <p className="mt-3 font-display text-3xl font-bold text-ink">{data.subscriptionCount}</p>
          <p className="text-xs text-muted-foreground mt-1">Total subscription records on file.</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Positions by category" icon={ChartPie}>
          {data.pieData.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={data.pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3}>
                  {data.pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Monthly distribution" icon={LineIcon}>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.months} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Recent transactions */}
      <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-sm">
        <p className="font-display font-semibold text-ink mb-3">Recent subscription activity</p>
        {data.recentTxns.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No subscription activity yet.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {data.recentTxns.map((t, i) => (
              <li key={i} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="font-medium text-ink capitalize">{t.method ?? "Payment"}</p>
                  <p className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-ink">${Number(t.amount ?? 0).toLocaleString()}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t.status}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- SHARED -------------------------------- */

function KpiTile({ label, value, icon: Icon, color }: {
  label: string; value: number | string; icon: typeof Briefcase; color: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <span className={`grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br ${color}`}><Icon className="h-4 w-4" /></span>
      </div>
      <p className="mt-3 font-display text-3xl font-bold text-ink">{value}</p>
    </div>
  );
}

function ChartCard({ title, icon: Icon, children }: { title: string; icon: typeof Briefcase; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-primary" />
        <p className="font-display font-semibold text-ink">{title}</p>
      </div>
      {children}
    </div>
  );
}

function EmptyChart() {
  return <div className="h-[280px] grid place-items-center text-sm text-muted-foreground">No data yet.</div>;
}
