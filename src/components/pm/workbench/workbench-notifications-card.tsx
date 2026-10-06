import { Link } from "@tanstack/react-router";
import type { WorkbenchQueryState } from "./workbench-card-feedback";
import { WorkbenchCardFeedback } from "./workbench-card-feedback";
export function WorkbenchNotificationsCard({
  query,
}: {
  query: WorkbenchQueryState & { data?: number };
}) {
  return (
    <section
      aria-labelledby="workbench-notifications"
      className="min-w-0 rounded border border-border bg-surface p-4"
    >
      <h2 id="workbench-notifications" className="type-section">
        未读通知
      </h2>
      <WorkbenchCardFeedback query={query} label="未读通知" />
      <p className="my-3 text-2xl">{query.data ?? "—"}</p>
      {query.data === 0 ? (
        <p>暂无未读通知</p>
      ) : query.data === undefined ? (
        <p>未读数量暂不可用</p>
      ) : (
        <p>条未读通知</p>
      )}
      <Link to="/notifications" className="text-accent underline">
        查看通知
      </Link>
    </section>
  );
}
