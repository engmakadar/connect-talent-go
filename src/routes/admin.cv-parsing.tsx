import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileCode2, Sparkles, Upload, User, Briefcase, GraduationCap, Award, Phone } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { parseResume, type ParsedResume } from "@/lib/cv-parser.functions";

export const Route = createFileRoute("/admin/cv-parsing")({
  head: () => ({
    meta: [
      { title: "CV Parsing Models — SahanJobs Admin" },
      { name: "description", content: "AI-powered CV/resume parsing console for SahanJobs administrators." },
      { property: "og:title", content: "CV Parsing Models — SahanJobs Admin" },
      { property: "og:description", content: "AI-powered CV/resume parsing console for SahanJobs administrators." },
    ],
  }),
  component: CvParsingPage,
});

function CvParsingPage() {
  const parseFn = useServerFn(parseResume);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedResume | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("File must be under 10MB."); return; }
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isDocx = file.name.toLowerCase().endsWith(".docx") ||
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (!isPdf && !isDocx) { toast.error("Please upload a PDF or DOCX resume."); return; }

    setParsing(true);
    setParsed(null);
    try {
      let result: ParsedResume;
      if (isPdf) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        result = await parseFn({ data: { filename: file.name, mimeType: "application/pdf", base64: btoa(binary) } });
      } else {
        const mammoth = await import("mammoth/mammoth.browser");
        const { value: text } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        result = await parseFn({ data: { filename: file.name, mimeType: file.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document", text } });
      }
      setParsed(result);
      setFileName(file.name);
      toast.success("Resume parsed successfully.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to parse resume");
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <AdminShell pageKey="cv_parsing" title="CV Parsing Models" subtitle="Upload a candidate resume (PDF or DOCX) and the AI model extracts structured profile data.">
      {/* Upload card */}
      <div className="rounded-2xl bg-white ring-1 ring-black/5 p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold text-ink">Gemini 2.5 Flash — resume extraction model</p>
            <p className="text-sm text-muted-foreground">Extracts contact details, skills, education, experience, certificates and references into structured fields.</p>
          </div>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={handleUpload}
          />
          <Button disabled={parsing} onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4" /> {parsing ? "Parsing…" : "Upload resume"}
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {!parsed && !parsing && (
        <div className="mt-6 rounded-2xl border border-dashed border-black/15 bg-white/60 p-16 text-center text-muted-foreground">
          <FileCode2 className="mx-auto h-10 w-10 opacity-40 mb-3" />
          <p className="font-medium">No resume parsed yet</p>
          <p className="text-sm">Upload a PDF or DOCX file to preview the extracted data.</p>
        </div>
      )}

      {/* Parsed result */}
      {parsed && (
        <div className="mt-6 space-y-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileCode2 className="h-4 w-4" />
            <span className="font-medium text-ink">{fileName}</span>
            <Badge variant="outline" className="text-primary border-primary/30">Parsed</Badge>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Identity */}
            <section className="rounded-2xl bg-white ring-1 ring-black/5 p-6">
              <h3 className="flex items-center gap-2 font-display font-semibold text-ink mb-4"><User className="h-4 w-4 text-primary" /> Candidate</h3>
              <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <Field label="Full name" value={parsed.full_name} />
                <Field label="Headline" value={parsed.headline} />
                <Field label="Email" value={parsed.email} />
                <Field label="Phone" value={parsed.phone} />
                <Field label="Location" value={parsed.location} />
                <Field label="Nationality" value={parsed.nationality} />
                <Field label="Date of birth" value={parsed.date_of_birth} />
              </dl>
              {(parsed.summary || parsed.bio) && (
                <p className="mt-4 text-sm text-muted-foreground leading-relaxed">{parsed.summary ?? parsed.bio}</p>
              )}
              {parsed.skills && parsed.skills.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {parsed.skills.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}
                </div>
              )}
            </section>

            {/* Experience */}
            <section className="rounded-2xl bg-white ring-1 ring-black/5 p-6">
              <h3 className="flex items-center gap-2 font-display font-semibold text-ink mb-4"><Briefcase className="h-4 w-4 text-primary" /> Experience ({parsed.experience?.length ?? 0})</h3>
              <ul className="space-y-3 text-sm">
                {(parsed.experience ?? []).map((x, i) => (
                  <li key={i} className="rounded-lg bg-secondary/50 p-3">
                    <p className="font-medium text-ink">{x.position} {x.company ? `· ${x.company}` : ""}</p>
                    <p className="text-xs text-muted-foreground">{[x.start_date, x.current ? "Present" : x.end_date].filter(Boolean).join(" — ")}{x.location ? ` · ${x.location}` : ""}</p>
                  </li>
                ))}
                {(parsed.experience ?? []).length === 0 && <li className="text-muted-foreground">No experience extracted.</li>}
              </ul>
            </section>

            {/* Education */}
            <section className="rounded-2xl bg-white ring-1 ring-black/5 p-6">
              <h3 className="flex items-center gap-2 font-display font-semibold text-ink mb-4"><GraduationCap className="h-4 w-4 text-primary" /> Education ({parsed.education?.length ?? 0})</h3>
              <ul className="space-y-3 text-sm">
                {(parsed.education ?? []).map((ed, i) => (
                  <li key={i} className="rounded-lg bg-secondary/50 p-3">
                    <p className="font-medium text-ink">{ed.major || ed.school}</p>
                    <p className="text-xs text-muted-foreground">{ed.school}{[ed.start_date, ed.end_date].filter(Boolean).length ? ` · ${[ed.start_date, ed.end_date].filter(Boolean).join(" — ")}` : ""}</p>
                  </li>
                ))}
                {(parsed.education ?? []).length === 0 && <li className="text-muted-foreground">No education extracted.</li>}
              </ul>
            </section>

            {/* Certificates & references */}
            <section className="rounded-2xl bg-white ring-1 ring-black/5 p-6 space-y-5">
              <div>
                <h3 className="flex items-center gap-2 font-display font-semibold text-ink mb-3"><Award className="h-4 w-4 text-primary" /> Certificates ({parsed.certificates?.length ?? 0})</h3>
                <ul className="space-y-2 text-sm">
                  {(parsed.certificates ?? []).map((c, i) => (
                    <li key={i} className="text-ink">{c.name} {c.date ? <span className="text-xs text-muted-foreground">· {c.date}</span> : null}</li>
                  ))}
                  {(parsed.certificates ?? []).length === 0 && <li className="text-muted-foreground">None extracted.</li>}
                </ul>
              </div>
              <div>
                <h3 className="flex items-center gap-2 font-display font-semibold text-ink mb-3"><Phone className="h-4 w-4 text-primary" /> References ({parsed.refs?.length ?? 0})</h3>
                <ul className="space-y-2 text-sm">
                  {(parsed.refs ?? []).map((r, i) => (
                    <li key={i} className="text-ink">{r.name} {r.company ? <span className="text-xs text-muted-foreground">· {r.position} at {r.company}</span> : null}</li>
                  ))}
                  {(parsed.refs ?? []).length === 0 && <li className="text-muted-foreground">None extracted.</li>}
                </ul>
              </div>
            </section>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink">{value || "—"}</dd>
    </div>
  );
}
