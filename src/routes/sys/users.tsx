import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/pm/shell";

export const Route = createFileRoute("/sys/users")({
  component: UsersLayout,
});

function UsersLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
