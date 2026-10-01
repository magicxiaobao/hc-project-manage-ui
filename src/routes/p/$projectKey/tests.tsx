import { createFileRoute } from "@tanstack/react-router";
import { TestsView } from "@/components/pm/tests-view";

export const Route = createFileRoute("/p/$projectKey/tests")({
  component: Page,
});

function Page() {
  const { projectKey } = Route.useParams();
  return <TestsView projectKey={projectKey} />;
}
