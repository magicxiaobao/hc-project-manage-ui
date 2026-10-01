import { createFileRoute } from "@tanstack/react-router";
import { TraceView } from "@/components/pm/trace-view";

export const Route = createFileRoute("/p/$projectKey/trace")({
  component: Page,
});

function Page() {
  const { projectKey } = Route.useParams();
  return <TraceView projectKey={projectKey} />;
}
