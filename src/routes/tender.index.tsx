import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Search, MapPin, Calendar, Clock, Building2, FileText, Filter, Minus, Plus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { CompanyLogo } from "@/components/company-logo";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Database } from "@/integrations/supabase/types";

type Job = Database["public"]["Tables"]["jobs"]["Row"];

export const Route = createFileRoute("/tender/")({
  head: () => ({ meta: [{ title: "Browse Tenders — SahanJobs" }] }),
  component: TenderPage,
});

function TenderPage() {
  const [q, setQ] = useState("");
  const [organization, setOrganization] = useState("all");
  const [region, setRegion] = useState("all");
  const [category, setCategory] = useState<string>("all");

  const { data: companyMap } = useQuery({
    queryKey: ["tender-companies-map"],
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("id, logo_url, verification_status, suspended");
      const map = new Map<string, { id: string; logo_url: string | null; verification_status: string; suspended: boolean }>();
      (data ?? []).forEach((c) => map.set(c.id, c));
      return map;
    },
  });

  const { data: tenders, isLoading } = useQuery({
    queryKey: ["tender-list", !!companyMap],
    enabled: !!companyMap,
    queryFn: async () => {
      const client = supabase as unknown as { from: (t: string) => { select: (s: string) => { eq: (k: string, v: string) => { eq: (k: string, v: string) => { order: (k: string, o: { ascending: boolean }) => Promise<{ data: unknown; error: unknown }> } } } } };
      const { data, error } = await client
        .from("jobs_public").select("*")
        .eq("status", "approved").eq("posting_type", "tender")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as Job[]).filter((j) => {
        if (!j.company_id) return true;
        const c = companyMap!.get(j.company_id);
        return !c || (!c.suspended && c.verification_status !== "rejected");
      });
    },
  });

  const all = tenders ?? [];
  const now = Date.now();
  const source = all.filter((j) => !j.expires_at || new Date(j.expires_at).getTime() >= now);

  const categories = useMemo(() => Array.from(new Set(all.map((j) => j.category))).sort(), [all]);
  const organizations = useMemo(() => Array.from(new Set(all.map((j) => j.company))).sort(), [all]);
  const regions = useMemo(() => Array.from(new Set(all.map((j) => j.location.split(",").pop()?.trim() || j.location))).sort(), [all]);

  const filtered = useMemo(() => source.filter((j) => {
    if (q && !(j.title + j.company + j.location + j.category).toLowerCase().includes(q.toLowerCase())) return false;
    if (organization !== "all" && j.company !== organization) return false;
    if (region !== "all" && !j.location.toLowerCase().includes(region.toLowerCase())) return false;
    if (category !== "all" && j.category !== category) return false;
    return true;
  }), [source, q, organization, region, category]);

  return (
    <div className="min-h-screen flex flex-col bg-hero-band/40">
      <SiteHeader />

      <section className="bg-hero-band border-b border-black/5">
        <div className="mx-auto max-w-7xl px-4 md:px-8 py-8">
          <h1 className="font-display text-2xl md:text-3xl font-bold text-ink mb-4">Tenders & RFPs</h1>
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Search tenders by keyword, organization or location"
                className="pl-11 h-14 bg-white border-0 rounded-xl text-sm shadow-sm" />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 md:px-8 py-8 flex-1">
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <aside>
            <div className="sticky top-4 space-y-4">
              <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-sm">
                <div className="flex items-center justify-between"><h3 className="font-display font-bold text-ink">Filters</h3><Filter className="h-4 w-4 text-primary" /></div>
              </div>
              <FilterCard title="Category" defaultOpen>
                <RadioList name="category" value={category} onChange={setCategory}
                  options={[{ v: "all", l: "All categories" }, ...categories.map((c) => ({ v: c, l: c }))]} />
              </FilterCard>
              <FilterCard title="Region">
                <RadioList name="region" value={region} onChange={setRegion}
                  options={[{ v: "all", l: "All regions" }, ...regions.map((r) => ({ v: r, l: r }))]} />
              </FilterCard>
            </div>
          </aside>

          <div>
            <div className="flex flex-wrap items-center justify-end gap-3 mb-5">
              <Select value={organization} onValueChange={setOrganization}>
                <SelectTrigger className="h-10 rounded-full border bg-white px-5 text-sm font-medium w-auto min-w-[180px] shadow-sm">
                  <SelectValue placeholder="Organization" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All organizations</SelectItem>
                  {organizations.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <p className="text-sm text-ink mb-5">
              <span className="font-bold">{isLoading ? "—" : filtered.length}</span>{" "}
              <span className="text-muted-foreground">tenders match your filters.</span>
            </p>

            {isLoading ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 rounded-2xl bg-white ring-1 ring-black/5 animate-pulse" />)}</div>
            ) : !filtered.length ? (
              <div className="rounded-2xl bg-white p-16 text-center ring-1 ring-black/5">
                <FileText className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">No tenders currently open.</p>
              </div>
            ) : (
              <ul className="divide-y divide-black/5 rounded-2xl bg-white ring-1 ring-black/5 shadow-sm overflow-hidden">
                {filtered.map((j) => <TenderRow key={j.id} job={j} logoUrl={j.company_id ? companyMap?.get(j.company_id)?.logo_url ?? null : null} />)}
              </ul>
            )}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function TenderRow({ job, logoUrl }: { job: Job; logoUrl: string | null }) {
  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) : "—";
  return (
    <li>
      <Link to="/jobs/$jobId" params={{ jobId: job.id }} className="group block px-5 py-4 hover:bg-hero-band/40 transition-colors">
        <div className="flex gap-4">
          <CompanyLogo company={job.company} logoUrl={logoUrl} size={48} className="h-12 w-12 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-1.5">
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                <FileText className="h-3 w-3" /> Tender
              </span>
              <h3 className="font-display text-base md:text-lg font-bold text-primary group-hover:underline">{job.title}</h3>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
              <span><span className="font-bold text-ink">Organization:</span> {job.company}</span>
              <span className="text-muted-foreground/50">·</span>
              <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /><span className="font-bold text-ink">Posted</span> {fmt(job.created_at)}</span>
              <span className="text-muted-foreground/50">·</span>
              <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /><span className="font-bold text-ink">Closing:</span> {fmt(job.expires_at)}</span>
              <span className="text-muted-foreground/50">·</span>
              <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{job.location}</span>
              <span className="text-muted-foreground/50">·</span>
              <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{job.category}</span>
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}

function FilterCard({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-sm overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-secondary/30">
        <span className="grid h-5 w-5 place-items-center rounded-full border-2 border-primary text-primary">
          {open ? <Minus className="h-3 w-3" strokeWidth={3} /> : <Plus className="h-3 w-3" strokeWidth={3} />}
        </span>
        <span className="font-display font-bold text-ink">{title}</span>
      </button>
      {open && <div className="px-5 pb-5 pt-1 space-y-2.5">{children}</div>}
    </div>
  );
}

function RadioList({ name, value, onChange, options }: {
  name: string; value: string; onChange: (v: string) => void; options: { v: string; l: string }[];
}) {
  return (
    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
      {options.map((o) => (
        <label key={o.v} className="flex items-center gap-2.5 cursor-pointer text-sm text-ink-soft hover:text-ink">
          <span className="relative grid place-items-center h-4 w-4">
            <input type="radio" name={name} checked={value === o.v} onChange={() => onChange(o.v)} className="peer absolute inset-0 opacity-0 cursor-pointer" />
            <span className="h-4 w-4 rounded-full border-2 border-muted-foreground/40 peer-checked:border-primary" />
            <span className={`absolute h-2 w-2 rounded-full bg-primary transition-opacity ${value === o.v ? "opacity-100" : "opacity-0"}`} />
          </span>
          {o.l}
        </label>
      ))}
    </div>
  );
}
