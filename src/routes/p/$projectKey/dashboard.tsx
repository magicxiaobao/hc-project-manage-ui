import { createFileRoute } from "@tanstack/react-router";
import { DashboardView } from "@/components/pm/dashboard-view";

export const Route = createFileRoute("/p/$projectKey/dashboard")({
  component: Page,
});

function Page() {
  const { projectKey } = Route.useParams();
  return <DashboardView projectKey={projectKey} />;
}
