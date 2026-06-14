import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Briefcase, FileText, Upload, X, Plus, Check, ChevronsUpDown, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";


import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { RichTextEditor } from "@/components/rich-text-editor";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import { wordCount } from "@/lib/strip-html";

export const Route = createFileRoute("/admin/post-job")({
  head: () => ({ meta: [{ title: "Post a Job — SahanJobs Admin" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ id: (s.id as string) || "" }),
  component: () => (
    <AdminShell pageKey="post_job" title="Post a Job or Tender" subtitle="Submissions are queued for approval before going live.">
      <PostJobForm />
    </AdminShell>
  ),
});

const MAX_LONG = 250_000;
const RICH_MAX_WORDS = 20_000;

const baseSchema = z.object({
  posting_type: z.enum(["job", "tender"]),
  title: z.string().trim().min(3).max(200),
  company: z.string().trim().min(2).max(200),
  company_id: z.string().uuid().optional().nullable(),
  category: z.string().trim().min(2).max(80),
  category_id: z.string().uuid().optional().nullable(),
  location: z.string().trim().min(2).max(120),
  employment_type: z.enum(["full_time", "part_time", "contract", "internship", "remote"]),
  salary_min: z.number().int().min(0).optional(),
  salary_max: z.number().int().min(0).optional(),
  description: z.string().trim().min(20).max(MAX_LONG),
  responsibilities: z.string().trim().max(MAX_LONG).optional().default(""),
  requirements: z.string().trim().max(MAX_LONG).optional().default(""),
  education: z.string().trim().max(MAX_LONG).optional().default(""),
  experience_years: z.number().int().min(0).max(50),
  experience_text: z.string().trim().max(200).optional().default(""),
  skills: z.array(z.string().min(1).max(40)).max(20),
  application_url: z.string().url().max(500).optional().or(z.literal("")),
  application_email: z.string().email().max(255).optional().or(z.literal("")),
});

function PostJobForm() {
  const { user, isAdmin } = useAuth();
  const router = useRouter();
  const { id: editId } = Route.useSearch();
  const isEdit = !!editId;
  const [submitting, setSubmitting] = useState(false);
  const [postingType, setPostingType] = useState<"job" | "tender">("job");
  const [tenderFiles, setTenderFiles] = useState<File[]>([]);
  const [form, setForm] = useState({
    title: "", company: "", company_id: "", location: "", category: "", category_id: "",
    employment_type: "full_time" as const,
    salary_min: "", salary_max: "", description: "", responsibilities: "", requirements: "",
    education: "", experience_text: "", skills: "", application_url: "", application_email: "",
    expires_at: "",
  });

  // When editing, load the existing job and prefill.
  const { data: existing } = useQuery({
    enabled: isEdit,
    queryKey: ["edit-job", editId],
    queryFn: async () => {
      const { data, error } = await supabase.from("jobs").select("*").eq("id", editId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!existing) return;
    setPostingType((existing.posting_type as "job" | "tender") ?? "job");
    setForm({
      title: existing.title ?? "",
      company: existing.company ?? "",
      company_id: existing.company_id ?? "",
      location: existing.location ?? "",
      category: existing.category ?? "",
      category_id: existing.category_id ?? "",
      employment_type: (existing.employment_type as never) ?? "full_time",
      salary_min: existing.salary_min?.toString() ?? "",
      salary_max: existing.salary_max?.toString() ?? "",
      description: existing.description ?? "",
      responsibilities: existing.responsibilities ?? "",
      requirements: existing.requirements ?? "",
      education: existing.education ?? "",
      experience_text: existing.experience_text ?? (existing.experience_years ? `${existing.experience_years}` : ""),
      skills: (existing.skills ?? []).join(", "),
      application_url: existing.application_url ?? "",
      application_email: existing.application_email ?? "",
      expires_at: existing.expires_at ? new Date(existing.expires_at).toISOString().slice(0, 10) : "",
    });
  }, [existing]);

  // Employer's own company (locks the company field for non-admins).
  const { data: myCompany } = useQuery({
    queryKey: ["my-company-for-post", user?.id],
    enabled: !!user && !isAdmin,
    queryFn: async () => {
      const { data: prof } = await supabase.from("profiles").select("company_id").eq("id", user!.id).maybeSingle();
      if (!prof?.company_id) return null;
      const { data } = await supabase.from("companies").select("id, name").eq("id", prof.company_id).maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (myCompany && !form.company_id) {
      setForm((f) => ({ ...f, company_id: myCompany.id, company: myCompany.name }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myCompany]);

  const { data: categories } = useQuery({
    queryKey: ["categories-public"],
    queryFn: async () => (await supabase.from("job_categories").select("id, name").order("name")).data ?? [],
  });

  const { data: companies } = useQuery({
    queryKey: ["companies-picker", user?.id, isAdmin],
    queryFn: async () => {
      let q = supabase.from("companies").select("id, name, logo_url").order("name");
      if (!isAdmin) q = q.eq("created_by", user!.id);
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!user,
  });

  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const addTenderFiles = (files: FileList | null) => {
    if (!files) return;
    setTenderFiles([...tenderFiles, ...Array.from(files)].slice(0, 4));
  };

  const uploadTenderDocs = async (jobId: string) => {
    const out: { name: string; path: string }[] = [];
    for (const f of tenderFiles) {
      const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${user!.id}/${jobId}/${Date.now()}-${safe}`;
      const { error } = await supabase.storage.from("tender-documents").upload(path, f);
      if (error) throw error;
      out.push({ name: f.name, path });
    }
    return out;
  };

  const isTender = postingType === "tender";
  const descWords = wordCount(form.description);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const selectedCompany = companies?.find((c) => c.id === form.company_id);
      const selectedCategory = categories?.find((c) => c.id === form.category_id);

      if (isTender && descWords > RICH_MAX_WORDS) {
        toast.error(`Tender description exceeds ${RICH_MAX_WORDS} words (currently ${descWords}).`);
        setSubmitting(false);
        return;
      }

      // Subscription gate: non-admin posters need an active subscription.
      if (!isEdit && !isAdmin && form.company_id) {
        const { data: sub } = await supabase
          .from("subscriptions").select("plan, active")
          .eq("company_id", form.company_id).eq("active", true).maybeSingle();
        if (!sub) {
          toast.error("Your company doesn't have an active subscription plan. Contact a Super Admin to activate one.");
          setSubmitting(false);
          return;
        }
      }

      // For tenders, force-fill non-applicable fields with safe defaults so DB validation passes.
      const tenderDefaults = isTender
        ? { responsibilities: "", requirements: "", education: "", skills: "" as string,
            salary_min: "", salary_max: "", employment_type: "contract" as const }
        : {};
      const f = { ...form, ...tenderDefaults };

      const skillsArr = f.skills.split(",").map((s) => s.trim()).filter(Boolean);

      // Years of Experience is stored as text; we also parse digits into the legacy numeric column.
      const expDigits = parseInt((f.experience_text || "").replace(/[^\d]/g, ""), 10);
      const experience_years = Number.isFinite(expDigits) ? Math.min(50, Math.max(0, expDigits)) : 0;

      const parsed = baseSchema.safeParse({
        posting_type: postingType,
        ...f,
        company: selectedCompany?.name || f.company,
        company_id: f.company_id || null,
        category: selectedCategory?.name || f.category || (isTender ? "Tender" : f.category),
        category_id: f.category_id || null,
        salary_min: f.salary_min ? Number(f.salary_min) : undefined,
        salary_max: f.salary_max ? Number(f.salary_max) : undefined,
        experience_years,
        experience_text: f.experience_text || "",
        skills: skillsArr,
      });
      if (!parsed.success) {
        toast.error(parsed.error.issues[0].message);
        setSubmitting(false);
        return;
      }

      // Rich-text HTML is preserved; sanitization happens on read (RichTextView).
      const cleanedPayload = {
        ...parsed.data,
        salary_min: parsed.data.salary_min ?? null,
        salary_max: parsed.data.salary_max ?? null,
        application_url: parsed.data.application_url || null,
        application_email: parsed.data.application_email || null,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      };

      if (isEdit) {
        // Compute diffs against the previously loaded record and record full history.
        const tracked = ["title","company","location","category","employment_type","salary_min","salary_max","description","responsibilities","requirements","education","experience_text","application_url","application_email","expires_at"] as const;
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        if (existing) {
          for (const k of tracked) {
            const before = (existing as Record<string, unknown>)[k] ?? "";
            const after = (cleanedPayload as Record<string, unknown>)[k] ?? "";
            if (String(before ?? "") !== String(after ?? "")) changes[k] = { from: before, to: after };
          }
        }
        const { error } = await supabase.from("jobs").update(cleanedPayload).eq("id", editId);
        if (error) throw error;
        if (Object.keys(changes).length) {
          await supabase.from("job_edit_history").insert({ job_id: editId, edited_by: user!.id, changes: changes as never });
        }
        await logAudit({ action: "job.edit_applied", resource_type: "job", resource_id: editId, metadata: { fields: Object.keys(changes) } });
        toast.success(`Posting updated${Object.keys(changes).length ? ` — ${Object.keys(changes).length} field(s) changed` : ""}.`);
        router.navigate({ to: "/admin/jobs" });
        return;
      }

      const { data: inserted, error } = await supabase.from("jobs").insert({
        posted_by: user!.id,
        ...cleanedPayload,
        status: "pending",
        tender_documents: [],
      }).select("id").single();
      if (error) throw error;

      if (tenderFiles.length && inserted) {
        const docs = await uploadTenderDocs(inserted.id);
        await supabase.from("jobs").update({ tender_documents: docs }).eq("id", inserted.id);
      }

      toast.success("Submitted for approval. An admin will review shortly.");
      router.navigate({ to: "/admin/review" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to post");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="rounded-2xl bg-white p-6 md:p-8 ring-1 ring-black/5 shadow-sm space-y-6 max-w-4xl">
      <div className="grid grid-cols-2 gap-3">
        <TypeCard active={!isTender} onClick={() => !isEdit && setPostingType("job")} icon={<Briefcase className="h-4 w-4" />} title="Job" desc="Standard vacancy with full structured fields." />
        <TypeCard active={isTender} onClick={() => !isEdit && setPostingType("tender")} icon={<FileText className="h-4 w-4" />} title="Tender" desc="Rich description (up to 20,000 words) plus optional documents." />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Title *">
          <Input value={form.title} onChange={(e) => update("title", e.target.value)} maxLength={200} required />
        </Field>
        <Field label="Company *">
          {!isAdmin && myCompany ? (
            <div className="flex items-center gap-2 h-10 rounded-md border border-input bg-muted/50 px-3 text-sm">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium truncate">{myCompany.name}</span>
              <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">Locked to your company</span>
            </div>
          ) : companies && companies.length > 0 ? (
            <Combobox
              items={companies.map((c) => ({ value: c.id, label: c.name }))}
              value={form.company_id}
              onChange={(v) => update("company_id", v)}
              placeholder="Search company…"
              empty="No companies match."
            />
          ) : (
            <Input value={form.company} onChange={(e) => update("company", e.target.value)} placeholder="Company name" required />
          )}
        </Field>
        <Field label="Location *"><Input value={form.location} onChange={(e) => update("location", e.target.value)} required /></Field>

        {!isTender && (
          <>
            <Field label="Category *">
              <Combobox
                items={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))}
                value={form.category_id}
                onChange={(v) => update("category_id", v)}
                placeholder="Type to search categories…"
                empty="No matching category."
              />
            </Field>
            <Field label="Employment type *">
              <Select value={form.employment_type} onValueChange={(v) => update("employment_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_time">Full-time</SelectItem>
                  <SelectItem value="part_time">Part-time</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="internship">Internship</SelectItem>
                  <SelectItem value="remote">Remote</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Years of Experience *"><Input value={form.experience_text} onChange={(e) => update("experience_text", e.target.value)} placeholder="e.g. 3-5 years or Minimum 2 years" required maxLength={200} /></Field>
            <Field label="Salary min (USD)"><Input type="number" min={0} value={form.salary_min} onChange={(e) => update("salary_min", e.target.value)} /></Field>
            <Field label="Salary max (USD)"><Input type="number" min={0} value={form.salary_max} onChange={(e) => update("salary_max", e.target.value)} /></Field>
          </>
        )}
      </div>

      {isTender ? (
        <>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Years of Experience"><Input value={form.experience_text} onChange={(e) => update("experience_text", e.target.value)} placeholder="e.g. 5+ years" maxLength={200} /></Field>
          </div>
          <Field label={`Tender description * — up to ${RICH_MAX_WORDS.toLocaleString()} words`}>
            <RichTextEditor value={form.description} onChange={(v) => update("description", v)} placeholder="Enter the full tender notice: scope, eligibility, deadlines, submission instructions, etc." minHeight={420} />
            <div className="flex items-center justify-between mt-1 text-[11px]">
              <span className={cn("text-muted-foreground", descWords > RICH_MAX_WORDS && "text-destructive font-semibold")}>
                {descWords.toLocaleString()} / {RICH_MAX_WORDS.toLocaleString()} words
              </span>
            </div>
          </Field>
        </>
      ) : (
        <>
          <Field label="Description *">
            <RichTextEditor value={form.description} onChange={(v) => update("description", v)} placeholder="Overview of the role…" minHeight={140} />
          </Field>
          <Field label="Duties & Responsibilities *">
            <RichTextEditor value={form.responsibilities} onChange={(v) => update("responsibilities", v)} placeholder="What this role will do…" minHeight={180} />
          </Field>
          <Field label="Requirements *">
            <RichTextEditor value={form.requirements} onChange={(v) => update("requirements", v)} placeholder="Skills, experience, must-haves…" minHeight={180} />
          </Field>
          <Field label="Education *">
            <RichTextEditor value={form.education} onChange={(v) => update("education", v)} placeholder="Required qualifications…" minHeight={100} />
          </Field>
          <Field label="Skills (comma separated)"><Input value={form.skills} onChange={(e) => update("skills", e.target.value)} placeholder="React, TypeScript" /></Field>
        </>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Application URL"><Input type="url" value={form.application_url} onChange={(e) => update("application_url", e.target.value)} /></Field>
        <Field label="Application email"><Input type="email" value={form.application_email} onChange={(e) => update("application_email", e.target.value)} /></Field>
        <Field label="Expiration date">
          <Input
            type="date"
            value={form.expires_at}
            onChange={(e) => update("expires_at", e.target.value)}
            min={new Date().toISOString().split("T")[0]}
          />
          <p className="text-[11px] text-muted-foreground mt-1">After this date the posting is automatically hidden.</p>
        </Field>
      </div>

      <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-5">
        <div className="flex items-center gap-2 mb-1">
          <FileText className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-ink">
            {isTender ? "Tender documents" : "Supporting documents"}
            <span className="ml-1 font-normal text-muted-foreground">(optional, up to 4)</span>
          </p>
        </div>
        <p className="text-xs text-muted-foreground mb-3">PDF, Word, Excel or images.</p>
        <div className="space-y-2 mb-3">
          {tenderFiles.map((f, i) => (
            <div key={i} className="flex items-center justify-between rounded-md bg-white px-3 py-2 ring-1 ring-black/5 text-sm">
              <span className="truncate">{f.name}</span>
              <button type="button" onClick={() => setTenderFiles(tenderFiles.filter((_, j) => j !== i))} className="text-destructive">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        {tenderFiles.length < 4 && (
          <label className="inline-flex items-center gap-2 cursor-pointer rounded-full bg-white px-4 py-2 text-sm font-medium ring-1 ring-black/10 hover:bg-secondary">
            <Upload className="h-4 w-4" /> Add file
            <input type="file" multiple className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" onChange={(e) => addTenderFiles(e.target.files)} />
          </label>
        )}
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.navigate({ to: "/admin/jobs" })}>Cancel</Button>
        <Button type="submit" disabled={submitting} className="bg-primary hover:bg-primary/90">
          {submitting ? "Saving…" : isEdit ? <><Save className="h-4 w-4" /> Save changes</> : <><Plus className="h-4 w-4" /> Submit for approval</>}
        </Button>
      </div>
    </form>
  );
}

function TypeCard({ active, onClick, icon, title, desc }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-xl border-2 text-left px-4 py-3 transition ${active ? "border-primary bg-primary/5" : "border-black/10 hover:border-black/20"}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`grid h-6 w-6 place-items-center rounded-full ${active ? "bg-primary text-primary-foreground" : "bg-secondary text-ink-soft"}`}>{icon}</span>
        <span className="font-bold text-sm text-ink">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground">{desc}</p>
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function Combobox({
  items, value, onChange, placeholder, empty,
}: {
  items: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  empty: string;
}) {
  const [open, setOpen] = useState(false);
  const current = items.find((i) => i.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} className={cn("w-full justify-between font-normal", !current && "text-muted-foreground")}>
          {current?.label ?? placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>{empty}</CommandEmpty>
            <CommandGroup>
              {items.map((i) => (
                <CommandItem key={i.value} value={i.label} onSelect={() => { onChange(i.value); setOpen(false); }}>
                  <Check className={cn("mr-2 h-4 w-4", value === i.value ? "opacity-100" : "opacity-0")} />
                  {i.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

void logAudit;
