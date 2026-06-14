import { createFileRoute, useRouter, redirect } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { z } from "zod";
import { Building2, Globe, Mail, Phone, MapPin, ArrowRight, Upload, User, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "@/components/rich-text-editor";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { toast } from "sonner";

const schema = z.object({
  name: z.string().trim().min(2, "Company name is required").max(200),
  contact_name: z.string().trim().min(2, "Contact name is required").max(120),
  website: z.string().url().max(500).optional().or(z.literal("")),
  contact_email: z.string().email().max(255).optional().or(z.literal("")),
  contact_phone: z.string().trim().max(40).optional(),
  hq_location: z.string().trim().min(2, "HQ location is required").max(120),
  description: z.string().trim().min(20, "Company description is required").max(20000),
});

export const Route = createFileRoute("/onboarding/company")({
  head: () => ({ meta: [{ title: "Complete company registration — SahanJob" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { mode: "signin" } as never });
  },
  component: OnboardingCompany,
});

function OnboardingCompany() {
  const { user, refreshRoles } = useAuth();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: "", contact_name: "", website: "", contact_email: "", contact_phone: "",
    hq_location: "", description: "",
  });

  // If user already has a company linked, skip onboarding.
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("company_id, email, full_name").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data?.company_id) router.navigate({ to: "/admin/post-job", replace: true });
      else {
        setForm((f) => ({
          ...f,
          contact_email: f.contact_email || (data?.email ?? ""),
          contact_name: f.contact_name || (data?.full_name ?? ""),
        }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const pickLogo = (file: File | null) => {
    setLogoFile(file);
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoPreview(file ? URL.createObjectURL(file) : null);
  };

  const uploadLogo = async (companyId: string): Promise<string | null> => {
    if (!logoFile) return null;
    const ext = logoFile.name.split(".").pop() || "png";
    const path = `${companyId}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("company-logos").upload(path, logoFile, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from("company-logos").getPublicUrl(path);
    return data.publicUrl;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    try {
      const parsed = schema.safeParse(form);
      if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }

      const { data: company, error } = await supabase.from("companies").insert({
        name: parsed.data.name,
        contact_name: parsed.data.contact_name,
        website: parsed.data.website || null,
        contact_email: parsed.data.contact_email || null,
        contact_phone: parsed.data.contact_phone || null,
        location: parsed.data.hq_location,
        hq_location: parsed.data.hq_location,
        description: parsed.data.description,
        created_by: user.id,
        source: "self",
      }).select("id").single();
      if (error) throw error;

      // Upload logo (best-effort).
      try {
        const logoUrl = await uploadLogo(company.id);
        if (logoUrl) await supabase.from("companies").update({ logo_url: logoUrl }).eq("id", company.id);
      } catch (uErr) {
        console.warn("Logo upload failed", uErr);
      }

      // Link profile + add employer role (DB trigger blocks if user is already an Admin).
      await supabase.from("profiles").update({ company_id: company.id }).eq("id", user.id);
      const { error: roleErr } = await supabase.from("user_roles")
        .insert({ user_id: user.id, role: "employer" });
      if (roleErr && !roleErr.message.includes("duplicate")) throw roleErr;

      // Auto-attach Free plan so the new company can post immediately.
      await supabase.from("subscriptions").insert({
        company_id: company.id, plan: "free", active: true,
      });

      await refreshRoles();
      toast.success("Company registered. Your employer account is now active — pending Super Admin review.");
      router.navigate({ to: "/admin/post-job" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to register company");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-secondary/40">
      <SiteHeader />
      <main className="flex-1 grid place-items-center px-4 py-10 md:py-16">
        <div className="w-full max-w-2xl rounded-3xl bg-white p-8 md:p-10 ring-1 ring-black/5 shadow-[0_25px_60px_-30px_rgba(15,81,50,0.25)]">
          <div className="flex items-center gap-3 mb-2">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary"><Building2 className="h-5 w-5" /></span>
            <h1 className="font-serif text-2xl md:text-3xl font-bold tracking-tight text-ink">Register your company</h1>
          </div>
          <p className="text-sm text-muted-foreground mb-7">
            Employer accounts must complete company registration before activation. This information will appear on every job you post.
          </p>

          <form onSubmit={onSubmit} className="space-y-4">
            <F label="Company name *">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={200} placeholder="Acme Holdings Ltd" />
            </F>

            {/* Logo upload */}
            <F label="Company logo">
              <div className="flex items-center gap-4">
                <div className="grid h-20 w-20 place-items-center rounded-2xl bg-secondary ring-1 ring-black/5 overflow-hidden">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo preview" className="h-full w-full object-cover" />
                  ) : (
                    <Building2 className="h-7 w-7 text-muted-foreground" />
                  )}
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} className="rounded-full">
                    <Upload className="h-4 w-4" /> {logoFile ? "Change" : "Upload"}
                  </Button>
                  {logoFile && (
                    <Button type="button" variant="ghost" onClick={() => pickLogo(null)} className="rounded-full text-destructive">
                      <X className="h-4 w-4" /> Remove
                    </Button>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pickLogo(e.target.files?.[0] ?? null)} />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">PNG, JPG or SVG. Square images render best.</p>
            </F>

            <div className="grid sm:grid-cols-2 gap-4">
              <F label="Contact name *">
                <IconInput icon={<User className="h-4 w-4" />}>
                  <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} className="pl-10" required placeholder="Full name" />
                </IconInput>
              </F>
              <F label="HQ location *">
                <IconInput icon={<MapPin className="h-4 w-4" />}>
                  <Input value={form.hq_location} onChange={(e) => setForm({ ...form, hq_location: e.target.value })} className="pl-10" required placeholder="City, Country" />
                </IconInput>
              </F>
              <F label="Website">
                <IconInput icon={<Globe className="h-4 w-4" />}>
                  <Input type="url" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="pl-10" placeholder="https://" />
                </IconInput>
              </F>
              <F label="Contact phone">
                <IconInput icon={<Phone className="h-4 w-4" />}>
                  <Input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} className="pl-10" />
                </IconInput>
              </F>
              <F label="Contact email">
                <IconInput icon={<Mail className="h-4 w-4" />}>
                  <Input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} className="pl-10" />
                </IconInput>
              </F>
            </div>

            <F label="About the company *">
              <RichTextEditor
                value={form.description}
                onChange={(v) => setForm({ ...form, description: v })}
                placeholder="Mission, what you do, who you serve, milestones…"
                minHeight={160}
              />
              <p className="text-[11px] text-muted-foreground mt-1">This is shown on every job posting under "About the company".</p>
            </F>

            <Button type="submit" disabled={submitting} className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-sm font-bold">
              {submitting ? "Registering…" : <>Complete registration <ArrowRight className="h-4 w-4" /></>}
            </Button>
          </form>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
function IconInput({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">{icon}</span>
      {children}
    </div>
  );
}
