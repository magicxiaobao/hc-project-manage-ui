import { createFileRoute } from "@tanstack/react-router";
import { GanttView } from "@/components/pm/gantt-view";

export const Route = createFileRoute("/p/$projectKey/gantt")({
  component: Page,
});

function Page() {
  const { projectKey } = Route.useParams();
  return <GanttView projectKey={projectKey} />;
}
