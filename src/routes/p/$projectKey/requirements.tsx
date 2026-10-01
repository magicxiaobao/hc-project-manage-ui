import { createFileRoute } from "@tanstack/react-router";
import { RequirementsView } from "@/components/pm/requirements-view";

export const Route = createFileRoute("/p/$projectKey/requirements")({
  component: Page,
});

function Page() {
  const { projectKey } = Route.useParams();
  return <RequirementsView projectKey={projectKey} />;
}
