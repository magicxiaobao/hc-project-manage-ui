import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/pm/shell";
import { parseProjectViewSearch } from "@/lib/pm/navigation";
import { projectLayoutRemountKey } from "@/lib/pm/sidebar-nav";

export const Route = createFileRoute("/p/$projectKey")({
  validateSearch: parseProjectViewSearch,
  remountDeps: ({ params }: { params: { projectKey: string } }) => projectLayoutRemountKey(params),
  component: ProjectLayout,
});

function ProjectLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
