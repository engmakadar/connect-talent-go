import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Tags, Plus, Trash2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/categories")({
  head: () => ({ meta: [{ title: "Job Categories — SahanJobs Admin" }] }),
  component: () => (
    <AdminShell pageKey="categories" title="Job Categories" subtitle="Categories and employment types surface in filters and on each job posting.">
      <div className="space-y-8">
        <section className="space-y-3">
          <div className="flex items-end justify-between flex-wrap gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold text-ink">Categories</h2>
              <p className="text-sm text-muted-foreground">Industry / function categories for jobs and tenders.</p>
            </div>
            <CategoryDialog mode="create" />
          </div>
          <CategoriesTable />
        </section>
        <section className="space-y-3">
          <div className="flex items-end justify-between flex-wrap gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold text-ink">Employment Types</h2>
              <p className="text-sm text-muted-foreground">Enroll the employment types companies can choose when posting a job.</p>
            </div>
            <EmploymentTypeDialog mode="create" />
          </div>
          <EmploymentTypesTable />
        </section>
      </div>
    </AdminShell>
  ),
});

type Category = { id: string; name: string; slug: string; created_at: string };

function CategoriesTable() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("job_categories").select("*").order("name");
      if (error) throw error;
      return data as Category[];
    },
  });

  const remove = async (id: string) => {
    if (!confirm("Delete this category? Jobs already tagged will keep working.")) return;
    const { error } = await supabase.from("job_categories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Category removed.");
    qc.invalidateQueries({ queryKey: ["admin-categories"] });
  };

  if (isLoading) return <div className="h-40 rounded-2xl bg-white animate-pulse ring-1 ring-black/5" />;
  if (!data?.length) return (
    <div className="rounded-2xl bg-white p-16 text-center ring-1 ring-black/5">
      <Tags className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
      <p className="text-muted-foreground mb-4">No categories yet.</p>
      <CategoryDialog mode="create" />
    </div>
  );

  return (
    <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-secondary/50">
          <tr className="text-left">
            <th className="px-5 py-3 font-semibold">Name</th>
            <th className="px-5 py-3 font-semibold">Slug</th>
            <th className="px-5 py-3 font-semibold">Created</th>
            <th className="px-5 py-3" />
          </tr>
        </thead>
        <tbody>
          {data.map((c) => (
            <tr key={c.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/30">
              <td className="px-5 py-4 font-semibold text-ink">{c.name}</td>
              <td className="px-5 py-4 text-muted-foreground font-mono text-xs">{c.slug}</td>
              <td className="px-5 py-4 text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</td>
              <td className="px-5 py-4 text-right">
                <div className="inline-flex gap-1">
                  <CategoryDialog mode="edit" category={c} />
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(c.id)}>
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

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function CategoryDialog({ mode, category }: { mode: "create" | "edit"; category?: Category }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const [name, setName] = useState(category?.name ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return toast.error("Name required.");
    setSaving(true);
    try {
      const payload = { name: name.trim(), slug: slugify(name) };
      if (mode === "create") {
        const { error } = await supabase.from("job_categories").insert(payload);
        if (error) throw error;
        toast.success("Category added.");
      } else if (category) {
        const { error } = await supabase.from("job_categories").update(payload).eq("id", category.id);
        if (error) throw error;
        toast.success("Category updated.");
      }
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button className="rounded-full bg-primary hover:bg-primary/90"><Plus className="h-4 w-4" /> Add category</Button>
        ) : (
          <Button variant="ghost" size="icon" className="h-8 w-8"><Pencil className="h-4 w-4" /></Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{mode === "create" ? "New category" : "Edit category"}</DialogTitle></DialogHeader>
        <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Logistics" /></div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
