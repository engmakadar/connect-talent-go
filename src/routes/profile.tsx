import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { parseResume } from "@/lib/cv-parser.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile & Preferences — VerdantHire" }] }),
  component: Profile,
});

function Profile() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState({ full_name: "", headline: "", bio: "", location: "" });
  const [prefs, setPrefs] = useState({
    preferred_categories: "", preferred_locations: "", preferred_types: "",
    min_salary: "", skills: "", notify_email: true, resume_url: "",
    education_level: "", years_experience: "",
  });
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const parseFn = useServerFn(parseResume);

  useEffect(() => {
    if (!loading && !user) router.navigate({ to: "/auth" });
  }, [loading, user, router]);

  useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: p } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      const { data: pr } = await supabase.from("jobseeker_preferences").select("*").eq("user_id", user!.id).maybeSingle();
      if (p) setProfile({ full_name: p.full_name ?? "", headline: p.headline ?? "", bio: p.bio ?? "", location: p.location ?? "" });
      if (pr) setPrefs({
        preferred_categories: (pr.preferred_categories ?? []).join(", "),
        preferred_locations: (pr.preferred_locations ?? []).join(", "),
        preferred_types: (pr.preferred_employment_types ?? []).join(", "),
        min_salary: pr.min_salary?.toString() ?? "",
        skills: (pr.skills ?? []).join(", "),
        notify_email: pr.notify_email ?? true,
        resume_url: pr.resume_url ?? "",
        education_level: pr.education_level ?? "",
        years_experience: pr.years_experience?.toString() ?? "",
      });
      return true;
    },
  });

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error: pe } = await supabase.from("profiles").update(profile).eq("id", user.id);
      if (pe) throw pe;
      const validTypes = ["full_time", "part_time", "contract", "internship", "remote"];
      const types = prefs.preferred_types.split(",").map((s) => s.trim()).filter((t) => validTypes.includes(t));
      const { error: re } = await supabase.from("jobseeker_preferences").upsert({
        user_id: user.id,
        preferred_categories: prefs.preferred_categories.split(",").map((s) => s.trim()).filter(Boolean),
        preferred_locations: prefs.preferred_locations.split(",").map((s) => s.trim()).filter(Boolean),
        preferred_employment_types: types as never,
        min_salary: prefs.min_salary ? Number(prefs.min_salary) : null,
        skills: prefs.skills.split(",").map((s) => s.trim()).filter(Boolean),
        notify_email: prefs.notify_email,
        resume_url: prefs.resume_url || null,
        education_level: prefs.education_level || null,
        years_experience: prefs.years_experience ? Number(prefs.years_experience) : null,
      });
      if (re) throw re;
      toast.success("Saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) return null;

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("File must be under 10MB."); return; }
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isDocx = file.name.toLowerCase().endsWith(".docx") ||
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (!isPdf && !isDocx) { toast.error("Please upload a PDF or DOCX resume."); return; }

    setParsing(true);
    try {
      let parsed: Awaited<ReturnType<typeof parseFn>>;
      if (isPdf) {
        const arrayBuf = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuf);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const base64 = btoa(binary);
        parsed = await parseFn({ data: { filename: file.name, mimeType: "application/pdf", base64 } });
      } else {
        // DOCX: extract text in the browser, send plain text.
        const mammoth = await import("mammoth/mammoth.browser");
        const arrayBuffer = await file.arrayBuffer();
        const { value: text } = await mammoth.extractRawText({ arrayBuffer });
        parsed = await parseFn({ data: { filename: file.name, mimeType: file.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document", text } });
      }
      // Prefill — user reviews then clicks Save changes.
      setProfile((p) => ({
        ...p,
        full_name: parsed.full_name ?? p.full_name,
        headline: parsed.headline ?? p.headline,
        bio: parsed.bio ?? p.bio,
        location: parsed.location ?? p.location,
      }));
      setPrefs((pr) => ({
        ...pr,
        skills: parsed.skills?.length ? parsed.skills.join(", ") : pr.skills,
        preferred_categories: parsed.preferred_categories?.length
          ? parsed.preferred_categories.join(", ")
          : pr.preferred_categories,
      }));
      toast.success("Resume parsed — review the fields below and click Save.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to parse resume");
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <section className="container mx-auto px-6 py-12 max-w-3xl flex-1 space-y-10">
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight mb-2">Profile</h1>
          <p className="text-muted-foreground">Public information shown alongside applications.</p>
        </div>

        <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <p className="font-semibold text-ink">Auto-fill from your CV</p>
              <p className="text-sm text-muted-foreground">Upload a PDF or DOCX resume — we'll parse it and pre-fill the fields below.</p>
            </div>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={handleResumeUpload}
            />
            <Button type="button" disabled={parsing} onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" /> {parsing ? "Parsing…" : "Upload resume"}
            </Button>
          </div>
        </div>


        <div className="space-y-4 rounded-xl border border-border bg-card p-6">
          <div className="grid sm:grid-cols-2 gap-4">
            <div><Label>Full name</Label><Input value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} maxLength={100} /></div>
            <div><Label>Location</Label><Input value={profile.location} onChange={(e) => setProfile({ ...profile, location: e.target.value })} maxLength={120} /></div>
          </div>
          <div><Label>Headline</Label><Input value={profile.headline} onChange={(e) => setProfile({ ...profile, headline: e.target.value })} placeholder="Senior Product Designer" maxLength={140} /></div>
          <div><Label>Bio</Label><Textarea rows={4} value={profile.bio} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} maxLength={1000} /></div>
        </div>

        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight mb-2">Job preferences</h2>
          <p className="text-muted-foreground mb-4">We'll match new vacancies against these and send you an in-app notification the moment one is published.</p>
          <Badge variant="outline" className="mb-4 border-gold/40 bg-gold/10 text-gold-foreground">Smart matching</Badge>

          <div className="space-y-4 rounded-xl border border-border bg-card p-6">
            <div><Label>Preferred categories (comma separated)</Label><Input value={prefs.preferred_categories} onChange={(e) => setPrefs({ ...prefs, preferred_categories: e.target.value })} placeholder="Engineering, Design, Marketing" /></div>
            <div><Label>Preferred locations</Label><Input value={prefs.preferred_locations} onChange={(e) => setPrefs({ ...prefs, preferred_locations: e.target.value })} placeholder="Remote, Berlin, NYC" /></div>
            <div><Label>Employment types (full_time, part_time, contract, internship, remote)</Label><Input value={prefs.preferred_types} onChange={(e) => setPrefs({ ...prefs, preferred_types: e.target.value })} placeholder="full_time, remote" /></div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>Min salary (USD/year)</Label><Input type="number" min={0} value={prefs.min_salary} onChange={(e) => setPrefs({ ...prefs, min_salary: e.target.value })} /></div>
              <div><Label>Resume URL</Label><Input type="url" value={prefs.resume_url} onChange={(e) => setPrefs({ ...prefs, resume_url: e.target.value })} placeholder="https://..." /></div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Education level</Label>
                <Select value={prefs.education_level} onValueChange={(v) => setPrefs({ ...prefs, education_level: v })}>
                  <SelectTrigger><SelectValue placeholder="Select education level" /></SelectTrigger>
                  <SelectContent>
                    {["High school", "Diploma", "Bachelor's degree", "Master's degree", "PhD"].map((e) => (
                      <SelectItem key={e} value={e}>{e}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Years of experience</Label><Input type="number" min={0} max={60} value={prefs.years_experience} onChange={(e) => setPrefs({ ...prefs, years_experience: e.target.value })} placeholder="5" /></div>
            </div>
            <div><Label>Skills</Label><Input value={prefs.skills} onChange={(e) => setPrefs({ ...prefs, skills: e.target.value })} placeholder="React, TypeScript, Figma" /></div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-background p-4">
              <div>
                <p className="font-medium">Email notifications</p>
                <p className="text-sm text-muted-foreground">Get notified when a new job matches your profile.</p>
              </div>
              <Switch checked={prefs.notify_email} onCheckedChange={(c) => setPrefs({ ...prefs, notify_email: c })} />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="prestige" size="lg" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
