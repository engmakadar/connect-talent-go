import { Bell, Check, CheckCheck } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function NotificationsBell({ className = "" }: { className?: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data } = useQuery({
    enabled: !!user,
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, title, body, link, category, read_at, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(30);
      return data ?? [];
    },
    refetchInterval: 60_000,
  });

  if (!user) return null;
  const items = data ?? [];
  const unread = items.filter((n) => !n.read_at).length;

  const markAll = async () => {
    const ids = items.filter((n) => !n.read_at).map((n) => n.id);
    if (!ids.length) return;
    const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["notifications", user.id] });
  };

  const markOne = async (id: string) => {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["notifications", user.id] });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={`relative grid h-9 w-9 place-items-center rounded-full hover:bg-secondary ${className}`} aria-label="Notifications">
          <Bell className="h-4 w-4 text-ink-soft" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/5">
          <p className="font-display font-bold text-ink">Notifications</p>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAll}>
              <CheckCheck className="h-3 w-3" /> Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {!items.length ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Bell className="h-6 w-6 mx-auto mb-2 opacity-40" /> No notifications yet
            </div>
          ) : (
            <ul className="divide-y divide-black/5">
              {items.map((n) => (
                <li key={n.id} className={`px-4 py-3 cursor-pointer hover:bg-secondary/40 ${!n.read_at ? "bg-primary/5" : ""}`} onClick={() => markOne(n.id)}>
                  <div className="flex items-start gap-2.5">
                    {!n.read_at && <span className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink truncate">{n.title}</p>
                      {n.body && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.body}</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</p>
                    </div>
                    {n.read_at && <Check className="h-3 w-3 text-muted-foreground mt-1" />}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
