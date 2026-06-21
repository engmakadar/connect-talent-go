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
      const [pending, approved, users, perms, companiesCount, subsCount, txns, companies, jobs, subs, profiles] = await Promise.all([
        supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "approved"),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("page_permissions").select("id", { count: "exact", head: true }),
        supabase.from("companies").select("id", { count: "exact", head: true }),
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("active", true),
        supabase.from("payment_transactions").select("amount, status, created_at, method, company_id"),
        supabase.from("companies").select("id, name, created_at, verification_status, suspended").order("created_at", { ascending: false }),
        supabase.from("jobs").select("id, status, company_id, created_at, expires_at, category, posting_type"),
        supabase.from("subscriptions").select("id, company_id, plan, active, valid_until, created_at"),
        supabase.from("profiles").select("id, company_id"),
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
        allProfiles: profiles.data ?? [],
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
    const expiredByCompany = new Map<string, number>();
    const rejectedByCompany = new Map<string, number>();
    jobs.forEach((j) => {
      if (!j.company_id) return;
      jobsByCompany.set(j.company_id, (jobsByCompany.get(j.company_id) ?? 0) + 1);
      if (j.status === "approved") approvedByCompany.set(j.company_id, (approvedByCompany.get(j.company_id) ?? 0) + 1);
      if (j.status === "rejected") rejectedByCompany.set(j.company_id, (rejectedByCompany.get(j.company_id) ?? 0) + 1);
      if (j.expires_at && j.expires_at < data.nowIso) {
        expiredByCompany.set(j.company_id, (expiredByCompany.get(j.company_id) ?? 0) + 1);
      }
    });
    const companyJobs = data.allCompanies
      .map((c) => ({ name: c.name, jobs: jobsByCompany.get(c.id) ?? 0 }))
      .sort((a, b) => b.jobs - a.jobs)
      .slice(0, 8);

    // Subscriptions per company (all-time, not scoped — these summarize the company itself)
    const subsByCompany = new Map<string, typeof data.allSubs>();
    data.allSubs.forEach((s) => {
      if (!s.company_id) return;
      const arr = subsByCompany.get(s.company_id) ?? [];
      arr.push(s);
      subsByCompany.set(s.company_id, arr);
    });
    // Users per company
    const usersByCompany = new Map<string, number>();
    data.allProfiles.forEach((p) => {
      if (!p.company_id) return;
      usersByCompany.set(p.company_id, (usersByCompany.get(p.company_id) ?? 0) + 1);
    });

    // Companies comparison rows
    const compRows = data.allCompanies.map((c) => {
      const total = jobsByCompany.get(c.id) ?? 0;
      const companySubs = (subsByCompany.get(c.id) ?? []).slice().sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const recent = companySubs[0];
      const vstatus = (c as { verification_status?: string | null; suspended?: boolean }).verification_status ?? "pending";
      const suspended = (c as { suspended?: boolean }).suspended === true;
      const status: "active" | "pending" | "rejected" =
        suspended || vstatus === "rejected" ? "rejected"
        : vstatus === "verified" || vstatus === "approved" || vstatus === "active" ? "active"
        : "pending";
      return {
        id: c.id,
        name: c.name,
        jobs: total,
        premium: premiumCompanyIds.has(c.id),
        registered: c.created_at,
        expiredPositions: expiredByCompany.get(c.id) ?? 0,
        rejectedPositions: rejectedByCompany.get(c.id) ?? 0,
        subsCount: companySubs.length,
        recentSubDate: recent?.created_at ?? null,
        recentSubExpires: recent?.valid_until ?? null,
        userCount: usersByCompany.get(c.id) ?? 0,
        status,
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

  const pairs: KpiPairProps[] = [
    {
      a: { label: "Registered companies", value: data.companies, icon: Building2, sub: "Organizational signups", trend: view.trends.companies, trendLabel: "vs prev" },
      b: { label: "Registered users", value: data.users, icon: Users, sub: "Candidate signups", trend: view.trends.users, trendLabel: "MoM" },
    },
    {
      a: { label: "Active jobs", value: view.activeJobs, icon: ClipboardCheck, sub: "Currently hiring positions", trend: view.trends.jobs, trendLabel: "vs prev" },
      b: { label: "Expired jobs", value: view.expiredJobs, icon: CircleAlert, sub: "Archived listings", trend: 0, trendLabel: "rate" },
    },
    {
      a: { label: "Approved jobs", value: data.approved, icon: BadgeCheck, sub: "Live platform matches", trend: view.trends.jobs, trendLabel: "expansion" },
      b: { label: "Pending review", value: data.pending, icon: ClipboardCheck, sub: "Awaiting evaluation", trend: 0, trendLabel: "pending" },
    },
    {
      a: { label: "Active subscriptions", value: view.activeSubsScoped || data.activeSubs, icon: CalendarClock, sub: "Locked member access", trend: 0, trendLabel: "Steady" },
      b: { label: "Platform revenue", value: `$${view.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, icon: Wallet, sub: "Confirmed payments", trend: view.trends.revenue, trendLabel: "vs prev" },
    },
    {
      a: { label: "Page grants", value: data.perms, icon: ShieldCheck, sub: "External authorizations", trend: 15, trendLabel: "scope" },
      b: { label: "Active partners", value: view.activePartners, icon: Crown, sub: "Premium partnerships", trend: 0, trendLabel: "High engage" },
    },
  ];

  const filteredRows = view.compRows.filter((r) => !search.trim() || r.name.toLowerCase().includes(search.toLowerCase()));

  function exportCSV() {
    const header = ["Company name", "Jobs posted", "Expired positions", "Rejected positions", "Subscriptions", "Recent sub date", "Recent sub expires", "Users", "Premium access", "Status", "Registered"].join(",");
    const lines = filteredRows.map((r) => [
      JSON.stringify(r.name), r.jobs, r.expiredPositions, r.rejectedPositions, r.subsCount,
      r.recentSubDate ? new Date(r.recentSubDate).toISOString().slice(0, 10) : "",
      r.recentSubExpires ? new Date(r.recentSubExpires).toISOString().slice(0, 10) : "",
      r.userCount, r.premium ? "PREMIUM" : "FREE", r.status.toUpperCase(),
      new Date(r.registered).toISOString().slice(0, 10),
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

      {/* 5 KPI cards, each with a toggle between two related metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {pairs.map((p, i) => <KpiPairCard key={i} {...p} />)}
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
              <Bar dataKey="companies" fill={CHART_GREEN} radius={[4, 4, 0, 0]} />
              <Bar dataKey="jobs" fill={CHART_ORANGE} radius={[4, 4, 0, 0]} />
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
                <Bar dataKey="jobs" fill={CHART_GREEN} radius={[0, 4, 4, 0]} />
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
            <Line yAxisId="left" type="monotone" dataKey="companies" stroke={CHART_GREEN} strokeWidth={2.5} dot={{ r: 3 }} />
            <Line yAxisId="left" type="monotone" dataKey="jobs" stroke={CHART_ORANGE} strokeWidth={2.5} dot={{ r: 3 }} />
            <Line yAxisId="right" type="monotone" dataKey="revenue" stroke={CHART_BLUE} strokeWidth={2.5} dot={{ r: 3 }} />
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
              <Line type="monotone" dataKey="jobPost" name="Jobs" stroke={CHART_GREEN} strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="tender" name="Tenders" stroke={CHART_ORANGE} strokeWidth={2.5} strokeDasharray="5 5" dot={{ r: 3 }} />
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
                <Bar dataKey="value" name="Positions" fill={CHART_GREEN} radius={[0, 4, 4, 0]} />
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
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1100px]">
                <thead className="border-b border-black/5 bg-secondary/30">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5 font-semibold">Company name</th>
                    <th className="px-4 py-2.5 font-semibold">Jobs</th>
                    <th className="px-4 py-2.5 font-semibold">Expired positions</th>
                    <th className="px-4 py-2.5 font-semibold">Rejected positions</th>
                    <th className="px-4 py-2.5 font-semibold">Subscriptions</th>
                    <th className="px-4 py-2.5 font-semibold">Recent sub</th>
                    <th className="px-4 py-2.5 font-semibold">Sub expires</th>
                    <th className="px-4 py-2.5 font-semibold">Users</th>
                    <th className="px-4 py-2.5 font-semibold">Premium</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold">Registered</th>
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
                      <td className="px-4 py-3 font-semibold text-ink tabular-nums">{r.jobs}</td>
                      <td className="px-4 py-3 tabular-nums text-ink">{r.expiredPositions}</td>
                      <td className="px-4 py-3 tabular-nums text-ink">{r.rejectedPositions}</td>
                      <td className="px-4 py-3 tabular-nums text-ink">{r.subsCount}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                        {r.recentSubDate ? new Date(r.recentSubDate).toISOString().slice(0, 10) : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                        {r.recentSubExpires ? new Date(r.recentSubExpires).toISOString().slice(0, 10) : "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-ink">{r.userCount}</td>
                      <td className="px-4 py-3">
                        {r.premium ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold-foreground">
                            <Crown className="h-3 w-3" /> Premium
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-secondary/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Free</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {r.status === "active" ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">Active</span>
                        ) : r.status === "rejected" ? (
                          <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700">Rejected</span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">Pending</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">{new Date(r.registered).toISOString().slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
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

type KpiSide = { label: string; value: number | string; icon: typeof Briefcase; sub: string; trend: number; trendLabel: string };
type KpiPairProps = { a: KpiSide; b: KpiSide };

function KpiPairCard({ a, b }: KpiPairProps) {
  const [side, setSide] = useState<"a" | "b">("a");
  const active = side === "a" ? a : b;
  const Icon = active.icon;
  const up = active.trend > 0;
  const down = active.trend < 0;
  // Light-green accent for side A, light-blue for side B per dashboard theme.
  const accent = side === "a"
    ? "from-primary/15 to-primary/5 text-primary"
    : "from-sky-100 to-sky-50 text-sky-700";
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground leading-tight">{active.label}</p>
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br ${accent}`}><Icon className="h-3.5 w-3.5" /></span>
      </div>
      <p className="mt-2 font-display text-2xl font-bold text-ink leading-none">{active.value}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[10px] text-muted-foreground truncate">{active.sub}</p>
        {active.trend !== 0 ? (
          <span className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
            up ? "bg-emerald-100 text-emerald-700" : down ? "bg-rose-100 text-rose-700" : "bg-secondary/60 text-muted-foreground"
          }`}>
            {up && <TrendingUp className="h-2.5 w-2.5" />}{down && <TrendingDown className="h-2.5 w-2.5" />}
            {up ? "+" : ""}{active.trend}% {active.trendLabel}
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center rounded-full bg-secondary/60 px-1.5 py-0.5 text-[9px] font-bold uppercase text-muted-foreground">{active.trendLabel}</span>
        )}
      </div>

      {/* Toggle between the two related KPIs */}
      <div className="mt-3 flex items-center justify-between gap-2 rounded-full bg-secondary/50 p-0.5">
        <button
          type="button"
          onClick={() => setSide("a")}
          className={`flex-1 truncate rounded-full px-2 py-1 text-[10px] font-semibold transition ${
            side === "a" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-ink"
          }`}
          title={a.label}
        >{a.label}</button>
        <button
          type="button"
          onClick={() => setSide("b")}
          className={`flex-1 truncate rounded-full px-2 py-1 text-[10px] font-semibold transition ${
            side === "b" ? "bg-sky-500 text-white shadow-sm" : "text-muted-foreground hover:text-ink"
          }`}
          title={b.label}
        >{b.label}</button>
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

const CHART_GREEN = "#6CC24A";
const CHART_ORANGE = "#F57C00";
const CHART_BLUE = "#42A5F5";
const CHART_PURPLE = "#AB47BC";
const CHART_RED = "#EF5350";
const CHART_CYAN = "#26C6DA";
const CHART_AMBER = "#FFCA28";
const CHART_BROWN = "#8D6E63";
const PIE_COLORS = [CHART_GREEN, CHART_ORANGE, CHART_BLUE, CHART_PURPLE, CHART_RED, CHART_CYAN, CHART_AMBER, CHART_BROWN];

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

  const tiles = useMemo(() => {
    if (!data) return [];
    return [
      { label: "Total positions", value: data.kpis.total, icon: Briefcase, color: "from-primary/15 to-primary/5 text-primary" },
      { label: "Active positions", value: data.kpis.active, icon: ClipboardCheck, color: "from-emerald-100 to-emerald-50 text-emerald-700" },
      { label: "Expired positions", value: data.kpis.expired, icon: CircleAlert, color: "from-amber-100 to-amber-50 text-amber-700" },
      { label: "Team users", value: data.kpis.team, icon: Users, color: "from-blue-100 to-blue-50 text-blue-700" },
      { label: "Total subscribed", value: `$${data.totalSubscribed.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`, icon: Wallet, color: "from-primary/15 to-primary/5 text-primary" },
      { label: "Subscriptions", value: data.subscriptionCount, icon: CalendarClock, color: "from-gold/20 to-gold/5 text-gold-foreground" },
    ];
  }, [data]);

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
      {/* KPI row — all 6 in one line */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => <KpiTile key={t.label} {...t} />)}
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
              <Line type="monotone" dataKey="count" stroke={CHART_GREEN} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
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
