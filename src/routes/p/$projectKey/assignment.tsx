import { createFileRoute } from "@tanstack/react-router";
import { AssignmentView } from "@/components/pm/assignment-view";

export const Route = createFileRoute("/p/$projectKey/assignment")({
  component: Page,
});

function Page() {
  const { projectKey } = Route.useParams();
  return <AssignmentView projectKey={projectKey} />;
}
