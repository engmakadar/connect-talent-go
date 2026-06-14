import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Palette, Upload, Save, Globe, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";

export const Route = createFileRoute("/admin/branding")({
  head: () => ({ meta: [{ title: "Brand Settings — SahanJobs" }] }),
  component: () => (
    <AdminShell
      pageKey="branding_settings"
      title="Brand Settings"
      subtitle="Manage your company profile, logo, and presentation across SahanJobs."
    >
      <BrandingPanel />
    </AdminShell>
  ),
});

function BrandingPanel() {
  const { user, isEmployer, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    name: "", website: "", contact_email: "", contact_phone: "",
    location: "", description: "", logo_url: "" as string | null,
  });

  // Employer's company: prefer profile.company_id, else the company they created.
  const { data: company, isLoading } = useQuery({
    enabled: !!user,
    queryKey: ["my-company", user?.id],
    queryFn: async () => {
      const { data: profile } = await supabase
        .from("profiles").select("company_id").eq("id", user!.id).maybeSingle();
      const cid = profile?.company_id ?? null;
      if (cid) {
        const { data } = await supabase.from("companies").select("*").eq("id", cid).maybeSingle();
        return data;
      }
      const { data } = await supabase
        .from("companies").select("*").eq("created_by", user!.id)
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      return data;
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!company) return;
    setForm({
      name: company.name ?? "",
      website: company.website ?? "",
      contact_email: company.contact_email ?? "",
      contact_phone: company.contact_phone ?? "",
      location: company.location ?? "",
      description: company.description ?? "",
      logo_url: company.logo_url ?? "",
    });
  }, [company]);

  if (!isEmployer && !isAdmin) {
    return (
      <div className="rounded-2xl bg-white p-12 ring-1 ring-black/5 text-center">
        <Palette className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
        <h2 className="font-semibold text-ink mb-1">Brand Settings are for Employer / Company users</h2>
        <p className="text-sm text-muted-foreground">Your account is not linked to a company.</p>
      </div>
    );
  }

  if (isLoading) return <div className="h-64 rounded-2xl bg-white ring-1 ring-black/5 animate-pulse" />;

  if (!company) {
    return (
      <div className="rounded-2xl bg-white p-12 ring-1 ring-black/5 text-center">
        <Building2 className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
        <h2 className="font-semibold text-ink mb-1">No company linked to your account</h2>
        <p className="text-sm text-muted-foreground">Ask a Super Admin to enroll your company and assign you to it.</p>
      </div>
    );
  }

  const uploadLogo = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${company.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("company-logos").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("company-logos").getPublicUrl(path);
      setForm((f) => ({ ...f, logo_url: pub.publicUrl }));
      toast.success("Logo uploaded — remember to save.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("companies").update({
        name: form.name.trim(), website: form.website || null, contact_email: form.contact_email || null,
        contact_phone: form.contact_phone || null, location: form.location || null,
        description: form.description || null, logo_url: form.logo_url || null,
      }).eq("id", company.id);
      if (error) throw error;
      await logAudit({ action: "company.update", resource_type: "company", resource_id: company.id });
      toast.success("Brand profile updated.");
      qc.invalidateQueries({ queryKey: ["my-company"] });
      qc.invalidateQueries({ queryKey: ["companies"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-6">
      <aside className="rounded-2xl bg-white p-6 ring-1 ring-black/5 shadow-sm space-y-4 h-fit">
        <div className="aspect-square w-full rounded-xl bg-secondary grid place-items-center overflow-hidden">
          {form.logo_url ? (
            <img src={form.logo_url} alt="" className="h-full w-full object-contain" />
          ) : (
            <Building2 className="h-12 w-12 text-muted-foreground" />
          )}
        </div>
        <label className="block">
          <span className="sr-only">Upload logo</span>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
          <Button type="button" variant="outline" className="w-full rounded-full" disabled={uploading} asChild>
            <span className="inline-flex items-center gap-2 cursor-pointer">
              <Upload className="h-4 w-4" /> {uploading ? "Uploading…" : "Upload logo"}
            </span>
          </Button>
        </label>
        <div className="text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-ink">{form.name || "Unnamed company"}</p>
          {form.website && <p className="inline-flex items-center gap-1"><Globe className="h-3 w-3" /> {form.website}</p>}
          <div className="flex flex-wrap gap-1 pt-2">
            <Badge variant="outline" className="capitalize">{company.verification_status}</Badge>
            {company.subscription_plan && <Badge>{company.subscription_plan}</Badge>}
          </div>
        </div>
      </aside>

      <div className="rounded-2xl bg-white p-6 md:p-8 ring-1 ring-black/5 shadow-sm space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <F label="Company name *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></F>
          <F label="Website"><Input type="url" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://" /></F>
          <F label="Contact email"><Input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></F>
          <F label="Contact phone"><Input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} /></F>
          <F label="Location"><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></F>
        </div>
        <F label="About the company">
          <Textarea rows={6} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Mission, what you do, who you serve…" />
        </F>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} className="bg-primary hover:bg-primary/90 rounded-full">
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save brand profile"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
