import { createFileRoute } from "@tanstack/react-router";
import { SprintsView } from "@/components/pm/sprints-view";

export const Route = createFileRoute("/p/$projectKey/sprints")({
  component: Page,
});

function Page() {
  const { projectKey } = Route.useParams();
  return <SprintsView projectKey={projectKey} />;
}
