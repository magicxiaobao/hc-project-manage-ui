import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/pm/shell";
import { ProfilePage } from "@/components/pm/profile-page";

export const Route = createFileRoute("/sys/profile")({
  component: Page,
});

function Page() {
  return (
    <AppShell>
      <ProfilePage />
    </AppShell>
  );
}
