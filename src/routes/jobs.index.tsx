import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Search, MapPin, Calendar, Clock, Briefcase, Building2, Filter,
  ChevronDown, ChevronUp, Minus, Plus, FileText,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { CompanyLogo } from "@/components/company-logo";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatEmploymentType } from "@/lib/format";
import { SaveJobButton } from "@/components/save-job-button";
import type { Database } from "@/integrations/supabase/types";

type Job = Database["public"]["Tables"]["jobs"]["Row"];
type CompanyLite = { id: string; logo_url: string | null };

export const Route = createFileRoute("/jobs/")({
  head: () => ({ meta: [{ title: "Browse Jobs — SahanJobs" }] }),
  component: JobsPage,
});

function JobsPage() {
  const [q, setQ] = useState("");
  const [orgType, setOrgType] = useState("all");
  const [organization, setOrganization] = useState("all");
  const [seniority, setSeniority] = useState("all");
  const [region, setRegion] = useState("all");
  const [category, setCategory] = useState<string>("all");
  const [postDate, setPostDate] = useState<string>("any");
  const [closeDate, setCloseDate] = useState<string>("any");
  const [jobType, setJobType] = useState<string>("all");

  const { data: companyMap } = useQuery({
    queryKey: ["jobs-companies-map"],
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("id, logo_url, verification_status, suspended");
      const map = new Map<string, CompanyLite & { verification_status: string; suspended: boolean }>();
      (data ?? []).forEach((c) => map.set(c.id, c));
      return map;
    },
  });

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["jobs-list", !!companyMap],
    enabled: !!companyMap,
    queryFn: async () => {
      const client = supabase as unknown as { from: (t: string) => { select: (s: string) => { eq: (k: string, v: string) => { eq: (k: string, v: string) => { order: (k: string, o: { ascending: boolean }) => Promise<{ data: unknown; error: unknown }> } } } } };
      const { data, error } = await client
        .from("jobs_public").select("*")
        .eq("status", "approved").eq("posting_type", "job")
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Hide jobs from suspended or rejected companies.
      return (data as Job[]).filter((j) => {
        if (!j.company_id) return true;
        const c = companyMap!.get(j.company_id);
        if (!c) return true;
        return !c.suspended && c.verification_status !== "rejected";
      });
    },
  });


  const all = jobs ?? [];
  const now = Date.now();
  const source = all.filter((j) => !j.expires_at || new Date(j.expires_at).getTime() >= now);

  const categories = useMemo(() => Array.from(new Set(all.map((j) => j.category))).sort(), [all]);
  const organizations = useMemo(() => Array.from(new Set(all.map((j) => j.company))).sort(), [all]);
  const regions = useMemo(() => Array.from(new Set(all.map((j) => j.location.split(",").pop()?.trim() || j.location))).sort(), [all]);

  const filtered = useMemo(() => {
    return source.filter((j) => {
      if (q && !(j.title + j.company + j.location + j.category).toLowerCase().includes(q.toLowerCase())) return false;
      if (organization !== "all" && j.company !== organization) return false;
      if (region !== "all" && !j.location.toLowerCase().includes(region.toLowerCase())) return false;
      if (category !== "all" && j.category !== category) return false;
      if (jobType !== "all" && j.employment_type !== (jobType as Job["employment_type"])) return false;
      if (postDate !== "any") {
        const days = postDate === "24h" ? 1 : postDate === "7d" ? 7 : 30;
        if (Date.now() - new Date(j.created_at).getTime() > days * 86400000) return false;
      }
      if (closeDate !== "any" && j.expires_at) {
        const days = closeDate === "7d" ? 7 : closeDate === "30d" ? 30 : 0;
        const diff = new Date(j.expires_at).getTime() - Date.now();
        if (days && diff > days * 86400000) return false;
      }
      if (orgType !== "all" || seniority !== "all") { /* informational filters — no field */ }
      return true;
    });
  }, [source, q, organization, region, category, jobType, postDate, closeDate, orgType, seniority]);

  return (
    <div className="min-h-screen flex flex-col bg-hero-band/40">
      <SiteHeader />

      {/* Top search band */}
      <section className="bg-hero-band border-b border-black/5">
        <div className="mx-auto max-w-7xl px-4 md:px-8 py-8">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Search for jobs with keywords"
                className="pl-11 h-14 bg-white border-0 rounded-xl text-sm shadow-sm"
              />
            </div>
            <button className="h-14 px-10 rounded-xl bg-footer text-white text-sm font-semibold hover:bg-footer/90 shadow-sm">
              Search
            </button>
          </div>
        </div>
      </section>

      {/* Main */}
      <section className="mx-auto w-full max-w-7xl px-4 md:px-8 py-8 flex-1">
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          {/* Filter rail */}
          <aside>
            <div className="sticky top-4 space-y-4">
              <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-display text-base font-bold text-ink">Refine the list with filters</h3>
                  <Filter className="h-4 w-4 text-primary" />
                </div>
              </div>

              <FilterAccordion title="Category" defaultOpen>
                <RadioList
                  name="category" value={category} onChange={setCategory}
                  options={[{ v: "all", l: "All categories" }, ...categories.map((c) => ({ v: c, l: c }))]}
                />
              </FilterAccordion>

              <FilterAccordion title="Post Date">
                <RadioList
                  name="post" value={postDate} onChange={setPostDate}
                  options={[
                    { v: "any", l: "Any time" }, { v: "24h", l: "Last 24 hours" },
                    { v: "7d", l: "Last 7 days" }, { v: "30d", l: "Last 30 days" },
                  ]}
                />
              </FilterAccordion>

              <FilterAccordion title="Close Date">
                <RadioList
                  name="close" value={closeDate} onChange={setCloseDate}
                  options={[
                    { v: "any", l: "Any" }, { v: "7d", l: "Closing in 7 days" },
                    { v: "30d", l: "Closing in 30 days" },
                  ]}
                />
              </FilterAccordion>

              <FilterAccordion title="Job type">
                <RadioList
                  name="jobtype" value={jobType} onChange={setJobType}
                  options={[
                    { v: "all", l: "All types" }, { v: "full_time", l: "Full-time" },
                    { v: "part_time", l: "Part-time" }, { v: "contract", l: "Contract" },
                    { v: "internship", l: "Internship" }, { v: "remote", l: "Remote" },
                  ]}
                />
              </FilterAccordion>
            </div>
          </aside>

          {/* List */}
          <div>
            {/* Top dropdown filters */}
            <div className="flex flex-wrap gap-3 mb-5">
              <DropdownFilter label="Organization type" value={orgType} onChange={setOrgType}
                options={[{ v: "all", l: "All" }, { v: "ingo", l: "International NGO" }, { v: "lngo", l: "Local NGO" }, { v: "private", l: "Private sector" }, { v: "un", l: "UN Agency" }]} />
              <DropdownFilter label="Organization" value={organization} onChange={setOrganization}
                options={[{ v: "all", l: "All" }, ...organizations.map((o) => ({ v: o, l: o }))]} />
              <DropdownFilter label="Seniority" value={seniority} onChange={setSeniority}
                options={[{ v: "all", l: "All" }, { v: "entry", l: "Entry" }, { v: "mid", l: "Mid" }, { v: "senior", l: "Senior" }, { v: "lead", l: "Lead" }]} />
              <DropdownFilter label="Region" value={region} onChange={setRegion}
                options={[{ v: "all", l: "All regions" }, ...regions.map((r) => ({ v: r, l: r }))]} />
            </div>

            <p className="text-sm text-ink mb-5">
              <span className="font-bold">{isLoading ? "—" : filtered.length}</span>{" "}
              <span className="text-muted-foreground">jobs match your search.</span>
            </p>

            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-28 rounded-2xl bg-white ring-1 ring-black/5 animate-pulse" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl bg-white p-16 text-center ring-1 ring-black/5">
                <Briefcase className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">No vacancies match your filters.</p>
              </div>
            ) : (
              <ul className="divide-y divide-black/5 rounded-2xl bg-white ring-1 ring-black/5 shadow-sm overflow-hidden">
                {filtered.map((job) => <JobRow key={job.id} job={job} logoUrl={job.company_id ? companyMap?.get(job.company_id)?.logo_url ?? null : null} />)}
              </ul>
            )}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function JobRow({ job, logoUrl }: { job: Job; logoUrl: string | null }) {
  const cityChip = job.location.split(",")[0]?.trim() || job.location;
  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) : "—";
  const isTender = job.posting_type === "tender";

  return (
    <li className="relative">
      <Link to="/jobs/$jobId" params={{ jobId: job.id }} className="group block px-5 py-4 hover:bg-hero-band/40 transition-colors">
        <div className="flex gap-4">
          <CompanyLogo company={job.company} logoUrl={logoUrl} size={48} className="h-12 w-12 shrink-0" />
          <div className="flex-1 min-w-0 pr-10">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-1.5">
              <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-[11px] font-medium text-ink-soft">{cityChip}</span>
              {isTender && (
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                  <FileText className="h-3 w-3" /> Tender
                </span>
              )}
              <h3 className="font-display text-base md:text-lg font-bold text-primary group-hover:underline">
                {job.title}
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-ink-soft">
              <span><span className="font-bold text-ink">Organization:</span> {job.company}</span>
              <Dot />
              <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /><span className="font-bold text-ink">Posted</span> {fmt(job.created_at)}</span>
              <Dot />
              <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /><span className="font-bold text-ink">Closing:</span> {fmt(job.expires_at)}</span>
              <Dot />
              <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{job.location}</span>
              <Dot />
              <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{job.category}</span>
              <Dot />
              <span className="inline-flex items-center gap-1"><Briefcase className="h-3 w-3" />{formatEmploymentType(job.employment_type)}</span>
            </div>
          </div>
        </div>
      </Link>
      <div className="absolute right-3 top-3">
        <SaveJobButton jobId={job.id} />
      </div>
    </li>
  );
}

