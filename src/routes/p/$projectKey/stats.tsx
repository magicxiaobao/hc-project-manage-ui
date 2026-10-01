import { createFileRoute } from "@tanstack/react-router";
import { StatsView } from "@/components/pm/stats-view";

export const Route = createFileRoute("/p/$projectKey/stats")({
  component: Page,
});

function Page() {
  const { projectKey } = Route.useParams();
  return <StatsView projectKey={projectKey} />;
}
