import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { LogOut, Menu, X } from "lucide-react";
import { NotificationsBell } from "@/components/notifications-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import logo from "@/assets/sahan-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { usePagePermissions } from "@/lib/page-permissions";
import { ADMIN_NAV, type AdminPageKey } from "@/lib/admin-nav";
import { Badge } from "@/components/ui/badge";
import { CompanyLogo } from "@/components/company-logo";

interface AdminShellProps {
  pageKey: AdminPageKey;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function AdminShell({ pageKey, title, subtitle, actions, children }: AdminShellProps) {
  const { user, isAdmin, loading, signOut } = useAuth();
  const router = useRouter();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const perms = usePagePermissions();
  const [mobileOpen, setMobileOpen] = useState(false);

  // RBAC gate — redirect unauthorized users to first page they can access
  useEffect(() => {
    if (loading || perms.loading) return;
    if (!user) {
      router.navigate({ to: "/auth" });
      return;
    }
    if (!perms.can(pageKey)) {
      // Find the first page they can access; otherwise go to public jobs.
      import("@/lib/admin-nav").then(({ firstAccessiblePath }) => {
        const target = firstAccessiblePath((k) => perms.can(k));
        if (target !== window.location.pathname) router.navigate({ to: target });
      });
    }
  }, [loading, perms.loading, user, perms, pageKey, router]);

  if (loading || !user || perms.loading || !perms.can(pageKey)) {
    return <div className="min-h-screen grid place-items-center bg-hero-band/40 text-muted-foreground text-sm">Checking access…</div>;
  }

  return (
    <div className="min-h-screen bg-hero-band/30">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-white border-b border-black/5">
        <div className="flex h-14 items-center justify-between pl-3 pr-4 md:pl-0 md:pr-6">
          <div className="flex items-center gap-3 md:w-[260px] md:px-4 md:border-r md:border-black/5 md:h-14">
            <button
              onClick={() => setMobileOpen((o) => !o)}
              className="md:hidden grid h-9 w-9 place-items-center rounded-md hover:bg-secondary"
              aria-label="Toggle navigation"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <Link to="/" className="flex items-center gap-2">
              <img src={logo} alt="SahanJobs" className="h-7 w-auto" />
            </Link>
          </div>

          <div className="flex-1 px-4 hidden md:flex items-center">
            <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
          </div>

          <div className="flex items-center gap-3">
            <NotificationsBell />
            <ThemeToggle />
            <UserBadge userId={user.id} userEmail={user.email ?? ""} isAdmin={isAdmin} />
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`fixed md:sticky inset-y-0 top-0 md:top-14 left-0 z-30 w-[260px] shrink-0 bg-white border-r border-black/5 transition-transform md:translate-x-0 ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          } md:h-[calc(100vh-3.5rem)] h-screen overflow-y-auto`}
        >
          <div className="px-5 pt-5 pb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            {isAdmin ? "Superadmin Panel" : "Staff Panel"}
          </div>

          <nav className="px-2 pb-8">
            {ADMIN_NAV.map((section) => {
              const visibleItems = section.items.filter((i) => perms.can(i.key));
              if (visibleItems.length === 0) return null;
              return (
                <div key={section.title} className="mb-5">
                  <p className="px-3 pt-2 pb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                    {section.title}
                  </p>
                  <ul className="space-y-0.5">
                    {visibleItems.map((item) => {
                      const Icon = item.icon;
                      const active = item.to ? path === item.to || path.startsWith(item.to + "/") : false;
                      const isLink = !!item.to && !item.soon;
                      const inner = (
                        <span
                          className={`group flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${
                            active
                              ? "bg-primary/10 text-primary"
                              : isLink
                                ? "text-ink hover:bg-secondary"
                                : "text-muted-foreground/80 cursor-not-allowed"
                          }`}
                        >
                          <Icon className={`h-4 w-4 ${active ? "text-primary" : ""}`} />
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.soon && (
                            <Badge className="bg-muted text-muted-foreground hover:bg-muted h-4 px-1.5 text-[9px] font-bold tracking-wider border-0">SOON</Badge>
                          )}
                        </span>
                      );
                      return (
                        <li key={item.key}>
                          {isLink ? (
                            <Link to={item.to} onClick={() => setMobileOpen(false)}>{inner}</Link>
                          ) : (
                            <div aria-disabled>{inner}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}

            <div className="border-t border-black/5 pt-3 px-1">
              <button
                onClick={() => signOut().then(() => router.navigate({ to: "/" }))}
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium text-destructive hover:bg-destructive/5"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          </nav>
        </aside>

        {mobileOpen && (
          <div onClick={() => setMobileOpen(false)} className="fixed inset-0 z-20 bg-black/30 md:hidden" />
        )}

        {/* Content */}
        <main className="flex-1 min-w-0 p-4 md:p-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-ink">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

function UserBadge({ userId, userEmail, isAdmin }: { userId: string; userEmail: string; isAdmin: boolean }) {
  const { data } = useQuery({
    queryKey: ["admin-shell-identity", userId],
    queryFn: async () => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name, company_id")
        .eq("id", userId)
        .maybeSingle();
      let company: { name: string; logo_url: string | null } | null = null;
      if (prof?.company_id) {
        const { data: c } = await supabase
          .from("companies")
          .select("name, logo_url")
          .eq("id", prof.company_id)
          .maybeSingle();
        company = c ?? null;
      }
      return { full_name: prof?.full_name ?? null, company };
    },
    staleTime: 60_000,
  });

  const name = data?.full_name || userEmail.split("@")[0] || "User";
  const company = data?.company;

  return (
    <div className="hidden sm:flex items-center gap-2 rounded-full bg-secondary pl-1 pr-3 py-1">
      {company ? (
        <CompanyLogo company={company.name} logoUrl={company.logo_url} size={26} className="h-7 w-7 shrink-0 rounded-full" />
      ) : (
        <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/15 text-primary text-[11px] font-bold uppercase">
          {(name[0] ?? "?").toUpperCase()}
        </span>
      )}
      <div className="leading-tight">
        <p className="text-[12px] font-semibold text-ink truncate max-w-[160px]">{name}</p>
        <p className="text-[10px] text-muted-foreground truncate max-w-[160px]">
          {company?.name ?? (isAdmin ? "Super Admin" : "No company")}
        </p>
      </div>
    </div>
  );
}

