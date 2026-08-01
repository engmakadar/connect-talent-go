import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { applyToJob } from "@/lib/applications.functions";

export function ApplyButton({ jobId }: { jobId: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const apply = useServerFn(applyToJob);
  const [result, setResult] = useState<number | null>(null);

  const { data: existing, isLoading } = useQuery({
    enabled: !!user,
    queryKey: ["my-application", jobId, user?.id],
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("job_applications")
        .select("id, match_score")
        .eq("job_id", jobId)
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const mutation = useMutation({
    mutationFn: () => apply({ data: { jobId } }),
    onSuccess: (r) => {
      setResult(r.score);
      toast.success(`Application sent — ${r.score}% match${r.shortlisted ? " · shortlisted" : ""}`);
      qc.invalidateQueries({ queryKey: ["my-application", jobId] });
      qc.invalidateQueries({ queryKey: ["my-applications"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not submit application."),
  });

  const applied = !!existing || result !== null;
  const score = result ?? existing?.match_score ?? null;

  if (!user) {
    return (
      <button
        onClick={() => router.navigate({ to: "/auth" })}
        className="w-full flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
      >
        <Zap className="h-4 w-4" /> Sign in to apply
      </button>
    );
  }

  if (applied) {
    return (
      <div className="w-full rounded-full bg-primary/10 px-5 py-2.5 text-sm font-semibold text-primary flex items-center justify-center gap-2">
        <CheckCircle2 className="h-4 w-4" />
        Applied{score != null ? ` · ${score}% match` : ""}
      </div>
    );
  }

  return (
    <button
      disabled={mutation.isPending || isLoading}
      onClick={() => mutation.mutate()}
      className="w-full flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60"
    >
      {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
      {mutation.isPending ? "Applying…" : "Apply with my profile"}
    </button>
  );
}