function Dot() {
  return <span className="text-muted-foreground/50 px-1">·</span>;
}

function FilterAccordion({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
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
  name: string; value: string; onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  return (
    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
      {options.map((o) => (
        <label key={o.v} className="flex items-center gap-2.5 cursor-pointer text-sm text-ink-soft hover:text-ink">
          <span className="relative grid place-items-center h-4 w-4">
            <input
              type="radio" name={name} checked={value === o.v} onChange={() => onChange(o.v)}
              className="peer absolute inset-0 opacity-0 cursor-pointer"
            />
            <span className="h-4 w-4 rounded-full border-2 border-muted-foreground/40 peer-checked:border-primary" />
            <span className={`absolute h-2 w-2 rounded-full bg-primary transition-opacity ${value === o.v ? "opacity-100" : "opacity-0"}`} />
          </span>
          {o.l}
        </label>
      ))}
    </div>
  );
}

function DropdownFilter({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  const selected = options.find((o) => o.v === value);
  const isActive = value !== "all";
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={`h-10 rounded-full border bg-white px-5 text-sm font-medium gap-2 w-auto min-w-[150px] shadow-sm ${
        isActive ? "border-primary text-primary" : "border-black/10 text-ink"
      }`}>
        <SelectValue placeholder={label}>{isActive ? selected?.l : label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

// unused imports guard (kept for tree-shake friendliness)
void ChevronDown; void ChevronUp;
