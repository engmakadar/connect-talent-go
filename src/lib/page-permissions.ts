import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import type { AdminPageKey } from "@/lib/admin-nav";

/** Page keys automatically granted to all employer (company) users by role. */
const EMPLOYER_DEFAULT_KEYS: AdminPageKey[] = [
  "branding_settings",
  "dashboard",
  "job_approval",
  "job_moderation",
];

/** Returns the set of admin page_keys the current user can access.
 *  - Admins implicitly get all keys.
 *  - Employer users implicitly get EMPLOYER_DEFAULT_KEYS (e.g. Brand Settings).
 *  - Other users get only explicitly granted keys. */
export function usePagePermissions() {
  const { user, isAdmin, isEmployer, loading } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["page-permissions", user?.id],
    enabled: !!user && !isAdmin,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("page_permissions")
        .select("page_key")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data?.map((r) => r.page_key as AdminPageKey) ?? [];
    },
  });

  const granted = new Set<AdminPageKey>(data ?? []);
  if (isEmployer && !isAdmin) EMPLOYER_DEFAULT_KEYS.forEach((k) => granted.add(k));

  return {
    isAdmin,
    loading: loading || (!isAdmin && !!user && isLoading),
    can: (key: AdminPageKey) => isAdmin || granted.has(key),
    grantedKeys: Array.from(granted),
  };
}
