import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RichTextEditor } from "@/components/rich-text-editor";
import {
  User, GraduationCap, Briefcase, Award, Sparkles, Users as UsersIcon,
  Plus, Trash2, Save,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/resume")({
  head: () => ({
    meta: [
      { title: "My Resume — SahanJobs" },
      { name: "description", content: "Build your professional resume — personal info, education, work experience, certificates, skills, and references." },
    ],
  }),
  component: ResumePage,
});

/* --------------------------------- TYPES --------------------------------- */

type EducationEntry = { school: string; school_type: string; major: string; start_date: string; end_date: string };
type ExperienceEntry = { company: string; position: string; location: string; start_date: string; end_date: string; current: boolean; duties: string };
type CertificateEntry = { name: string; date: string; skills_learned: string };
type SkillEntry = { name: string; level: string };
type ReferenceEntry = { name: string; position: string; company: string; email: string; phone: string; relation: string };

interface ResumeForm {
  full_name: string;
  location: string;
  date_of_birth: string;
  nationality: string;
  phone: string;
  email: string;
  summary: string;
  education: EducationEntry[];
  experience: ExperienceEntry[];
  certificates: CertificateEntry[];
  skills: SkillEntry[];
  refs: ReferenceEntry[];
}

const EMPTY: ResumeForm = {
  full_name: "", location: "", date_of_birth: "", nationality: "", phone: "", email: "",
  summary: "", education: [], experience: [], certificates: [], skills: [], refs: [],
};

const emptyEducation = (): EducationEntry => ({ school: "", school_type: "", major: "", start_date: "", end_date: "" });
const emptyExperience = (): ExperienceEntry => ({ company: "", position: "", location: "", start_date: "", end_date: "", current: false, duties: "" });
const emptyCertificate = (): CertificateEntry => ({ name: "", date: "", skills_learned: "" });
const emptySkill = (): SkillEntry => ({ name: "", level: "Intermediate" });
const emptyReference = (): ReferenceEntry => ({ name: "", position: "", company: "", email: "", phone: "", relation: "" });

/* --------------------------------- PAGE ---------------------------------- */

function ResumePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [form, setForm] = useState<ResumeForm>(EMPTY);

  useEffect(() => {
    if (!loading && !user) router.navigate({ to: "/auth" });
  }, [loading, user, router]);

  // Subscription gate: hide My Resume unless the user has an active subscription.
  const { data: subActive, isLoading: subLoading } = useQuery({
    enabled: !!user,
    queryKey: ["my-active-sub", user?.id],
    queryFn: async () => {
      const { data } = await supabase.rpc("has_active_subscription", { _user_id: user!.id });
      return data === true;
    },
  });

  useEffect(() => {
    if (!loading && user && !subLoading && subActive === false) {
      router.navigate({ to: "/plans" });
    }
  }, [loading, user, subLoading, subActive, router]);


  const { isLoading } = useQuery({
    enabled: !!user,
    queryKey: ["resume", user?.id],
    queryFn: async () => {
      const [{ data }, { data: prof }] = await Promise.all([
        supabase.from("resumes").select("*").eq("user_id", user!.id).maybeSingle(),
        supabase.from("profiles").select("full_name, first_name, last_name, email").eq("id", user!.id).maybeSingle(),
      ]);
      // Profile name/email are authoritative and non-editable.
      const lockedName =
        prof?.full_name ||
        [prof?.first_name, prof?.last_name].filter(Boolean).join(" ").trim() ||
        user?.user_metadata?.full_name ||
        "";
      const lockedEmail = prof?.email ?? user?.email ?? "";
      if (data) {
        setForm({
          full_name: lockedName,
          location: data.location ?? "",
          date_of_birth: data.date_of_birth ?? "",
          nationality: data.nationality ?? "",
          phone: data.phone ?? "",
          email: lockedEmail,
          summary: data.summary ?? "",
          education: (data.education as EducationEntry[] | null) ?? [],
          experience: (data.experience as ExperienceEntry[] | null) ?? [],
          certificates: (data.certificates as CertificateEntry[] | null) ?? [],
          skills: (data.skills as SkillEntry[] | null) ?? [],
          refs: (data.refs as ReferenceEntry[] | null) ?? [],
        });
      } else {
        setForm((f) => ({ ...f, full_name: lockedName, email: lockedEmail }));
      }
      return data ?? null;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const payload = {
        user_id: user.id,
        full_name: form.full_name || null,
        location: form.location || null,
        date_of_birth: form.date_of_birth || null,
        nationality: form.nationality || null,
        phone: form.phone || null,
        email: form.email || null,
        summary: form.summary || null,
        education: form.education as unknown as never,
        experience: form.experience as unknown as never,
        certificates: form.certificates as unknown as never,
        skills: form.skills as unknown as never,
        refs: form.refs as unknown as never,
      };
      const { error } = await supabase.from("resumes").upsert(payload, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Resume saved.");
      qc.invalidateQueries({ queryKey: ["resume", user?.id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  if (loading || !user) return null;

  const update = <K extends keyof ResumeForm>(key: K, value: ResumeForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <section className="container mx-auto px-6 py-12 max-w-4xl flex-1 space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Badge variant="outline" className="mb-2 border-gold/40 bg-gold/10 text-gold-foreground">My CV</Badge>
            <h1 className="font-display text-4xl font-bold tracking-tight">Build your resume</h1>
            <p className="text-muted-foreground mt-1">A polished CV employers can review when you apply.</p>
          </div>
          <Button size="lg" onClick={() => save.mutate()} disabled={save.isPending || isLoading}>
            <Save className="h-4 w-4" /> {save.isPending ? "Saving…" : "Save resume"}
          </Button>
        </header>

        {/* Personal Information */}
        <SectionCard icon={User} title="Personal information" description="The basics employers see first.">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Full name" hint="Synced from your account profile">
              <Input value={form.full_name} readOnly disabled className="bg-secondary/60 cursor-not-allowed" />
            </Field>
            <Field label="Email" hint="Synced from your account login">
              <Input type="email" value={form.email} readOnly disabled className="bg-secondary/60 cursor-not-allowed" />
            </Field>
            <Field label="Location"><Input value={form.location} maxLength={140} onChange={(e) => update("location", e.target.value)} placeholder="Mogadishu, Somalia" /></Field>
            <Field label="Date of birth"><Input type="date" value={form.date_of_birth} onChange={(e) => update("date_of_birth", e.target.value)} /></Field>
            <Field label="Nationality"><Input value={form.nationality} maxLength={80} onChange={(e) => update("nationality", e.target.value)} /></Field>
            <Field label="Phone number"><Input value={form.phone} maxLength={40} onChange={(e) => update("phone", e.target.value)} placeholder="+252…" /></Field>
          </div>
          <div>
            <Label className="mb-1.5 block">Personal summary</Label>
            <RichTextEditor value={form.summary} onChange={(html) => update("summary", html)} placeholder="A short professional summary about you…" minHeight={140} />
          </div>
        </SectionCard>

        {/* Education */}
        <RepeatableSection
          icon={GraduationCap}
          title="Educational background"
          description="Schools, training institutes, and universities you've attended."
          entries={form.education}
          onAdd={() => update("education", [...form.education, emptyEducation()])}
          onRemove={(i) => update("education", form.education.filter((_, idx) => idx !== i))}
          render={(item, i) => {
            const set = (patch: Partial<EducationEntry>) =>
              update("education", form.education.map((x, idx) => idx === i ? { ...x, ...patch } : x));
            return (
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="School name"><Input value={item.school} onChange={(e) => set({ school: e.target.value })} /></Field>
                <Field label="Type of school"><Input value={item.school_type} placeholder="University, Institute, High School…" onChange={(e) => set({ school_type: e.target.value })} /></Field>
                <Field label="Major / field"><Input value={item.major} onChange={(e) => set({ major: e.target.value })} /></Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Start"><Input type="month" value={item.start_date} onChange={(e) => set({ start_date: e.target.value })} /></Field>
                  <Field label="End"><Input type="month" value={item.end_date} onChange={(e) => set({ end_date: e.target.value })} /></Field>
                </div>
              </div>
            );
          }}
        />

        {/* Work Experience */}
        <RepeatableSection
          icon={Briefcase}
          title="Work experience"
          description="Roles you've held, with duties and responsibilities."
          entries={form.experience}
          onAdd={() => update("experience", [...form.experience, emptyExperience()])}
          onRemove={(i) => update("experience", form.experience.filter((_, idx) => idx !== i))}
          render={(item, i) => {
            const set = (patch: Partial<ExperienceEntry>) =>
              update("experience", form.experience.map((x, idx) => idx === i ? { ...x, ...patch } : x));
            return (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Company"><Input value={item.company} onChange={(e) => set({ company: e.target.value })} /></Field>
                  <Field label="Position"><Input value={item.position} onChange={(e) => set({ position: e.target.value })} /></Field>
                  <Field label="Location"><Input value={item.location} onChange={(e) => set({ location: e.target.value })} /></Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Start"><Input type="month" value={item.start_date} onChange={(e) => set({ start_date: e.target.value })} /></Field>
                    <Field label="End">
                      <Input
                        type="month"
                        value={item.end_date}
                        disabled={item.current}
                        onChange={(e) => set({ end_date: e.target.value })}
                      />
                    </Field>
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-ink-soft">
                  <input
                    type="checkbox"
                    checked={item.current}
                    onChange={(e) => set({ current: e.target.checked, end_date: e.target.checked ? "" : item.end_date })}
                  />
                  I currently work here
                </label>
                <div>
                  <Label className="mb-1.5 block">Duties & responsibilities</Label>
                  <RichTextEditor value={item.duties} onChange={(html) => set({ duties: html })} placeholder="Describe your responsibilities and achievements…" minHeight={140} />
                </div>
              </div>
            );
          }}
        />

        {/* Certificates & Training */}
        <RepeatableSection
          icon={Award}
          title="Certificates & training"
          description="Professional certifications and training programs."
          entries={form.certificates}
          onAdd={() => update("certificates", [...form.certificates, emptyCertificate()])}
          onRemove={(i) => update("certificates", form.certificates.filter((_, idx) => idx !== i))}
          render={(item, i) => {
            const set = (patch: Partial<CertificateEntry>) =>
              update("certificates", form.certificates.map((x, idx) => idx === i ? { ...x, ...patch } : x));
            return (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Certificate name"><Input value={item.name} onChange={(e) => set({ name: e.target.value })} /></Field>
                  <Field label="Date"><Input type="month" value={item.date} onChange={(e) => set({ date: e.target.value })} /></Field>
                </div>
                <div>
                  <Label className="mb-1.5 block">Skills learned</Label>
                  <RichTextEditor value={item.skills_learned} onChange={(html) => set({ skills_learned: html })} placeholder="What you learned, tools covered, outcomes…" minHeight={120} />
                </div>
              </div>
            );
          }}
        />

        {/* Skills */}
        <RepeatableSection
          icon={Sparkles}
          title="Skills"
          description="Capabilities you bring to the table."
          entries={form.skills}
          onAdd={() => update("skills", [...form.skills, emptySkill()])}
          onRemove={(i) => update("skills", form.skills.filter((_, idx) => idx !== i))}
          render={(item, i) => {
            const set = (patch: Partial<SkillEntry>) =>
              update("skills", form.skills.map((x, idx) => idx === i ? { ...x, ...patch } : x));
            return (
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Skill"><Input value={item.name} onChange={(e) => set({ name: e.target.value })} placeholder="React, Project Management…" /></Field>
                <Field label="Level">
                  <select
                    value={item.level}
                    onChange={(e) => set({ level: e.target.value })}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {["Beginner", "Intermediate", "Advanced", "Expert"].map((l) => <option key={l}>{l}</option>)}
                  </select>
                </Field>
              </div>
            );
          }}
        />

        {/* References */}
        <RepeatableSection
          icon={UsersIcon}
          title="References"
          description="People who can vouch for your work."
          entries={form.refs}
          onAdd={() => update("refs", [...form.refs, emptyReference()])}
          onRemove={(i) => update("refs", form.refs.filter((_, idx) => idx !== i))}
          render={(item, i) => {
            const set = (patch: Partial<ReferenceEntry>) =>
              update("refs", form.refs.map((x, idx) => idx === i ? { ...x, ...patch } : x));
            return (
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Full name"><Input value={item.name} onChange={(e) => set({ name: e.target.value })} /></Field>
                <Field label="Position"><Input value={item.position} onChange={(e) => set({ position: e.target.value })} /></Field>
                <Field label="Company"><Input value={item.company} onChange={(e) => set({ company: e.target.value })} /></Field>
                <Field label="Relation"><Input value={item.relation} onChange={(e) => set({ relation: e.target.value })} placeholder="Direct manager, peer…" /></Field>
                <Field label="Email"><Input type="email" value={item.email} onChange={(e) => set({ email: e.target.value })} /></Field>
                <Field label="Phone"><Input value={item.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
              </div>
            );
          }}
        />

        <div className="sticky bottom-4 z-10 flex justify-end">
          <Button size="lg" onClick={() => save.mutate()} disabled={save.isPending || isLoading} className="shadow-lg">
            <Save className="h-4 w-4" /> {save.isPending ? "Saving…" : "Save resume"}
          </Button>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}

/* --------------------------------- BLOCKS -------------------------------- */

function SectionCard({
  icon: Icon, title, description, children,
}: { icon: typeof User; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-black/5 shadow-sm space-y-4">
      <header className="flex items-start gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
        <div>
          <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function RepeatableSection<T>({
  icon: Icon, title, description, entries, onAdd, onRemove, render,
}: {
  icon: typeof User; title: string; description?: string;
  entries: T[]; onAdd: () => void; onRemove: (index: number) => void;
  render: (entry: T, index: number) => React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-black/5 shadow-sm space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
          <div>
            <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onAdd}><Plus className="h-4 w-4" /> Add entry</Button>
      </header>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">No entries yet — click "Add entry" to start.</p>
      ) : (
        <div className="space-y-4">
          {entries.map((entry, i) => (
            <div key={i} className="relative rounded-xl border border-border bg-secondary/30 p-4 pt-6">
              <span className="absolute top-2 left-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">#{i + 1}</span>
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label="Remove entry"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              {render(entry, i)}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}
