import { createFileRoute } from "@tanstack/react-router";
import { BacklogView } from "@/components/pm/backlog-view";

export const Route = createFileRoute("/p/$projectKey/backlog")({
  component: Page,
});

function Page() {
  const { projectKey } = Route.useParams();
  return <BacklogView projectKey={projectKey} />;
}
