import { createFileRoute } from "@tanstack/react-router";
import { WorklogView } from "@/components/pm/worklog-view";

export const Route = createFileRoute("/p/$projectKey/worklogs")({
  component: Page,
});

function Page() {
  const { projectKey } = Route.useParams();
  return <WorklogView projectKey={projectKey} />;
}
