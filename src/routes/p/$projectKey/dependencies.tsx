import { createFileRoute } from "@tanstack/react-router";
import { DependenciesView } from "@/components/pm/dependencies-view";

export const Route = createFileRoute("/p/$projectKey/dependencies")({
  component: Page,
});

function Page() {
  const { projectKey } = Route.useParams();
  return <DependenciesView projectKey={projectKey} />;
}
