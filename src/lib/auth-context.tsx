import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "employer" | "jobseeker";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  isAdmin: boolean;
  isEmployer: boolean;
  isJobseeker: boolean;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRoles = async (uid: string) => {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    setRoles((data?.map((r) => r.role as AppRole)) ?? []);
  };

  // Block suspended/deactivated accounts at the door.
  const enforceAccountStatus = async (uid: string): Promise<boolean> => {
    const { data } = await supabase.from("profiles").select("suspended, deactivated, pending_approval").eq("id", uid).maybeSingle();
    if (data?.deactivated || data?.suspended || data?.pending_approval) {
      await supabase.auth.signOut();
      if (typeof window !== "undefined") {
        const msg = data.deactivated
          ? "This account has been deactivated."
          : data.pending_approval
          ? "Your account is awaiting Super Admin approval."
          : "This account is currently suspended.";
        import("sonner").then(({ toast }) => toast.error(msg));
      }
      return false;
    }
    return true;
  };


  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        const uid = s.user.id;
        setTimeout(async () => {
          const ok = await enforceAccountStatus(uid);
          if (ok) {
            fetchRoles(uid);
            if (event === "SIGNED_IN") {
              supabase.from("profiles").update({ last_login_at: new Date().toISOString() }).eq("id", uid).then(() => {});
              supabase.from("user_activity_log").insert({
                user_id: uid,
                event_type: "login",
                user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
                metadata: {} as never,
              }).then(() => {});
            }
          }
        }, 0);
      } else {
        setRoles([]);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        enforceAccountStatus(s.user.id).then((ok) => { if (ok) fetchRoles(s.user.id); });
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const value: AuthContextValue = {
    user,
    session,
    roles,
    loading,
    isAdmin: roles.includes("admin"),
    isEmployer: roles.includes("employer") || roles.includes("admin"),
    isJobseeker: roles.includes("jobseeker"),
    signOut: async () => { await supabase.auth.signOut(); },
    refreshRoles: async () => { if (user) await fetchRoles(user.id); },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
