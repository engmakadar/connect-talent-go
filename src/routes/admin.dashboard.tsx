import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AdminShell } from "@/components/admin-shell";
import {
  Briefcase, Users, ClipboardCheck, ShieldCheck, Wallet, CalendarClock,
  CircleAlert, ChartPie, LineChart as LineIcon, Filter, Crown, FileDown,
  FileJson, Search, Trash2, TrendingUp, TrendingDown, Building2, BadgeCheck,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  LineChart, Line, XAxis, YAxis, CartesianGrid, BarChart, Bar,
} from "recharts";

type ScopeKey = "all" | "30d" | "6m" | "ytd";
const SCOPES: { key: ScopeKey; label: string }[] = [
  { key: "all", label: "All Time" },
  { key: "30d", label: "Last 30 Days" },
  { key: "6m", label: "Last 6 Months" },
  { key: "ytd", label: "Year To Date" },
];
function scopeStart(scope: ScopeKey): Date | null {
  const now = new Date();
  if (scope === "30d") { const d = new Date(now); d.setDate(d.getDate() - 30); return d; }
  if (scope === "6m") { const d = new Date(now); d.setMonth(d.getMonth() - 6); return d; }
  if (scope === "ytd") return new Date(now.getFullYear(), 0, 1);
  return null;
}

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
  const [scope, setScope] = useState<ScopeKey>("all");
  const [tab, setTab] = useState<"companies" | "subs">("companies");
  const [search, setSearch] = useState("");

  const { data } = useQuery({
    queryKey: ["admin-overview-stats"],
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const [pending, approved, users, perms, companiesCount, subsCount, txns, companies, jobs, subs] = await Promise.all([
        supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "approved"),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("page_permissions").select("id", { count: "exact", head: true }),
        supabase.from("companies").select("id", { count: "exact", head: true }),
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("active", true),
        supabase.from("payment_transactions").select("amount, status, created_at, method, company_id"),
        supabase.from("companies").select("id, name, created_at").order("created_at", { ascending: false }),
        supabase.from("jobs").select("id, status, company_id, created_at, expires_at, category, posting_type"),
        supabase.from("subscriptions").select("id, company_id, plan, active, valid_until, created_at"),
      ]);

      return {
        pending: pending.count ?? 0,
        approved: approved.count ?? 0,
        users: users.count ?? 0,
        perms: perms.count ?? 0,
        companies: companiesCount.count ?? 0,
        activeSubs: subsCount.count ?? 0,
        allTxns: txns.data ?? [],
        allCompanies: companies.data ?? [],
        allJobs: jobs.data ?? [],
        allSubs: subs.data ?? [],
        nowIso,
      };
    },
  });

  const view = useMemo(() => {
    if (!data) return null;
    const start = scopeStart(scope);
    const inScope = (iso: string | null | undefined) => !iso ? false : (start ? new Date(iso) >= start : true);

    const jobs = scope === "all" ? data.allJobs : data.allJobs.filter((j) => inScope(j.created_at));
    const companies = scope === "all" ? data.allCompanies : data.allCompanies.filter((c) => inScope(c.created_at));
    const txns = scope === "all" ? data.allTxns : data.allTxns.filter((t) => inScope(t.created_at as string));
    const subs = scope === "all" ? data.allSubs : data.allSubs.filter((s) => inScope(s.created_at));

    const confirmed = txns.filter((t) => ["confirmed", "approved", "completed"].includes(t.status as string));
    const totalRevenue = confirmed.reduce((s, t) => s + Number(t.amount ?? 0), 0);

    const activeSubsScoped = subs.filter((s) => s.active).length;
    const premiumCompanyIds = new Set(
      data.allSubs.filter((s) => s.active && /premium|pro|gold|enterprise/i.test(s.plan ?? "")).map((s) => s.company_id),
    );
    const activePartners = premiumCompanyIds.size;

    // Top companies by jobs posted (scoped)
    const jobsByCompany = new Map<string, number>();
    const approvedByCompany = new Map<string, number>();
    jobs.forEach((j) => {
      if (!j.company_id) return;
      jobsByCompany.set(j.company_id, (jobsByCompany.get(j.company_id) ?? 0) + 1);
      if (j.status === "approved") approvedByCompany.set(j.company_id, (approvedByCompany.get(j.company_id) ?? 0) + 1);
    });
    const companyJobs = data.allCompanies
      .map((c) => ({ name: c.name, jobs: jobsByCompany.get(c.id) ?? 0 }))
      .sort((a, b) => b.jobs - a.jobs)
      .slice(0, 8);

    // Companies comparison rows
    const compRows = data.allCompanies.map((c) => {
      const total = jobsByCompany.get(c.id) ?? 0;
      const ok = approvedByCompany.get(c.id) ?? 0;
      const rate = total > 0 ? Math.round((ok / total) * 100) : 0;
      return {
        id: c.id,
        name: c.name,
        jobs: total,
        rate,
        premium: premiumCompanyIds.has(c.id),
        registered: c.created_at,
      };
    }).sort((a, b) => b.jobs - a.jobs);

    // Months series
    const months: { key: string; label: string; companies: number; jobs: number; revenue: number; tender: number; jobPost: number }[] = [];
    const today = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, label: d.toLocaleString(undefined, { month: "short" }), companies: 0, jobs: 0, revenue: 0, tender: 0, jobPost: 0 });
    }
    const bucket = (iso: string) => {
      const d = new Date(iso);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return months.find((m) => m.key === key);
    };
    companies.forEach((c) => { const m = bucket(c.created_at); if (m) m.companies++; });
    jobs.forEach((j) => {
      const m = bucket(j.created_at);
      if (m) {
        m.jobs++;
        if ((j as { posting_type?: string }).posting_type === "tender") m.tender++;
        else m.jobPost++;
      }
    });
    confirmed.forEach((t) => { const m = bucket(t.created_at as string); if (m) m.revenue += Number(t.amount ?? 0); });

    const categoryMap = new Map<string, number>();
    jobs.forEach((j) => {
      const c = (j as { category?: string | null }).category;
      if (c) categoryMap.set(c, (categoryMap.get(c) ?? 0) + 1);
    });
    const byCategory = Array.from(categoryMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    const activeJobs = jobs.filter((j) => j.status === "approved" && (!j.expires_at || j.expires_at >= data.nowIso)).length;
    const expiredJobs = jobs.filter((j) => j.expires_at && j.expires_at < data.nowIso).length;

    // Trend % vs previous equal period
    const prevDelta = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return Math.round(((curr - prev) / prev) * 100);
    };
    let prevStart: Date | null = null, prevEnd: Date | null = null;
    if (start) {
      const span = Date.now() - start.getTime();
      prevEnd = start;
      prevStart = new Date(start.getTime() - span);
    }
    const inPrev = (iso: string | null | undefined) =>
      !!iso && prevStart && prevEnd ? (new Date(iso) >= prevStart && new Date(iso) < prevEnd) : false;
    const prevCompanies = prevStart ? data.allCompanies.filter((c) => inPrev(c.created_at)).length : 0;
    const prevJobs = prevStart ? data.allJobs.filter((j) => inPrev(j.created_at)).length : 0;
    const prevUsers = 0; // profiles created_at not loaded — neutral
    const prevRevenue = prevStart ? data.allTxns
      .filter((t) => ["confirmed", "approved", "completed"].includes(t.status as string) && inPrev(t.created_at as string))
      .reduce((s, t) => s + Number(t.amount ?? 0), 0) : 0;

    return {
      totalRevenue, activeJobs, expiredJobs,
      companyJobs, months, byCategory,
      compRows,
      activeSubsScoped,
      activePartners,
      recentTxns: txns.slice(0, 10),
      trends: {
        companies: prevDelta(companies.length, prevCompanies),
        jobs: prevDelta(jobs.length, prevJobs),
        users: prevUsers,
        revenue: prevDelta(totalRevenue, prevRevenue),
      },
    };
  }, [data, scope]);

  if (!data || !view) return <div className="h-64 rounded-2xl bg-white ring-1 ring-black/5 animate-pulse" />;

  const tiles = [
    { label: "Registered companies", value: data.companies, icon: Building2, color: "from-primary/15 to-primary/5 text-primary", sub: "Participating agencies", trend: view.trends.companies, trendLabel: scope === "all" ? "this period" : "vs prev" },
    { label: "Active jobs", value: view.activeJobs, icon: ClipboardCheck, color: "from-emerald-100 to-emerald-50 text-emerald-700", sub: "Currently hiring positions", trend: view.trends.jobs, trendLabel: "vs prev" },
    { label: "Expired jobs", value: view.expiredJobs, icon: CircleAlert, color: "from-amber-100 to-amber-50 text-amber-700", sub: "Archived applications", trend: 0, trendLabel: "rate" },
    { label: "Registered users", value: data.users, icon: Users, color: "from-blue-100 to-blue-50 text-blue-700", sub: "Candidate signups", trend: view.trends.users, trendLabel: "MoM" },
    { label: "Pending review", value: data.pending, icon: ClipboardCheck, color: "from-warning/15 to-warning/5 text-warning-foreground", sub: "Requires evaluation", trend: 0, trendLabel: "pending" },
    { label: "Approved jobs", value: data.approved, icon: BadgeCheck, color: "from-primary/15 to-primary/5 text-primary", sub: "Live platform matches", trend: view.trends.jobs, trendLabel: "expansion" },
    { label: "Active subscriptions", value: view.activeSubsScoped || data.activeSubs, icon: CalendarClock, color: "from-gold/20 to-gold/5 text-gold-foreground", sub: "Locked member access", trend: 0, trendLabel: "Steady stream" },
    { label: "Page grants", value: data.perms, icon: ShieldCheck, color: "from-gold/20 to-gold/5 text-gold-foreground", sub: "Visual authorizations", trend: 15, trendLabel: "scope" },
    { label: "Platform revenue", value: `$${view.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, icon: Wallet, color: "from-primary/15 to-primary/5 text-primary", sub: "Confirmed payments", trend: view.trends.revenue, trendLabel: "vs prev" },
    { label: "Active partners", value: view.activePartners, icon: Crown, color: "from-gold/20 to-gold/5 text-gold-foreground", sub: "Gold premium rosters", trend: 0, trendLabel: "High Engage" },
  ];

  const filteredRows = view.compRows.filter((r) => !search.trim() || r.name.toLowerCase().includes(search.toLowerCase()));

  function exportCSV() {
    const header = ["Company name", "Jobs posted", "Response rate %", "Premium access", "Registered"].join(",");
    const lines = filteredRows.map((r) => [
      JSON.stringify(r.name), r.jobs, r.rate, r.premium ? "PREMIUM" : "FREE", new Date(r.registered).toISOString().slice(0, 10),
    ].join(","));
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `companies-comparison-${scope}.csv`; a.click();
    URL.revokeObjectURL(url);
  }
  function exportJSON() {
    const d = data!; const v = view!;
    const payload = { scope, generated_at: new Date().toISOString(), totals: { companies: d.companies, users: d.users, activeJobs: v.activeJobs, expiredJobs: v.expiredJobs, revenue: v.totalRevenue, activeSubscriptions: v.activeSubsScoped, activePartners: v.activePartners }, companies: filteredRows, months: v.months };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `platform-report-${scope}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Metrics scope filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-3 ring-1 ring-black/5 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Filter className="h-4 w-4 text-primary" /> Metrics scope filter
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Select Period:</span>
          {SCOPES.map((s) => (
            <button
              key={s.key}
              onClick={() => setScope(s.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                scope === s.key ? "bg-primary text-primary-foreground shadow" : "bg-secondary/60 text-ink hover:bg-secondary"
              }`}
            >{s.label}</button>
          ))}
        </div>
      </div>

      {/* KPI tiles 5x2 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {tiles.map((t) => <KpiTileRich key={t.label} {...t} />)}
      </div>

      {/* Bar chart: companies + jobs by month */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Registered companies & jobs (6 months)" subtitle="Multi-series monthly overview" icon={ChartPie}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={view.months} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
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

        <ChartCard title="Top companies by jobs posted" subtitle="Leaderboard based on job count" icon={Briefcase}>
          {view.companyJobs.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={view.companyJobs} layout="vertical" margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
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

      {/* Monthly distribution — multi-line */}
      <ChartCard title="Monthly distribution (companies, jobs, revenue)" subtitle="Consolidated platform scale curves" icon={LineIcon}>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={view.months} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 12 }} allowDecimals={false} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line yAxisId="left" type="monotone" dataKey="companies" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3 }} />
            <Line yAxisId="left" type="monotone" dataKey="jobs" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3 }} />
            <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Job source trending (jobs vs tenders)" subtitle="Comparing active sourcing origins" icon={LineIcon}>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={view.months} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="jobPost" name="Jobs" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="tender" name="Tenders" stroke="#f59e0b" strokeWidth={2.5} strokeDasharray="5 5" dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Positions by category" subtitle="Breakdown of operational sectors" icon={ChartPie}>
          {view.byCategory.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={view.byCategory} layout="vertical" margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={130} />
                <Tooltip />
                <Bar dataKey="value" name="Positions" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Companies Comparison + Recent Subscription Activity */}
      <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 p-3">
          <div className="flex items-center gap-2">
            <TabBtn active={tab === "companies"} onClick={() => setTab("companies")} icon={Building2} label="Companies Comparison" count={filteredRows.length} />
            <TabBtn active={tab === "subs"} onClick={() => setTab("subs")} icon={CalendarClock} label="Recent Subscription Activity" count={view.recentTxns.length} />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportCSV} className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-secondary/40">
              <FileDown className="h-3.5 w-3.5" /> Export CSV
            </button>
            <button onClick={exportJSON} className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-secondary/40">
              <FileJson className="h-3.5 w-3.5" /> JSON Report
            </button>
          </div>
        </div>

        {tab === "companies" ? (
          <div>
            <div className="border-b border-black/5 p-3">
              <div className="relative max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search company…"
                  className="w-full rounded-lg border border-black/10 bg-secondary/20 py-1.5 pl-8 pr-3 text-sm outline-none focus:border-primary/40 focus:bg-white"
                />
              </div>
            </div>
            {filteredRows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-10 text-center">No companies yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-black/5 bg-secondary/30">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5 font-semibold">Company name</th>
                    <th className="px-4 py-2.5 font-semibold">Jobs posted</th>
                    <th className="px-4 py-2.5 font-semibold">Response rate</th>
                    <th className="px-4 py-2.5 font-semibold">Premium access</th>
                    <th className="px-4 py-2.5 font-semibold">Registered</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r) => (
                    <tr key={r.id} className="border-b border-black/5 last:border-0 hover:bg-secondary/20">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                            {r.name?.[0]?.toUpperCase() ?? "?"}
                          </span>
                          <span className="font-medium text-ink">{r.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-ink">{r.jobs}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 max-w-[180px]">
                          <div className="h-1.5 flex-1 rounded-full bg-secondary/60 overflow-hidden">
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${r.rate}%` }} />
                          </div>
                          <span className="text-xs font-semibold text-ink tabular-nums">{r.rate}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {r.premium ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold-foreground">
                            <Crown className="h-3 w-3" /> Premium
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-secondary/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Free</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">{new Date(r.registered).toISOString().slice(0, 10)}</td>
                      <td className="px-4 py-3 text-right">
                        <button className="inline-grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary/60 hover:text-ink" title="Archive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="p-3">
            {view.recentTxns.length === 0 ? (
              <p className="text-sm text-muted-foreground py-10 text-center">No subscription activity yet.</p>
            ) : (
              <ul className="divide-y divide-black/5">
                {view.recentTxns.map((t, i) => (
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
        )}
      </div>
    </div>
  );
}

function KpiTileRich({ label, value, icon: Icon, color, sub, trend, trendLabel }: {
  label: string; value: number | string; icon: typeof Briefcase; color: string; sub: string; trend: number; trendLabel: string;
}) {
  const up = trend > 0;
  const down = trend < 0;
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground leading-tight">{label}</p>
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br ${color}`}><Icon className="h-3.5 w-3.5" /></span>
      </div>
      <p className="mt-2 font-display text-2xl font-bold text-ink leading-none">{value}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[10px] text-muted-foreground truncate">{sub}</p>
        {trend !== 0 ? (
          <span className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
            up ? "bg-emerald-100 text-emerald-700" : down ? "bg-rose-100 text-rose-700" : "bg-secondary/60 text-muted-foreground"
          }`}>
            {up && <TrendingUp className="h-2.5 w-2.5" />}{down && <TrendingDown className="h-2.5 w-2.5" />}
            {up ? "+" : ""}{trend}% {trendLabel}
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center rounded-full bg-secondary/60 px-1.5 py-0.5 text-[9px] font-bold uppercase text-muted-foreground">{trendLabel}</span>
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label, count }: { active: boolean; onClick: () => void; icon: typeof Briefcase; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
        active ? "bg-primary/10 text-primary ring-1 ring-primary/20" : "text-muted-foreground hover:bg-secondary/40 hover:text-ink"
      }`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
      <span className={`grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold ${active ? "bg-primary/20 text-primary" : "bg-secondary/60 text-muted-foreground"}`}>{count}</span>
    </button>
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

function ChartCard({ title, subtitle, icon: Icon, children }: { title: string; subtitle?: string; icon: typeof Briefcase; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-sm">
      <div className="flex items-start gap-2 mb-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Icon className="h-3.5 w-3.5" /></span>
        <div className="min-w-0">
          <p className="font-display font-semibold text-ink leading-tight">{title}</p>
          {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function EmptyChart() {
  return <div className="h-[280px] grid place-items-center text-sm text-muted-foreground">No data yet.</div>;
}
