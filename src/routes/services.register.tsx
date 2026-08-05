import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/services/register")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/skill-workers" });
  },
});
