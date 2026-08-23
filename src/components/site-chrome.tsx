import { Link, useRouter } from "@tanstack/react-router";
import {
  LogOut, User as UserIcon, Shield, Plus, LayoutDashboard, Users,
  Facebook, Linkedin, Twitter, Instagram, Mail, Phone, MapPin,
  Building2, Receipt, ChevronDown, ClipboardCheck, FileText, Bookmark, Wrench,
} from "lucide-react";
import logo from "@/assets/sahan-logo.png";
import { useAuth } from "@/lib/auth-context";
import { usePagePermissions } from "@/lib/page-permissions";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { NotificationsBell } from "@/components/notifications-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { CompanyLogo } from "@/components/company-logo";
import { useCompanySummary } from "@/hooks/use-company-summary";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function SiteHeader() {
  const { user, isAdmin, isEmployer, isJobseeker, signOut } = useAuth();
  const perms = usePagePermissions();
  const router = useRouter();
  const { data: cs } = useCompanySummary();
  const company = cs?.company ?? null;
  // Super Admins are exempt from subscriptions/trial — never surface trial UI to them.
  const onTrial = !isAdmin && !!cs?.onTrial;
  const trialDaysLeft = cs?.trialDaysLeft ?? 0;

  const navLink =
    "text-sm font-semibold text-ink hover:text-primary transition-colors";

  const canPostJob = perms.can("post_job");
  const canReview = perms.can("job_approval");

  // Jobseekers only see "My Resume" if they have an active subscription.
  const { data: jobseekerHasSub } = useQuery({
    enabled: !!user && isJobseeker && !isAdmin && !isEmployer,
    queryKey: ["jobseeker-sub", user?.id],
    queryFn: async () => {
      const { data } = await supabase.rpc("has_active_subscription", { _user_id: user!.id });
      return data === true;
    },
  });
  const canSeeResume = isJobseeker && jobseekerHasSub === true;

  return (
    <nav className="bg-hero-band">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2">
          <img src={logo} alt="SahanJobs" className="h-9 w-auto" />
        </Link>

        <div className="hidden md:flex items-center gap-6">
          <Link to="/" className={navLink} activeOptions={{ exact: true }} activeProps={{ className: "text-primary" }}>Home</Link>
          <Link to="/jobs" className={navLink} activeProps={{ className: "text-primary" }}>Jobs</Link>
          <Link to="/tender" className={navLink} activeProps={{ className: "text-primary" }}>Tender</Link>
          <Link to="/services" className={navLink} activeProps={{ className: "text-primary" }}>Services</Link>
          <Link to="/freelance" className={navLink} activeProps={{ className: "text-primary" }}>Freelance</Link>
          <Link to="/plans" className={navLink} activeProps={{ className: "text-primary" }}>Pricing</Link>
          <Link to="/trust" className={navLink} activeProps={{ className: "text-primary" }}>Trust Center</Link>

          {user && canPostJob && (
            <Link to="/admin/post-job" className={navLink} activeProps={{ className: "text-primary" }}>Post a Job</Link>
          )}
          {user && canReview && (
            <Link to="/admin/review" className={navLink} activeProps={{ className: "text-primary" }}>Review</Link>
          )}
        </div>

        <div className="flex items-center gap-3">
          {!user ? (
            <>
              <button
                onClick={() => router.navigate({ to: "/auth" })}
                className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-ink shadow-sm ring-1 ring-black/5 hover:bg-secondary"
              >
                Sign In
              </button>
              <button
                onClick={() => router.navigate({ to: "/auth", search: { mode: "signup" } as never })}
                className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
              >
                Sign Up
              </button>
            </>
          ) : (
            <>
              <NotificationsBell />
              <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex items-center gap-2 rounded-full bg-white px-2 py-1 pr-3 text-sm font-semibold text-ink shadow-sm ring-1 ring-black/5 hover:bg-secondary">
                  {company ? (
                    <CompanyLogo company={company.name} logoUrl={company.logo_url} size={28} className="h-7 w-7 rounded-full" />
                  ) : (
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground">
                      <UserIcon className="h-3.5 w-3.5" />
                    </span>
                  )}
                  <span className="hidden sm:inline max-w-[160px] truncate">
                    {company?.name ?? user.email}
                  </span>
                  {onTrial && (
                    <Badge className="hidden md:inline-flex bg-amber-100 text-amber-800 border-0 text-[10px]">
                      Trial · {trialDaysLeft}d
                    </Badge>
                  )}
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72 p-0">
                {/* Account header — company logo + name */}
                <div className="flex items-center gap-3 px-3 py-3 border-b border-border bg-secondary/50">
                  {company ? (
                    <CompanyLogo company={company.name} logoUrl={company.logo_url} size={40} className="h-10 w-10" />
                  ) : (
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Building2 className="h-5 w-5" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">{isAdmin ? "Admin Panel" : "My Account"}</p>
                    <p className="text-sm font-semibold text-ink truncate">{company?.name ?? user.email}</p>
                    {onTrial && (
                      <p className="text-[11px] text-amber-700 font-medium">Free trial · {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} left</p>
                    )}
                  </div>
                </div>

                <div className="py-1">
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Account</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => router.navigate({ to: "/settings" })}>
                    <Shield className="mr-2 h-4 w-4" /> Settings & Privacy
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.navigate({ to: "/profile" })}>
                    <UserIcon className="mr-2 h-4 w-4" /> Profile & Preferences
                  </DropdownMenuItem>
                  {isJobseeker && (
                    <>
                      <DropdownMenuItem onClick={() => router.navigate({ to: "/matches" })}>
                        <LayoutDashboard className="mr-2 h-4 w-4" /> Matched Jobs
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => router.navigate({ to: "/saved-jobs" })}>
                        <Bookmark className="mr-2 h-4 w-4" /> Saved Jobs
                      </DropdownMenuItem>
                      {canSeeResume && (
                        <DropdownMenuItem onClick={() => router.navigate({ to: "/resume" })}>
                          <FileText className="mr-2 h-4 w-4" /> My Resume
                        </DropdownMenuItem>
                      )}
                    </>
                  )}
                  {isEmployer && !isAdmin && (
                    <DropdownMenuItem onClick={() => router.navigate({ to: "/company/users" })}>
                      <Users className="mr-2 h-4 w-4" /> Team Members
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => router.navigate({ to: "/applications" })}>
                    <LayoutDashboard className="mr-2 h-4 w-4" /> My Applications
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.navigate({ to: "/services/orders" })}>
                    <Wrench className="mr-2 h-4 w-4" /> Service Orders
                  </DropdownMenuItem>
                  {(isEmployer || isAdmin) && (
                    <DropdownMenuItem onClick={() => router.navigate({ to: "/billing" })}>
                      <Receipt className="mr-2 h-4 w-4" /> Billing & Invoices
                    </DropdownMenuItem>
                  )}
                </div>

                {(canReview || canPostJob) && (
                  <>
                    <DropdownMenuSeparator className="my-0" />
                    <div className="py-1">
                      <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Workspace</DropdownMenuLabel>
                      {canReview && (
                        <DropdownMenuItem onClick={() => router.navigate({ to: "/admin/review" })}>
                          <ClipboardCheck className="mr-2 h-4 w-4" /> Review Queue
                        </DropdownMenuItem>
                      )}
                      {canPostJob && (
                        <DropdownMenuItem onClick={() => router.navigate({ to: "/admin/post-job" })}>
                          <Plus className="mr-2 h-4 w-4" /> Post a Job
                        </DropdownMenuItem>
                      )}
                      {isAdmin && (
                        <DropdownMenuItem onClick={() => router.navigate({ to: "/admin/dashboard" })}>
                          <Building2 className="mr-2 h-4 w-4" /> Admin Console
                        </DropdownMenuItem>
                      )}
                    </div>
                  </>
                )}

                <DropdownMenuSeparator className="my-0" />
                <div className="py-1">
                  <DropdownMenuItem onClick={() => signOut().then(() => router.navigate({ to: "/" }))}>
                    <LogOut className="mr-2 h-4 w-4" /> Sign Out
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

export function SiteFooter() {
  const { isAdmin } = useAuth();
  return (
    <footer className="bg-footer text-footer-foreground">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className={`grid gap-12 md:grid-cols-2 ${isAdmin ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
          <div className="lg:col-span-1">
            <div className="rounded-lg bg-white/95 px-3 py-2 inline-block">
              <img src={logo} alt="SahanJobs" className="h-8 w-auto" />
            </div>
            <p className="mt-5 text-sm text-footer-foreground/70 max-w-xs">
              Connecting talented professionals with leading employers across the region. Your gateway to career success.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-footer-foreground/80">
              <li className="flex items-center gap-2"><Mail className="size-4" /><span>info@sahanjobs.com</span></li>
              <li className="flex items-center gap-2"><Phone className="size-4" /><span>+252 612 333 542</span></li>
              <li className="flex items-center gap-2"><MapPin className="size-4" /><span>Mogadishu, Somalia</span></li>
            </ul>
          </div>

          <FooterCol title="For Job Seekers" items={[
            { label: "Browse Jobs", to: "/jobs" },
            { label: "Build Profile", to: "/profile" },
            { label: "Sign In", to: "/auth" },
          ]} />

          <FooterCol title="For Employers" items={[
            { label: "Post a Job", to: "/admin/post-job" },
            { label: "Sign Up", to: "/auth" },
          ]} />

          {isAdmin && (
            <FooterCol title="Admin" items={[
              { label: "Review Queue", to: "/admin/review" },
              { label: "Manage Users", to: "/admin/users" },
              { label: "Companies", to: "/admin/companies" },
            ]} />
          )}

          <FooterCol title="Legal" items={[
            { label: "Privacy Policy", to: "/" },
            { label: "Terms & Conditions", to: "/" },
          ]} />
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 md:flex-row">
          <p className="text-xs text-footer-foreground/60">
            © {new Date().getFullYear()} SahanJobs. All rights reserved.
          </p>
          <div className="flex gap-4">
            <a href="#" aria-label="Facebook" className="text-footer-foreground/70 hover:text-white"><Facebook className="size-4" /></a>
            <a href="#" aria-label="LinkedIn" className="text-footer-foreground/70 hover:text-white"><Linkedin className="size-4" /></a>
            <a href="#" aria-label="Twitter" className="text-footer-foreground/70 hover:text-white"><Twitter className="size-4" /></a>
            <a href="#" aria-label="Instagram" className="text-footer-foreground/70 hover:text-white"><Instagram className="size-4" /></a>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, items }: { title: string; items: { label: string; to: string }[] }) {
  return (
    <div>
      <h4 className="mb-4 text-sm font-bold text-white">{title}</h4>
      <ul className="space-y-3 text-sm text-footer-foreground/75">
        {items.map((i) => (
          <li key={i.label}>
            <Link to={i.to} className="hover:text-white">{i.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
