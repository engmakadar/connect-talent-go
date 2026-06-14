import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
  });
  const [saving, setSaving] = useState(false);

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

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <section className="container mx-auto px-6 py-12 max-w-3xl flex-1 space-y-10">
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight mb-2">Profile</h1>
          <p className="text-muted-foreground">Public information shown alongside applications.</p>
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
          <p className="text-muted-foreground mb-4">We'll match new vacancies against these and notify you.</p>
          <Badge variant="outline" className="mb-4 border-gold/40 bg-gold/10 text-gold-foreground">Smart matching</Badge>

          <div className="space-y-4 rounded-xl border border-border bg-card p-6">
            <div><Label>Preferred categories (comma separated)</Label><Input value={prefs.preferred_categories} onChange={(e) => setPrefs({ ...prefs, preferred_categories: e.target.value })} placeholder="Engineering, Design, Marketing" /></div>
            <div><Label>Preferred locations</Label><Input value={prefs.preferred_locations} onChange={(e) => setPrefs({ ...prefs, preferred_locations: e.target.value })} placeholder="Remote, Berlin, NYC" /></div>
            <div><Label>Employment types (full_time, part_time, contract, internship, remote)</Label><Input value={prefs.preferred_types} onChange={(e) => setPrefs({ ...prefs, preferred_types: e.target.value })} placeholder="full_time, remote" /></div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>Min salary (USD/year)</Label><Input type="number" min={0} value={prefs.min_salary} onChange={(e) => setPrefs({ ...prefs, min_salary: e.target.value })} /></div>
              <div><Label>Resume URL</Label><Input type="url" value={prefs.resume_url} onChange={(e) => setPrefs({ ...prefs, resume_url: e.target.value })} placeholder="https://..." /></div>
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
