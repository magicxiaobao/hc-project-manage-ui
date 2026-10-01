import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/pm/shell";

export const Route = createFileRoute("/p/$projectKey")({
  component: ProjectLayout,
});

function ProjectLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
