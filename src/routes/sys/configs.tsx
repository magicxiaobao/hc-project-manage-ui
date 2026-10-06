import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/pm/shell";

export const Route = createFileRoute("/sys/configs")({
  component: Page,
});

function Page() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
