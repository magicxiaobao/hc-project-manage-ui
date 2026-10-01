import { createFileRoute } from "@tanstack/react-router";
import { ListView } from "@/components/pm/list-view";

export const Route = createFileRoute("/p/$projectKey/issues")({
  component: Page,
});

function Page() {
  const { projectKey } = Route.useParams();
  return <ListView projectKey={projectKey} />;
}
