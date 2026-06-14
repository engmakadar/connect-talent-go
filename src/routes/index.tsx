import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Search, MapPin, Briefcase, FileText, Building2,
  UserPlus, IdCard, Send, BadgeCheck, ArrowRight, Share2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { CompanyLogo } from "@/components/company-logo";
import heroImg from "@/assets/jobs-hero.jpg";
import statsBg from "@/assets/stats-bg.jpg";
import { formatEmploymentType, formatSalary, timeAgo } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SahanJobs — Find Your Dream Job Today" },
      { name: "description", content: "Connect with top employers and discover opportunities that match your skills and aspirations." },
    ],
  }),
  component: HomePage,
});

const PARTNERS = [
  { name: "Innovii Digital Service", initials: "INNOVII", sub: "DIGITAL SERVICE", color: "text-blue-700" },
  { name: "Hormuud Telecom", initials: "HORMUUD", sub: "TELECOM", color: "text-emerald-700" },
  { name: "Telesom", initials: "Telesom", sub: "Telecommunication", color: "text-amber-600" },
];

const STEPS = [
  { n: 1, title: "Create Your Account", body: "Sign up for free as a job seeker or employer. It only takes a minute to get started.", Icon: UserPlus },
  { n: 2, title: "Build Your Profile", body: "Complete your profile and preferences. For employers, add your company details.", Icon: IdCard },
  { n: 3, title: "Apply or Post Jobs", body: "Candidates get matched to opportunities. Employers post and receive applications.", Icon: Send },
  { n: 4, title: "Get Hired or Hire", body: "Connect with opportunities and find the perfect match for your career or team.", Icon: BadgeCheck },
];

const CATEGORY_ICONS: Record<string, string> = {
  Engineering: "💻", Design: "🎨", Data: "📊", Marketing: "📣",
  Sales: "🤝", Operations: "⚙️", Product: "🚀", Finance: "💰",
  "Customer Success": "🌟", Research: "🔬",
};

