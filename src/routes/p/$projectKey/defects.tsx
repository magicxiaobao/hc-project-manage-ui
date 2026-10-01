import { createFileRoute } from "@tanstack/react-router";
import { BoardView } from "@/components/pm/board-view";

export const Route = createFileRoute("/p/$projectKey/defects")({
  component: Page,
});

function Page() {
  const { projectKey } = Route.useParams();
  return <BoardView projectKey={projectKey} lockedKind="defect" />;
}
