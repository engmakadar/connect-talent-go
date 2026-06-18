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
  LineChart, Line, XAxis, YAxis, CartesianGrid, BarChart, Bar,
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
      const nowIso = new Date().toISOString();
      const [pending, approved, users, perms, companiesCount, subsCount, txns, companies, jobs] = await Promise.all([
        supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "approved"),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("page_permissions").select("id", { count: "exact", head: true }),
        supabase.from("companies").select("id", { count: "exact", head: true }),
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("active", true),
        supabase.from("payment_transactions").select("amount, status, created_at, method, company_id"),
        supabase.from("companies").select("id, name, created_at").order("created_at", { ascending: false }),
        supabase.from("jobs").select("id, status, company_id, created_at, expires_at, category, posting_type"),
      ]);

      const allJobs = jobs.data ?? [];
      const allCompanies = companies.data ?? [];
      const allTxns = txns.data ?? [];
      const confirmed = allTxns.filter((t) => ["confirmed", "approved", "completed"].includes(t.status as string));
      const totalRevenue = confirmed.reduce((s, t) => s + Number(t.amount ?? 0), 0);

      // Top companies by jobs posted
      const jobsByCompany = new Map<string, number>();
      allJobs.forEach((j) => { if (j.company_id) jobsByCompany.set(j.company_id, (jobsByCompany.get(j.company_id) ?? 0) + 1); });
      const companyJobs = allCompanies
        .map((c) => ({ name: c.name, jobs: jobsByCompany.get(c.id) ?? 0 }))
        .sort((a, b) => b.jobs - a.jobs)
        .slice(0, 8);

      // Companies registered per month (last 6)
      const months: { key: string; label: string; companies: number; jobs: number; revenue: number }[] = [];
      const today = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        months.push({ key, label: d.toLocaleString(undefined, { month: "short" }), companies: 0, jobs: 0, revenue: 0 });
      }
      const bucket = (iso: string) => {
        const d = new Date(iso);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        return months.find((m) => m.key === key);
      };
      allCompanies.forEach((c) => { const m = bucket(c.created_at); if (m) m.companies++; });
      allJobs.forEach((j) => { const m = bucket(j.created_at); if (m) m.jobs++; });
      confirmed.forEach((t) => { const m = bucket(t.created_at as string); if (m) m.revenue += Number(t.amount ?? 0); });

      const activeJobs = allJobs.filter((j) => j.status === "approved" && (!j.expires_at || j.expires_at >= nowIso)).length;
      const expiredJobs = allJobs.filter((j) => j.expires_at && j.expires_at < nowIso).length;

      return {
        pending: pending.count ?? 0, approved: approved.count ?? 0,
        users: users.count ?? 0, perms: perms.count ?? 0,
        companies: companiesCount.count ?? 0,
        activeSubs: subsCount.count ?? 0,
        totalRevenue, activeJobs, expiredJobs,
        companyJobs, months,
        recentTxns: allTxns.slice(0, 6),
      };
    },
  });

  const tiles = [
    { label: "Registered companies", value: data?.companies ?? "—", icon: Briefcase, color: "from-primary/15 to-primary/5 text-primary" },
    { label: "Active jobs", value: data?.activeJobs ?? "—", icon: ClipboardCheck, color: "from-emerald-100 to-emerald-50 text-emerald-700" },
    { label: "Expired jobs", value: data?.expiredJobs ?? "—", icon: CircleAlert, color: "from-amber-100 to-amber-50 text-amber-700" },
    { label: "Registered users", value: data?.users ?? "—", icon: Users, color: "from-blue-100 to-blue-50 text-blue-700" },
    { label: "Pending review", value: data?.pending ?? "—", icon: ClipboardCheck, color: "from-warning/15 to-warning/5 text-warning-foreground" },
    { label: "Approved jobs", value: data?.approved ?? "—", icon: Briefcase, color: "from-primary/15 to-primary/5 text-primary" },
    { label: "Active subscriptions", value: data?.activeSubs ?? "—", icon: CalendarClock, color: "from-gold/20 to-gold/5 text-gold-foreground" },
    { label: "Page grants", value: data?.perms ?? "—", icon: ShieldCheck, color: "from-gold/20 to-gold/5 text-gold-foreground" },
  ];

  if (!data) return <div className="h-64 rounded-2xl bg-white ring-1 ring-black/5 animate-pulse" />;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => <KpiTile key={t.label} {...t} />)}
      </div>

      {/* Revenue summary */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total platform revenue</p>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-primary/15 to-primary/5 text-primary"><Wallet className="h-4 w-4" /></span>
          </div>
          <p className="mt-3 font-display text-3xl font-bold text-ink">
            ${data.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Confirmed payments across all companies and jobseekers.</p>
        </div>
        <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active subscriptions</p>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-gold/20 to-gold/5 text-gold-foreground"><CalendarClock className="h-4 w-4" /></span>
          </div>
          <p className="mt-3 font-display text-3xl font-bold text-ink">{data.activeSubs}</p>
          <p className="text-xs text-muted-foreground mt-1">Currently active subscription records.</p>
        </div>
      </div>

      {/* Bar chart: companies + jobs by month */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Registered companies & jobs (6 months)" icon={ChartPie}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.months} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="companies" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="jobs" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top companies by jobs posted" icon={Briefcase}>
          {data.companyJobs.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.companyJobs} layout="vertical" margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                <Tooltip />
                <Bar dataKey="jobs" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Revenue trend */}
      <ChartCard title="Monthly revenue trend" icon={LineIcon}>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data.months} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
            <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Reports — KPI table across companies */}
      <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <p className="font-display font-semibold text-ink">Reports — companies comparison</p>
          <span className="text-xs text-muted-foreground">Top {data.companyJobs.length} by activity</span>
        </div>
        {data.companyJobs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No company activity yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-secondary/40">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold">Company</th>
                <th className="px-3 py-2 font-semibold text-right">Jobs posted</th>
              </tr>
            </thead>
            <tbody>
              {data.companyJobs.map((c) => (
                <tr key={c.name} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2">{c.name}</td>
                  <td className="px-3 py-2 text-right font-semibold">{c.jobs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
                  <p className="text-xs text-muted-foreground">{new Date(t.created_at as string).toLocaleString()}</p>
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
