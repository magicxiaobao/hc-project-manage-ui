import { createFileRoute } from "@tanstack/react-router";
import { SettingsView } from "@/components/pm/settings-view";

export const Route = createFileRoute("/p/$projectKey/settings")({
  component: Page,
});

function Page() {
  const { projectKey } = Route.useParams();
  return <SettingsView projectKey={projectKey} />;
}
