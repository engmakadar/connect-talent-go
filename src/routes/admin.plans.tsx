import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";

export const Route = createFileRoute("/admin/plans")({
  head: () => ({ meta: [{ title: "Subscription Plans — SahanJobs Admin" }] }),
  component: () => (
    <AdminShell pageKey="subscription_plans" title="Subscription Plans" subtitle="Create and manage plans available to companies and jobseekers."
      actions={<PlanDialog mode="create" />}
    >
      <PlansTable />
    </AdminShell>
  ),
});

type Plan = {
  id: string; code: string; name: string; price_cents: number; currency: string;
  billing_interval: string; description: string | null; is_active: boolean; sort_order: number;
  audience: string;
};

const AUDIENCE_LABEL: Record<string, string> = {
  employer: "Companies",
  jobseeker: "Job seekers",
  all: "Everyone",
};

function PlansTable() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: async (): Promise<Plan[]> => {
      const { data, error } = await supabase.from("subscription_plans").select("*").order("sort_order").order("price_cents");
      if (error) throw error;
      return data as Plan[];
    },
  });

  const toggleActive = async (p: Plan) => {
    const { error } = await supabase.from("subscription_plans").update({ is_active: !p.is_active }).eq("id", p.id);
    if (error) return toast.error(error.message);
    await logAudit({ action: "plan.toggle", resource_type: "plan", resource_id: p.id, metadata: { is_active: !p.is_active } });
    qc.invalidateQueries({ queryKey: ["admin-plans"] });
  };

  const remove = async (p: Plan) => {
    if (!confirm(`Delete plan "${p.name}"?`)) return;
    const { error } = await supabase.from("subscription_plans").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    await logAudit({ action: "plan.delete", resource_type: "plan", resource_id: p.id });
    qc.invalidateQueries({ queryKey: ["admin-plans"] });
  };

  if (isLoading) return <div className="h-40 rounded-2xl bg-white animate-pulse ring-1 ring-black/5" />;
  if (!data?.length) return (
    <div className="rounded-2xl bg-white p-16 text-center ring-1 ring-black/5">
      <CreditCard className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
      <p className="text-muted-foreground">No subscription plans yet. Create your first plan.</p>
    </div>
  );

  return (
    <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-secondary/50">
          <tr className="text-left">
            <th className="px-5 py-3 font-semibold">Plan</th>
            <th className="px-5 py-3 font-semibold">Audience</th>
            <th className="px-5 py-3 font-semibold">Code</th>
            <th className="px-5 py-3 font-semibold">Price</th>
            <th className="px-5 py-3 font-semibold">Interval</th>
            <th className="px-5 py-3 font-semibold">Active</th>
            <th className="px-5 py-3" />
          </tr>
        </thead>
        <tbody>
          {data.map((p) => (
            <tr key={p.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/30">
              <td className="px-5 py-4">
                <p className="font-medium">{p.name}</p>
                {p.description && <p className="text-xs text-muted-foreground mt-0.5 max-w-md truncate">{p.description}</p>}
              </td>
              <td className="px-5 py-4">
                <Badge variant="outline" className="capitalize text-[10px]">{AUDIENCE_LABEL[p.audience] ?? p.audience}</Badge>
              </td>
              <td className="px-5 py-4 font-mono text-xs text-muted-foreground">{p.code}</td>
              <td className="px-5 py-4 font-semibold">{p.price_cents === 0 ? "Free" : `${p.currency} ${(p.price_cents / 100).toFixed(2)}`}</td>
              <td className="px-5 py-4"><Badge variant="outline" className="capitalize text-[10px]">{p.billing_interval}</Badge></td>
              <td className="px-5 py-4"><Switch checked={p.is_active} onCheckedChange={() => toggleActive(p)} /></td>
              <td className="px-5 py-4 text-right">
                <div className="inline-flex gap-1">
                  <PlanDialog mode="edit" plan={p} />
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(p)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlanDialog({ mode, plan }: { mode: "create" | "edit"; plan?: Plan }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: plan?.code ?? "",
    name: plan?.name ?? "",
    price_cents: plan?.price_cents ?? 0,
    currency: plan?.currency ?? "USD",
    billing_interval: plan?.billing_interval ?? "monthly",
    description: plan?.description ?? "",
    is_active: plan?.is_active ?? true,
    sort_order: plan?.sort_order ?? 0,
    audience: plan?.audience ?? "employer",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) return toast.error("Code and name are required.");
    setSaving(true);
    try {
      if (mode === "create") {
        const { error } = await supabase.from("subscription_plans").insert(form);
        if (error) throw error;
        await logAudit({ action: "plan.create", resource_type: "plan", resource_id: form.code });
        toast.success("Plan created.");
      } else if (plan) {
        const { error } = await supabase.from("subscription_plans").update(form).eq("id", plan.id);
        if (error) throw error;
        await logAudit({ action: "plan.update", resource_type: "plan", resource_id: plan.id });
        toast.success("Plan updated.");
      }
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create"
          ? <Button className="rounded-full bg-primary hover:bg-primary/90"><Plus className="h-4 w-4 mr-1" /> New plan</Button>
          : <Button variant="ghost" size="icon" className="h-8 w-8"><Pencil className="h-4 w-4" /></Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{mode === "create" ? "New subscription plan" : "Edit plan"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="basic_monthly" /></div>
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Basic" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Price (cents)</Label><Input type="number" value={form.price_cents} onChange={(e) => setForm({ ...form, price_cents: Number(e.target.value) })} /></div>
            <div><Label>Currency</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></div>
            <div>
              <Label>Interval</Label>
              <Select value={form.billing_interval} onValueChange={(v) => setForm({ ...form, billing_interval: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                  <SelectItem value="none">One-time / None</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Description</Label><Textarea rows={3} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="flex items-center gap-3">
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            <Label className="!mt-0">Visible to users</Label>
            <div className="ml-auto"><Label className="text-xs">Sort</Label><Input type="number" className="w-20" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : mode === "create" ? "Create" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
