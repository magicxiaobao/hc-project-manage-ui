import { Link } from "@tanstack/react-router";
import { Button, Spinner } from "@heroui/react";
import {
  toUserMessage,
  useTaskPredecessors,
  useTaskSuccessors,
  useProjectAllTasks,
} from "@/lib/query";
import {
  dependencyTaskLabel,
  dependencyTypeLabel,
  dependencyLagLabel,
  isPositiveSafeId,
} from "@/lib/task-dependencies-live";

export function TaskDependencySidebar({
  taskId,
  projectId,
  projectKey,
}: {
  taskId: number;
  projectId: number;
  projectKey: string;
}) {
  const verified = isPositiveSafeId(projectId) && isPositiveSafeId(taskId);
  const predecessors = useTaskPredecessors(taskId, verified);
  const successors = useTaskSuccessors(taskId, verified);
  const tasks = useProjectAllTasks({ projectId: verified ? projectId : null });
  const names = (tasks.data ?? []).filter((task) => task.projectId === projectId);
  return (
    <aside aria-label="任务依赖" className="min-w-0 rounded border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="type-emphasis">任务依赖</h2>
        <Link
          to="/p/$projectKey/dependencies"
          params={{ projectKey }}
          className="text-sm text-accent hover:underline"
        >
          管理依赖
        </Link>
      </div>
      {tasks.isError ? (
        <p role="alert" className="text-sm text-danger">
          名称加载失败，保留编号。
          <Button size="sm" variant="ghost" onPress={() => void tasks.refetch()}>
            重试名称
          </Button>
        </p>
      ) : null}
      {(
        [
          { title: "前置任务", endpoint: "predecessorId", query: predecessors },
          { title: "后置任务", endpoint: "successorId", query: successors },
        ] as const
      ).map(({ title, endpoint, query }) => (
        <section key={endpoint} className="mb-4" aria-label={title}>
          <h3 className="mb-2 font-medium">{title}</h3>
          {query.isPending ? (
            <p>
              <Spinner size="sm" /> 加载中…
            </p>
          ) : null}
          {query.isError ? (
            <div role="alert" className="text-sm text-danger">
              {title}加载失败：{toUserMessage(query.error)}
              {query.data ? "（上次数据可能已过期）" : ""}
              <Button size="sm" variant="ghost" onPress={() => void query.refetch()}>
                重试{title}
              </Button>
            </div>
          ) : null}
          {query.data ? (
            !query.data.length ? (
              <p className="type-caption">无{title}</p>
            ) : (
              <ul className="space-y-2">
                {query.data.map((row) => (
                  <li key={row.id}>
                    <Link
                      to="/p/$projectKey/issues/$taskId"
                      params={{ projectKey, taskId: String(row[endpoint]) }}
                      className="text-sm text-accent hover:underline"
                    >
                      {dependencyTaskLabel(row[endpoint], names)}
                    </Link>
                    <p className="type-caption">
                      {dependencyTypeLabel(row.dependencyType)} · 延迟 {dependencyLagLabel(row.lag)}{" "}
                      天
                    </p>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </section>
      ))}
    </aside>
  );
}
