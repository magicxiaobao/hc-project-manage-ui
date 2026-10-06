import { createFileRoute } from "@tanstack/react-router";
import { WorklogView } from "@/components/pm/worklog-view";

import { WorkLogListPage } from "@/components/pm/worklog-list-page";
import { useAuthStore } from "@/lib/api/auth-store";

export const Route = createFileRoute("/p/$projectKey/worklogs")({
  component: Page,
});

function Page() {
  const { projectKey } = Route.useParams();
  const authenticated = useAuthStore(s => s.isAuthenticated);
  return authenticated ? <WorkLogListPage projectKey={projectKey} /> : <WorklogView projectKey={projectKey} />;
}
