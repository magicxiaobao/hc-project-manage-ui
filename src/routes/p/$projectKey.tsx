import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/pm/shell";
import { parseProjectViewSearch } from "@/lib/pm/navigation";

export const Route = createFileRoute("/p/$projectKey")({
  validateSearch: parseProjectViewSearch,
  component: ProjectLayout,
});

function ProjectLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
