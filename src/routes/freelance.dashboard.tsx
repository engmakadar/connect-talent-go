import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import {
  Briefcase, Wallet, FileText, TrendingUp, Search, Star, Plus, UserRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/freelance/dashboard")({
  head: () => ({
    meta: [
      { title: "Freelancer dashboard — SahanJobs" },
      { name: "description", content: "Track active contracts, contract history, earnings and billing, and find new freelance work." },
      { property: "og:title", content: "Freelancer dashboard — SahanJobs" },
      { property: "og:description", content: "Active contracts, contract history, earnings and billing in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FreelanceDashboard,
});

const ACTIVE = new Set(["pending", "in_progress", "delivered"]);

function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-card p-5 ring-1 ring-black/5">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">{icon}</span>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function FreelanceDashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  const { data: profile } = useQuery({
    enabled: !!user,
    queryKey: ["freelancer-profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("freelancer_profiles").select("*").eq("user_id", user!.id).maybeSingle();
      return data;
    },
  });

  const { data } = useQuery({
    enabled: !!user,
    queryKey: ["freelance-contracts", user?.id],
    queryFn: async () => {
      const { data: orders } = await supabase
        .from("freelance_orders")
        .select("id, gig_id, client_id, price, currency, status, requirements, created_at, completed_at")
        .eq("freelancer_id", user!.id)
        .order("created_at", { ascending: false });
      const rows = orders ?? [];
      const gigIds = Array.from(new Set(rows.map((r) => r.gig_id)));
      const { data: gigs } = gigIds.length
        ? await supabase.from("freelance_gigs").select("id, title, rating_avg, rating_count").in("id", gigIds)
        : { data: [] };
      const byGig = new Map((gigs ?? []).map((g) => [g.id, g]));
      const clientIds = Array.from(new Set(rows.map((r) => r.client_id)));
      const { data: clients } = clientIds.length
        ? await supabase.from("profiles").select("id, full_name").in("id", clientIds)
        : { data: [] };
      const byClient = new Map((clients ?? []).map((c) => [c.id, c.full_name]));
      return rows.map((r) => ({
        ...r,
        gigTitle: byGig.get(r.gig_id)?.title ?? "Service",
        clientName: byClient.get(r.client_id) ?? "Client",
      }));
    },
  });

  const rows = data ?? [];
  const active = useMemo(() => rows.filter((r) => ACTIVE.has(r.status)), [rows]);
  const history = useMemo(() => rows.filter((r) => !ACTIVE.has(r.status)), [rows]);
  const earned = rows.filter((r) => r.status === "completed").reduce((s, r) => s + Number(r.price), 0);
  const pipeline = active.reduce((s, r) => s + Number(r.price), 0);
  const currency = rows[0]?.currency ?? "USD";

  const Table = ({ list }: { list: typeof rows }) => (
    list.length === 0 ? (
      <div className="rounded-2xl bg-card p-10 ring-1 ring-black/5 text-center text-sm text-muted-foreground">
        Nothing here yet.
      </div>
    ) : (
      <div className="overflow-x-auto rounded-2xl bg-card ring-1 ring-black/5">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Contract</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Started</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {list.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">
                  <Link to="/freelance/$gigId" params={{ gigId: r.gig_id }} className="font-medium text-ink hover:text-primary">
                    {r.gigTitle}
                  </Link>
                  {r.requirements && <p className="text-xs text-muted-foreground line-clamp-1">{r.requirements}</p>}
                </td>
                <td className="px-4 py-3 text-ink-soft">{r.clientName}</td>
                <td className="px-4 py-3 text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3"><Badge variant="outline" className="capitalize">{r.status.replace("_", " ")}</Badge></td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{r.currency} {Number(r.price).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  );

  return (
    <div className="min-h-screen flex flex-col bg-hero-band/30">
      <SiteHeader />
      <main className="flex-1 mx-auto w-full max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-bold text-ink">Freelancer dashboard</h1>
            <p className="text-sm text-muted-foreground">
              {profile?.title ? `${profile.title} · ` : ""}Contracts, earnings and billing at a glance.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline"><Link to="/freelance/profile"><UserRound className="h-4 w-4 mr-1" /> {profile ? "Edit profile" : "Create profile"}</Link></Button>
            <Button asChild variant="outline"><Link to="/freelance/new"><Plus className="h-4 w-4 mr-1" /> New service</Link></Button>
            <Button asChild><Link to="/jobs"><Search className="h-4 w-4 mr-1" /> Find work</Link></Button>
          </div>
        </div>

        {!profile && (
          <div className="mt-6 rounded-2xl bg-primary/5 p-5 ring-1 ring-primary/20 text-sm text-ink-soft">
            Complete your freelancer profile — summary, work experience and rate — so clients can hire you.{" "}
            <Link to="/freelance/profile" className="font-semibold text-primary underline">Set it up now</Link>.
          </div>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi icon={<Briefcase className="h-4 w-4" />} label="Active contracts" value={String(active.length)} sub={`${currency} ${pipeline.toLocaleString()} in pipeline`} />
          <Kpi icon={<FileText className="h-4 w-4" />} label="Contract history" value={String(history.length)} sub="Completed or closed" />
          <Kpi icon={<Wallet className="h-4 w-4" />} label="Total earnings" value={`${currency} ${earned.toLocaleString()}`} sub="From completed contracts" />
          <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Contracts won" value={String(rows.length)} sub="All time" />
        </div>

        <Tabs defaultValue="active" className="mt-8">
          <TabsList>
            <TabsTrigger value="active">Active contracts ({active.length})</TabsTrigger>
            <TabsTrigger value="history">Contract history ({history.length})</TabsTrigger>
            <TabsTrigger value="finance">Billing &amp; earnings</TabsTrigger>
          </TabsList>
          <TabsContent value="active" className="mt-4"><Table list={active} /></TabsContent>
          <TabsContent value="history" className="mt-4"><Table list={history} /></TabsContent>
          <TabsContent value="finance" className="mt-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Kpi icon={<Wallet className="h-4 w-4" />} label="Paid out" value={`${currency} ${earned.toLocaleString()}`} />
              <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Awaiting delivery" value={`${currency} ${pipeline.toLocaleString()}`} />
              <Kpi icon={<Star className="h-4 w-4" />} label="Average contract" value={`${currency} ${(rows.length ? Math.round((earned + pipeline) / rows.length) : 0).toLocaleString()}`} />
            </div>
            <div className="mt-4"><Table list={rows} /></div>
          </TabsContent>
        </Tabs>
      </main>
      <SiteFooter />
    </div>
  );
}
