import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin-shell";
import { SkillWorkerRegistration } from "@/components/skill-worker-registration";

export const Route = createFileRoute("/admin/skill-workers")({
  head: () => ({
    meta: [
      { title: "Skill worker registration — SahanJobs Admin" },
      { name: "description", content: "Super Admin registration and editing of verified skilled workers: identity, trades, rates and availability." },
      { property: "og:title", content: "Skill worker registration — SahanJobs Admin" },
      { property: "og:description", content: "Register and manage verified hand-skill professionals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminSkillWorkersPage,
});

function AdminSkillWorkersPage() {
  return (
    <AdminShell
      pageKey="skill_workers"
      title="Skill Worker Registration"
      subtitle="Register verified hand-skill professionals and edit their profiles."
    >
      <SkillWorkerRegistration />
    </AdminShell>
  );
}
