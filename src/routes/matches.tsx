import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { MapPin, Briefcase, Sparkles, Download, FileText, ArrowRight, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { CompanyLogo } from "@/components/company-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatEmploymentType, formatSalary, timeAgo } from "@/lib/format";
import { stripHtml } from "@/lib/strip-html";
import { toast } from "sonner";

export const Route = createFileRoute("/matches")({
  head: () => ({
    meta: [
      { title: "Matched Positions — SahanJobs" },
      { name: "description", content: "Roles tailored to your preferences and CV, with a downloadable international-standard resume." },
    ],
  }),
  component: MatchesPage,
});

type JobRow = {
  id: string; title: string; company: string; company_id: string | null;
  location: string; category: string; employment_type: string;
  salary_min: number | null; salary_max: number | null; currency: string | null;
  created_at: string; skills: string[] | null;
};

function MatchesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.navigate({ to: "/auth" });
  }, [loading, user, router]);

  const { data: prefs } = useQuery({
    enabled: !!user,
    queryKey: ["match-prefs", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("jobseeker_preferences")
        .select("preferred_categories, preferred_locations, preferred_employment_types, skills, min_salary")
        .eq("user_id", user!.id).maybeSingle();
      return data;
    },
  });

  const { data: resume } = useQuery({
    enabled: !!user,
    queryKey: ["match-resume", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("resumes").select("*").eq("user_id", user!.id).maybeSingle();
      return data;
    },
  });

  const { data: jobs, isLoading } = useQuery({
    enabled: !!user,
    queryKey: ["all-approved-jobs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("jobs")
        .select("id, title, company, company_id, location, category, employment_type, salary_min, salary_max, currency, created_at, skills")
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(150);
      return (data ?? []) as JobRow[];
    },
  });

  const skillSet = useMemo(() => {
    const set = new Set<string>();
    (prefs?.skills ?? []).forEach((s) => set.add(s.toLowerCase()));
    type SkillEntry = { name?: string };
    const resumeSkills = (resume?.skills as SkillEntry[] | null) ?? [];
    resumeSkills.forEach((s) => s?.name && set.add(s.name.toLowerCase()));
    return set;
  }, [prefs, resume]);

  const scored = useMemo(() => {
    if (!jobs) return [];
    const cats = new Set((prefs?.preferred_categories ?? []).map((c) => c.toLowerCase()));
    const locs = new Set((prefs?.preferred_locations ?? []).map((c) => c.toLowerCase()));
    const types = new Set((prefs?.preferred_employment_types ?? []).map((c) => String(c).toLowerCase()));
    return jobs
      .map((j) => {
        let score = 0;
        if (cats.has(j.category?.toLowerCase() ?? "")) score += 3;
        if (locs.has(j.location?.toLowerCase() ?? "")) score += 2;
        if (types.has(j.employment_type?.toLowerCase() ?? "")) score += 1;
        const matchedSkills = (j.skills ?? []).filter((s) => skillSet.has(s.toLowerCase()));
        score += matchedSkills.length;
        return { ...j, score, matchedSkills };
      })
      .filter((j) => j.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40);
  }, [jobs, prefs, skillSet]);

  const downloadCv = async () => {
    if (!resume) { toast.error("Build your resume first."); return; }
    const mod = await import("jspdf");
    generateEuropassPdf(mod.default, resume);
  };

  if (loading || !user) return null;

  return (
    <div className="min-h-screen flex flex-col bg-hero-band/40">
      <SiteHeader />
      <section className="container mx-auto px-6 py-10 max-w-6xl flex-1">
        <header className="flex flex-wrap items-end justify-between gap-3 mb-8">
          <div>
            <Badge variant="outline" className="mb-2 border-primary/40 bg-primary/10 text-primary"><Target className="h-3 w-3 mr-1" /> Candidate Dashboard</Badge>
            <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-ink">Matched positions</h1>
            <p className="text-muted-foreground mt-1">Roles aligned to your preferences and CV.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.navigate({ to: "/resume" })}>
              <FileText className="h-4 w-4" /> Edit resume
            </Button>
            <Button onClick={downloadCv} disabled={!resume}>
              <Download className="h-4 w-4" /> Download CV (PDF)
            </Button>
          </div>
        </header>

        {isLoading ? (
          <div className="h-64 rounded-2xl bg-white animate-pulse ring-1 ring-black/5" />
        ) : scored.length === 0 ? (
          <div className="rounded-2xl bg-white p-16 text-center ring-1 ring-black/5">
            <Sparkles className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground mb-4">No matches yet — add preferences and skills to your profile.</p>
            <Button onClick={() => router.navigate({ to: "/profile" })}>Update preferences</Button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {scored.map((j) => (
              <Link key={j.id} to="/jobs/$jobId" params={{ jobId: j.id }} className="group rounded-2xl bg-white p-5 ring-1 ring-black/5 hover:-translate-y-0.5 hover:shadow-md transition-all">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <CompanyLogo company={j.company} size={40} className="h-10 w-10 shrink-0" />
                    <div className="min-w-0">
                      <h3 className="font-semibold leading-snug text-ink line-clamp-2 group-hover:text-primary">{j.title}</h3>
                      <p className="mt-0.5 text-sm font-medium text-primary">{j.company}</p>
                    </div>
                  </div>
                  <Badge className="bg-primary/10 text-primary border-0 shrink-0">{j.score} pt</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {j.location}</span>
                  <span className="inline-flex items-center gap-1"><Briefcase className="h-3 w-3" /> {formatEmploymentType(j.employment_type)}</span>
                  <span>·</span>
                  <span>{timeAgo(j.created_at)}</span>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="font-medium text-ink text-sm">{formatSalary(j.salary_min, j.salary_max, j.currency)}</span>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">View <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" /></span>
                </div>
                {j.matchedSkills.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {j.matchedSkills.slice(0, 4).map((s) => (
                      <span key={s} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">{s}</span>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>
      <SiteFooter />
    </div>
  );
}

/* ----------------------- Europass-style one-column CV ---------------------- */

type ResumeData = {
  full_name: string | null; location: string | null; date_of_birth: string | null;
  nationality: string | null; phone: string | null; email: string | null; summary: string | null;
  education: unknown; experience: unknown; certificates: unknown; skills: unknown; refs: unknown;
};

type JsPdfCtor = new (opts: { unit: string; format: string }) => {
  internal: { pageSize: { getWidth(): number; getHeight(): number } };
  setFont(name: string, style?: string): void;
  setFontSize(n: number): void;
  setTextColor(r: number, g: number, b: number): void;
  setDrawColor(r: number, g: number, b: number): void;
  setLineWidth(n: number): void;
  line(x1: number, y1: number, x2: number, y2: number): void;
  text(t: string | string[], x: number, y: number): void;
  splitTextToSize(t: string, w: number): string[];
  addPage(): void;
  save(name: string): void;
};

function generateEuropassPdf(JsPDF: JsPdfCtor, r: ResumeData) {
  const doc = new JsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  let y = margin;

  const ensure = (need: number) => {
    if (y + need > pageH - margin) { doc.addPage(); y = margin; }
  };
  const writePara = (text: string, size = 10, color: [number, number, number] = [40, 40, 40]) => {
    if (!text) return;
    doc.setFontSize(size); doc.setTextColor(...color); doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(text, pageW - margin * 2);
    ensure(lines.length * (size + 3));
    doc.text(lines, margin, y);
    y += lines.length * (size + 3) + 4;
  };
  const heading = (text: string) => {
    ensure(28);
    y += 6;
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 50, 110);
    doc.text(text.toUpperCase(), margin, y);
    doc.setDrawColor(20, 50, 110); doc.setLineWidth(0.8);
    doc.line(margin, y + 3, pageW - margin, y + 3);
    y += 16;
  };
  const subline = (left: string, right: string) => {
    ensure(14);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(20, 20, 20);
    doc.text(left, margin, y);
    if (right) {
      doc.setFont("helvetica", "italic"); doc.setTextColor(110, 110, 110);
      const w = doc.splitTextToSize(right, pageW - margin * 2);
      doc.text(w[0], pageW - margin, y, ); // jspdf accepts options arg; cast trick:
    }
    y += 13;
  };

  // Header — name + contact
  doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.setTextColor(20, 50, 110);
  doc.text(r.full_name || "Curriculum Vitae", margin, y);
  y += 22;
  const contactBits = [r.location, r.phone, r.email, r.nationality, r.date_of_birth].filter(Boolean) as string[];
  if (contactBits.length) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(90, 90, 90);
    doc.text(contactBits.join("  ·  "), margin, y);
    y += 8;
  }
  doc.setDrawColor(20, 50, 110); doc.setLineWidth(1.2);
  doc.line(margin, y + 6, pageW - margin, y + 6);
  y += 18;

  if (r.summary) { heading("Personal Summary"); writePara(stripHtml(r.summary)); }

  type Exp = { company?: string; position?: string; location?: string; start_date?: string; end_date?: string; current?: boolean; duties?: string };
  const exp = (r.experience as Exp[] | null) ?? [];
  if (exp.length) {
    heading("Work Experience");
    for (const e of exp) {
      const dateR = `${e.start_date || ""}${e.start_date ? " – " : ""}${e.current ? "Present" : (e.end_date || "")}`;
      subline(`${e.position || ""}${e.position && e.company ? " · " : ""}${e.company || ""}`, dateR);
      if (e.location) writePara(e.location, 9.5, [110, 110, 110]);
      if (e.duties) writePara(stripHtml(e.duties));
    }
  }

  type Edu = { school?: string; school_type?: string; major?: string; start_date?: string; end_date?: string };
  const edu = (r.education as Edu[] | null) ?? [];
  if (edu.length) {
    heading("Education & Training");
    for (const e of edu) {
      const dateR = `${e.start_date || ""}${e.start_date ? " – " : ""}${e.end_date || ""}`;
      subline(`${e.major || ""}${e.major && e.school ? " · " : ""}${e.school || ""}`, dateR);
      if (e.school_type) writePara(e.school_type, 9.5, [110, 110, 110]);
    }
  }

  type Cert = { name?: string; date?: string; skills_learned?: string };
  const certs = (r.certificates as Cert[] | null) ?? [];
  if (certs.length) {
    heading("Certificates & Training");
    for (const c of certs) {
      subline(c.name || "", c.date || "");
      if (c.skills_learned) writePara(stripHtml(c.skills_learned));
    }
  }

  type Skill = { name?: string; level?: string };
  const skills = (r.skills as Skill[] | null) ?? [];
  if (skills.length) {
    heading("Skills");
    const line = skills.map((s) => `${s.name || ""}${s.level ? ` (${s.level})` : ""}`).filter(Boolean).join("  ·  ");
    writePara(line);
  }

  type Ref = { name?: string; position?: string; company?: string; email?: string; phone?: string; relation?: string };
  const refs = (r.refs as Ref[] | null) ?? [];
  if (refs.length) {
    heading("References");
    for (const rf of refs) {
      subline(rf.name || "", rf.relation || "");
      const meta = [rf.position, rf.company, rf.email, rf.phone].filter(Boolean).join(" · ");
      if (meta) writePara(meta, 9.5, [110, 110, 110]);
    }
  }

  const filename = (r.full_name || "resume").toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-cv.pdf";
  doc.save(filename);
}
