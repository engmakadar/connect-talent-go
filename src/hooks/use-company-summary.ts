import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

/**
 * Returns the signed-in user's company (id, name, logo) plus trial info for that company.
 * Used in the Admin Panel dropdown header and trial countdown badges.
 */
export function useCompanySummary() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["company-summary", user?.id],
    queryFn: async () => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user!.id)
        .maybeSingle();
      if (!prof?.company_id) return null;
      const { data: company } = await supabase
        .from("companies")
        .select("id, name, logo_url, location, website")
        .eq("id", prof.company_id)
        .maybeSingle();
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("plan, active, trial_ends_at, valid_until")
        .eq("company_id", prof.company_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const now = Date.now();
      const trialEnds = sub?.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : null;
      const onTrial = !!trialEnds && trialEnds > now;
      const trialDaysLeft = onTrial ? Math.max(0, Math.ceil((trialEnds! - now) / 86_400_000)) : 0;
      const trialExpired = !!trialEnds && trialEnds <= now && (!sub?.valid_until || new Date(sub.valid_until).getTime() <= now);

      return { company, subscription: sub, onTrial, trialDaysLeft, trialExpired };
    },
  });
}