function HomePage() {
  const { data: companyMap } = useQuery({
    queryKey: ["home-companies"],
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("id, logo_url, verification_status, suspended");
      const map = new Map<string, { logo_url: string | null; verification_status: string; suspended: boolean }>();
      (data ?? []).forEach((c) => map.set(c.id, c));
      return map;
    },
  });

  const { data: jobs } = useQuery({
    queryKey: ["recent-jobs-home", !!companyMap],
    enabled: !!companyMap,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("id,title,company,company_id,location,employment_type,category,salary_min,salary_max,currency,created_at")
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      const visible = (data ?? []).filter((j) => {
        if (!j.company_id) return true;
        const c = companyMap!.get(j.company_id);
        if (!c) return true;
        return !c.suspended && c.verification_status !== "rejected";
      });
      return visible.slice(0, 6);
    },
  });


  const { data: stats } = useQuery({
    queryKey: ["home-stats"],
    queryFn: async () => {
      const [jobsRes, companiesRes] = await Promise.all([
        supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "approved"),
        supabase.from("jobs").select("company").eq("status", "approved"),
      ]);
      const companies = new Set((companiesRes.data ?? []).map((r) => r.company)).size;
      return { jobs: jobsRes.count ?? 0, companies };
    },
  });

  const { data: categories } = useQuery({
    queryKey: ["home-categories"],
    queryFn: async () => {
      const { data } = await supabase
        .from("jobs")
        .select("category")
        .eq("status", "approved");
      const counts = new Map<string, number>();
      (data ?? []).forEach((r) => counts.set(r.category, (counts.get(r.category) ?? 0) + 1));
      return Array.from(counts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);
    },
  });

  return (
    <div className="min-h-screen bg-background text-ink">
      <SiteHeader />

      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-hero-band">
        <img
          src={heroImg}
          alt="Professionals at work"
          width={1920}
          height={1080}
          className="absolute inset-0 -z-10 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-hero-band/85 via-hero-band/55 to-hero-band/90" />

        <div className="mx-auto max-w-5xl px-6 py-28 text-center md:py-36">
          <h1 className="font-serif text-4xl font-medium tracking-tight text-ink md:text-6xl">
            Find Your Dream Job Today
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-ink-soft md:text-lg">
            Connect with top employers and discover opportunities that match your skills and aspirations. Your next career move starts here.
          </p>

          <form
            onSubmit={(e) => { e.preventDefault(); window.location.assign("/jobs"); }}
            className="mx-auto mt-10 flex max-w-3xl flex-col items-center gap-3 sm:flex-row"
          >
            <div className="flex w-full flex-1 items-center gap-3 rounded-full bg-white px-5 py-3 shadow-sm ring-1 ring-black/5">
              <Briefcase className="size-4 shrink-0 text-muted-foreground" />
              <input type="text" placeholder="Job title, keywords..." className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            </div>
            <div className="flex w-full flex-1 items-center gap-3 rounded-full bg-white px-5 py-3 shadow-sm ring-1 ring-black/5">
              <MapPin className="size-4 shrink-0 text-muted-foreground" />
              <input type="text" placeholder="City or region..." className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            </div>
            <button type="submit" className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 sm:w-auto">
              <Search className="size-4" /> Search Jobs
            </button>
          </form>
        </div>
      </section>

      {/* Latest Jobs — 2x3 grid */}
      <section className="bg-background py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center">
            <h2 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">Latest Jobs</h2>
            <p className="mt-3 text-muted-foreground">Find your dream job from our latest listings</p>
          </div>

          <div className="mx-auto mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {(jobs ?? []).map((j) => {
              return (
                <article
                  key={j.id}
                  className="flex flex-col rounded-2xl bg-card p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_12px_30px_-15px_rgba(0,0,0,0.15)] ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <CompanyLogo company={j.company} logoUrl={j.company_id ? companyMap?.get(j.company_id)?.logo_url ?? null : null} size={44} className="h-11 w-11 shrink-0" />
                      <div>
                        <h3 className="text-lg font-bold leading-snug text-ink line-clamp-2">{j.title}</h3>
                        <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-primary">
                          <Building2 className="size-3.5" /> {j.company}
                        </p>
                      </div>
                    </div>
                    <button aria-label="Share" className="rounded-full p-2 text-muted-foreground hover:bg-secondary">
                      <Share2 className="size-4" />
                    </button>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-y-2 text-sm">
                    <p className="flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="size-3.5 text-primary" /> {j.location}
                    </p>
                    <p className="text-right text-muted-foreground">
                      Posted: <span className="text-ink">{timeAgo(j.created_at)}</span>
                    </p>
                    <p className="text-muted-foreground col-span-2">
                      Salary: <span className="text-ink">{formatSalary(j.salary_min, j.salary_max, j.currency)}</span>
                    </p>
                  </div>

                  <div className="mt-auto flex items-center justify-between pt-6">
                    <span className="rounded-full bg-primary-soft px-4 py-1.5 text-xs font-semibold text-primary">
                      {formatEmploymentType(j.employment_type)}
                    </span>
                    <Link
                      to="/jobs/$jobId"
                      params={{ jobId: j.id }}
                      className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                    >
                      View Details <ArrowRight className="size-4" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>

          {(jobs ?? []).length === 0 && (
            <p className="mt-10 text-center text-muted-foreground">No vacancies yet — check back soon.</p>
          )}

          <div className="mt-10 text-center">
            <Link
              to="/jobs"
              className="inline-flex items-center gap-2 rounded-full border border-primary/30 px-6 py-2 text-sm font-semibold text-primary hover:bg-primary-soft"
            >
              See more <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Top Categories */}
      {categories && categories.length > 0 && (
        <section className="bg-hero-band/60 py-20">
          <div className="mx-auto max-w-7xl px-6">
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <h2 className="font-serif text-3xl font-bold tracking-tight md:text-4xl">Top Categories</h2>
                <p className="mt-2 text-muted-foreground">
                  Explore opportunities by sector — live counts of open vacancies.
                </p>
              </div>
              <Link to="/jobs" className="text-sm font-semibold text-primary hover:underline">
                View all categories →
              </Link>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {categories.map((c) => (
                <Link
                  key={c.name}
                  to="/jobs"
                  className="group relative flex items-center justify-between rounded-xl bg-card px-5 py-5 ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:ring-primary/40 hover:shadow-md"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-11 place-items-center rounded-lg bg-primary-soft text-xl">
                      {CATEGORY_ICONS[c.name] ?? "💼"}
                    </span>
                    <div>
                      <p className="font-semibold text-ink group-hover:text-primary">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.count} open positions</p>
                    </div>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* How It Works */}
      <section className="bg-hero-band py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center">
            <h2 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">How It Works</h2>
            <p className="mt-3 text-muted-foreground">
              Getting started with SahanJobs is easy. Follow these simple steps to begin your journey.
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ n, title, body, Icon }) => (
              <div key={n} className="relative overflow-hidden rounded-2xl bg-card p-7 shadow-sm ring-1 ring-black/5">
                <span className="pointer-events-none absolute -right-1 -top-3 select-none font-serif text-[6rem] font-bold leading-none text-secondary">
                  {n}
                </span>
                <div className="relative grid size-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/30">
                  <Icon className="size-5" />
                </div>
                <h3 className="relative mt-6 text-lg font-bold">{title}</h3>
                <p className="relative mt-2 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats band */}
      <section className="relative isolate overflow-hidden">
        <img
          src={statsBg}
          alt=""
          aria-hidden
          width={1920}
          height={600}
          loading="lazy"
          className="absolute inset-0 -z-10 h-full w-full object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-footer/85" />

        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-6 py-20 text-center text-footer-foreground sm:grid-cols-3">
          <Stat icon={Briefcase} value={String(stats?.jobs ?? 0)} label="Jobs Available" />
          <Stat icon={FileText} value="33" label="CV Submitted" />
          <Stat icon={Building2} value={String(stats?.companies ?? 0)} label="Companies" />
        </div>
      </section>

      {/* Partners */}
      <section className="bg-background py-20">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="font-serif text-3xl font-bold tracking-tight md:text-4xl">Our Partners</h2>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
            {PARTNERS.map((p) => (
              <div key={p.name} className="flex h-28 items-center justify-center rounded-xl bg-card ring-1 ring-black/5">
                <div className="text-center">
                  <div className={`font-serif text-2xl font-bold tracking-wider ${p.color}`}>{p.initials}</div>
                  <div className="font-mono text-[10px] font-semibold tracking-[0.2em] text-muted-foreground">{p.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function Stat({ icon: Icon, value, label }: { icon: typeof Briefcase; value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <Icon className="size-8 text-primary-glow" strokeWidth={1.5} />
      <p className="mt-4 font-serif text-5xl font-bold">{value}</p>
      <p className="mt-2 text-sm font-medium text-footer-foreground/80">{label}</p>
    </div>
  );
}
