import { createFileRoute } from "@tanstack/react-router";
import { BoardView } from "@/components/pm/board-view";

export const Route = createFileRoute("/p/$projectKey/")({
  component: ProjectBoard,
});

function ProjectBoard() {
  const { projectKey } = Route.useParams();
  return <BoardView projectKey={projectKey} />;
}
