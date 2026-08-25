import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { UserPlus, UserCheck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { stripHtml } from "@/lib/strip-html";
import { toast } from "sonner";

// company_followers is not yet in the generated DB types — use a narrow typed facade.
type FollowersTable = {
  delete: () => { eq: (k: string, v: string) => { eq: (k2: string, v2: string) => Promise<{ error: { message: string } | null }> } };
  insert: (row: { company_id: string; user_id: string }) => Promise<{ error: { message: string } | null }>;
};
const followersTable = () => (supabase as unknown as { from: (t: string) => FollowersTable }).from("company_followers");
const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: unknown }>)(fn, args);

function truncateWords(text: string, max: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= max) return words.join(" ");
  return words.slice(0, max).join(" ") + "…";
}

interface Props {
  companyId: string;
  companyName: string;
  description?: string | null;
}

/** Company bio (max ~200 words) + follow/unfollow button with live follower count. */
export function CompanyFollowCard({ companyId, companyName, description }: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: count = 0 } = useQuery({
    queryKey: ["company-follower-count", companyId],
    queryFn: async () => Number((await rpc("company_follower_count", { _company_id: companyId })).data ?? 0),
  });

  const { data: following = false } = useQuery({
    enabled: !!user,
    queryKey: ["company-following", companyId, user?.id],
    queryFn: async () => (await rpc("is_company_follower", { _company_id: companyId })).data === true,
  });

  const toggle = useMutation({
    mutationFn: async () => {
      if (!user) return;
      if (following) {
        const { error } = await followersTable().delete().eq("company_id", companyId).eq("user_id", user.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await followersTable().insert({ company_id: companyId, user_id: user.id });
        if (error && !error.message.includes("duplicate")) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-follower-count", companyId] });
      qc.invalidateQueries({ queryKey: ["company-following", companyId] });
      toast.success(following ? `Unfollowed ${companyName}` : `Following ${companyName}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update follow"),
  });

  const onClick = () => {
    if (!user) {
      router.navigate({ to: "/auth", search: { mode: "signin" } as never });
      return;
    }
    toggle.mutate();
  };

  const bio = truncateWords(stripHtml(description), 55);

  return (
    <div className="rounded-2xl bg-card p-5 ring-1 ring-black/5 space-y-3">
      <div className="flex items-center gap-3">
        <button
          onClick={onClick}
          disabled={toggle.isPending}
          className={
            following
              ? "inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary-soft px-4 py-2 text-sm font-semibold text-primary ring-1 ring-primary/20 hover:bg-primary-soft/70"
              : "inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
          }
        >
          {following ? <><UserCheck className="h-4 w-4" /> Following</> : <><UserPlus className="h-4 w-4" /> Follow</>}
        </button>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
          <Users className="h-3.5 w-3.5" /> {count.toLocaleString()} follower{count === 1 ? "" : "s"}
        </span>
      </div>

      {bio && (
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">About {companyName}</p>
          <p className="text-sm text-ink/80 leading-relaxed">{bio}</p>
        </div>
      )}

      <Link
        to="/companies/$companyId"
        params={{ companyId }}
        className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
      >
        See the company details <ArrowRight className="h-3.5 w-3.5" />
      </Link>

      {!user && <p className="text-[11px] text-muted-foreground">Sign in to follow this company.</p>}
    </div>
  );
}

