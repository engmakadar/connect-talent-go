import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Mail, Lock, User as UserIcon, Search, Briefcase, Palette } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { toast } from "sonner";

const authSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(6, "Min 6 characters").max(72),
  fullName: z.string().trim().min(1).max(100).optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { mode?: "signin" | "signup" } => ({
    mode: (search.mode as string) === "signup" ? "signup" : undefined,
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode } = Route.useSearch();
  const router = useRouter();
  const isSignup = mode === "signup";
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<"jobseeker" | "employer" | "freelancer">("jobseeker");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const switchMode = (m: "signin" | "signup") =>
    router.navigate({ to: "/auth", search: { mode: m } as never, replace: true });

  const onGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/admin/review` },
    });
    if (error) toast.error(error.message);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const parsed = authSchema.safeParse({ email, password, fullName: isSignup ? fullName : undefined });
      if (!parsed.success) return toast.error(parsed.error.issues[0].message);

      if (isSignup) {
        const redirectAfter =
          role === "employer" ? "/onboarding/company"
          : role === "freelancer" ? "/freelance/profile"
          : "/admin/review";
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: `${window.location.origin}${redirectAfter}`,
            data: {
              full_name: fullName,
              requested_role: role,
              // Auto-classify on signup: Employer → employer; Job Seeker and
              // Freelance both start as jobseeker and build their profile after sign-in.
              role: role === "employer" ? "employer" : "jobseeker",
            },
          },
        });
        if (error) throw error;
        if (role === "employer") {
          toast.success("Account created. Sign in to complete company registration.");
        } else if (role === "freelancer") {
          toast.success("Account created. Sign in and build your freelance profile.");
        } else {
          toast.success("Account created. Check your email to verify, then sign in.");
        }
        switchMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // Route employers without a company through onboarding.
        const { data: sess } = await supabase.auth.getUser();
        if (sess.user) {
          const { data: prof } = await supabase.from("profiles")
            .select("company_id").eq("id", sess.user.id).maybeSingle();
          const { data: roles } = await supabase.from("user_roles")
            .select("role").eq("user_id", sess.user.id);
          const requested = (sess.user.user_metadata?.requested_role as string) || "";
          const wantsEmployer = requested === "employer" || (roles ?? []).some((r) => r.role === "employer");
          if (wantsEmployer && !prof?.company_id) {
            toast.success("Welcome — finish setting up your company.");
            return router.navigate({ to: "/onboarding/company" });
          }
        }
        toast.success("Welcome back.");
        router.navigate({ to: "/admin/review" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-secondary/40">
      <SiteHeader />

      <main className="flex-1 grid place-items-center px-4 py-10 md:py-16">
        <div className="w-full max-w-xl rounded-3xl bg-white p-8 md:p-10 ring-1 ring-black/5 shadow-[0_25px_60px_-30px_rgba(15,81,50,0.25)]">
          <h1 className="font-serif text-2xl md:text-3xl font-bold tracking-tight text-ink mb-1">
            {isSignup ? "Create your account" : "Welcome back"}
          </h1>
          <p className="text-sm text-muted-foreground mb-7">
            {isSignup
              ? "Join SahanJob to apply, hire and manage opportunities."
              : "Sign in to continue your job search or post a vacancy."}
          </p>

          {isSignup && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <RoleCard
                active={role === "jobseeker"}
                onClick={() => setRole("jobseeker")}
                icon={<Search className="h-4 w-4" />}
                title="Job Seeker"
                desc="Build a profile, get matched, apply with one click."
              />
              <RoleCard
                active={role === "employer"}
                onClick={() => setRole("employer")}
                icon={<Briefcase className="h-4 w-4" />}
                title="Employer"
                desc="Post jobs & tenders, manage applicants with the ATS."
              />
              <RoleCard
                active={role === "freelancer"}
                onClick={() => setRole("freelancer")}
                icon={<Palette className="h-4 w-4" />}
                title="Freelance"
                desc="Publish services, win contracts and get paid."
              />
            </div>
          )}

          <button
            type="button"
            onClick={onGoogle}
            className="w-full inline-flex items-center justify-center gap-3 rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-ink hover:bg-secondary/50 mb-5"
          >
            <GoogleG /> Continue with Google
          </button>

          <div className="flex items-center gap-3 mb-5">
            <span className="h-px flex-1 bg-black/10" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Or</span>
            <span className="h-px flex-1 bg-black/10" />
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            {isSignup && (
              <IconInput icon={<UserIcon className="h-4 w-4" />}>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Full name"
                  maxLength={100}
                  className="h-12 pl-11 rounded-xl border-black/10 bg-white"
                />
              </IconInput>
            )}
            <IconInput icon={<Mail className="h-4 w-4" />}>
              <Input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={255}
                placeholder="Email"
                className="h-12 pl-11 rounded-xl border-black/10 bg-white"
              />
            </IconInput>
            <IconInput icon={<Lock className="h-4 w-4" />}>
              <Input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} maxLength={72}
                placeholder={isSignup ? "Password (min 6 chars)" : "Password"}
                className="h-12 pl-11 rounded-xl border-black/10 bg-white"
              />
            </IconInput>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-bold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60"
            >
              {loading ? "Please wait…" : isSignup ? "Create account" : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
            <Link
              to="/auth"
              search={{ mode: isSignup ? "signin" : "signup" } as never}
              className="font-bold text-primary hover:underline"
            >
              {isSignup ? "Sign in" : "Sign up"}
            </Link>
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

function RoleCard({ active, onClick, icon, title, desc }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border-2 text-left px-4 py-3.5 transition ${
        active ? "border-primary bg-primary/5" : "border-black/10 hover:border-black/20 bg-white"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={`grid h-6 w-6 place-items-center rounded-full ${active ? "bg-primary text-primary-foreground" : "bg-secondary text-ink-soft"}`}>{icon}</span>
        <span className="font-bold text-sm text-ink">{title}</span>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">{desc}</p>
    </button>
  );
}

function IconInput({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="relative">
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">{icon}</span>
      {children}
    </div>
  );
}

function GoogleG() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.99.66-2.25 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/>
      <path fill="#FBBC05" d="M5.84 14.11A6.62 6.62 0 0 1 5.48 12c0-.73.13-1.44.36-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.95l3.66-2.84Z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.07.56 4.21 1.65l3.16-3.16C17.46 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"/>
    </svg>
  );
}
