import { createFileRoute } from "@tanstack/react-router";
import { BoardView } from "@/components/pm/board-view";
import { IssuePage } from "@/components/pm/issue-page";

export const Route = createFileRoute("/p/$projectKey/items/$itemKey")({
  component: Page,
});

function Page() {
  const { projectKey, itemKey } = Route.useParams();
  return (
    <>
      <BoardView projectKey={projectKey} />
      <IssuePage projectKey={projectKey} itemKey={itemKey} />
    </>
  );
}