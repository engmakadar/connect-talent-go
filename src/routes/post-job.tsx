import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/post-job")({
  component: PostJobRedirect,
});

function PostJobRedirect() {
  const router = useRouter();
  useEffect(() => { router.navigate({ to: "/admin/post-job", replace: true }); }, [router]);
  return null;
}
