import { createFileRoute } from "@tanstack/react-router";
import { ReleasesView } from "@/components/pm/releases-view";

export const Route = createFileRoute("/p/$projectKey/releases")({
  component: Page,
});

function Page() {
  const { projectKey } = Route.useParams();
  return <ReleasesView projectKey={projectKey} />;
}
