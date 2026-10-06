import { Link } from "@tanstack/react-router";
import type { WorkbenchResult } from "@/lib/query/hooks/useWorkbench";
import { WORKBENCH_STATUS_LABELS } from "@/lib/workbench-data";
import { WorkbenchCardFeedback } from "./workbench-card-feedback";
export function WorkbenchTasksCard({ workbench: w }: { workbench: WorkbenchResult }) {
  const stale = w.summary.stale || w.scope.isError;
  return (
    <section
      aria-labelledby="workbench-tasks"
      className="min-w-0 rounded border border-border bg-surface p-4"
    >
      <h2 id="workbench-tasks" className="type-section">
        我的待办
      </h2>
      <WorkbenchCardFeedback query={w.scope} label="待办项目范围" />
      {w.scope.data?.length === 0 ? (
        <p>当前无可见项目</p>
      ) : (
        <>
          <p className="my-3 text-2xl">
            {stale && w.summary.total !== null ? "上次完整结果：" : "总待办数："}
            {w.summary.total ?? "—"}
          </p>
          {w.summary.total !== null ? (
            <p>
              已展示 {w.summary.shown} / 共 {w.summary.total} 条
            </p>
          ) : (
            <p>
              结果尚不完整；已获取 {w.summary.covered} / {w.summary.groups} 组，已获取组小计{" "}
              {w.summary.subtotal} 条
            </p>
          )}
          {stale ? <p>旧结果，部分查询刷新失败；不能确认实时全量。</p> : null}
          <p className="type-caption">
            每项目、每状态仅预览第一页 10 条，包含待开始、进行中、已暂停。
          </p>
          <div className="mt-3 grid gap-3">
            {w.groups.map((group) => {
              const label = `${group.project.projectName} · ${WORKBENCH_STATUS_LABELS[group.status]}`;
              return (
                <section
                  key={`${group.project.id}:${group.status}`}
                  aria-label={label}
                  className="border-t border-border pt-3"
                >
                  <h3 className="type-emphasis">{label}</h3>
                  <WorkbenchCardFeedback query={group} label={label} />
                  {group.data !== undefined ? (
                    <>
                      <p>
                        已展示 {group.data.list.length} / 共 {group.data.total} 条
                      </p>
                      {group.data.total === 0 ? <p>该组暂无待办</p> : null}
                      <ul className="my-2 grid gap-2">
                        {group.data.list.map((task) => (
                          <li key={task.id}>
                            <Link
                              className="text-accent underline"
                              to="/p/$projectKey/issues/$taskId"
                              params={{
                                projectKey: group.project.projectKey,
                                taskId: String(task.id),
                              }}
                            >
                              {task.title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p>—</p>
                  )}
                  <Link
                    className="text-accent underline"
                    to="/p/$projectKey/issues"
                    params={{ projectKey: group.project.projectKey }}
                  >
                    查看项目任务
                  </Link>
                  <p className="type-caption">
                    核对条件：执行人 ID {w.userId}，状态 {group.status}
                  </p>
                </section>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
