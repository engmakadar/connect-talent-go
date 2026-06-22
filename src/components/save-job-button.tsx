import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

type Props = {
  jobId: string;
  variant?: "icon" | "button";
  className?: string;
};

export function SaveJobButton({ jobId, variant = "icon", className }: Props) {
  const { user, isJobseeker } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: saved } = useQuery({
    enabled: !!user && isJobseeker,
    queryKey: ["saved-job", user?.id, jobId],
    queryFn: async () => {
      const { data } = await supabase
        .from("saved_jobs")
        .select("id")
        .eq("user_id", user!.id)
        .eq("job_id", jobId)
        .maybeSingle();
      return !!data;
    },
  });

  const toggle = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in required");
      if (saved) {
        const { error } = await supabase
          .from("saved_jobs")
          .delete()
          .eq("user_id", user.id)
          .eq("job_id", jobId);
        if (error) throw error;
        return false;
      }
      const { error } = await supabase
        .from("saved_jobs")
        .insert({ user_id: user.id, job_id: jobId });
      if (error) throw error;
      return true;
    },
    onSuccess: (nowSaved) => {
      qc.invalidateQueries({ queryKey: ["saved-job", user?.id, jobId] });
      qc.invalidateQueries({ queryKey: ["saved-jobs-list", user?.id] });
      toast.success(nowSaved ? "Job saved" : "Removed from saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      router.navigate({ to: "/auth" });
      return;
    }
    if (!isJobseeker) {
      toast.error("Only jobseekers can save jobs");
      return;
    }
    toggle.mutate();
  };

  // Hide entirely for employers/admins to keep the UI clean.
  if (user && !isJobseeker) return null;

  if (variant === "button") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={toggle.isPending}
        className={
          className ??
          `inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ring-1 transition-colors ${
            saved
              ? "bg-primary text-primary-foreground ring-primary"
              : "bg-white text-ink ring-black/10 hover:bg-secondary"
          }`
        }
        aria-pressed={!!saved}
      >
        {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        {saved ? "Saved" : "Save job"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={toggle.isPending}
      aria-label={saved ? "Remove from saved jobs" : "Save job"}
      title={saved ? "Remove from saved jobs" : "Save job"}
      className={
        className ??
        `grid h-9 w-9 place-items-center rounded-full transition-colors ${
          saved ? "text-primary bg-primary-soft" : "text-muted-foreground hover:text-primary hover:bg-secondary"
        }`
      }
    >
      {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
    </button>
  );
}
