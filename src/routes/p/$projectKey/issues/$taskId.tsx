/**
 * 任务详情路由（P1：p1-task-detail）：/p/$projectKey/issues/$taskId。
 *
 * 结构修复说明：登录态的 issues 路由已改为布局路由（渲染 Outlet），
 * 详情作为子路由挂载，避免了 p1-requirement-detail 那种「父路由无 Outlet，
 * 子路由实际不可达」的问题。
 */
import { createFileRoute } from "@tanstack/react-router";
import { EmptyHint } from "@/components/biz";
import { TaskDetailLive } from "@/components/pm/task-detail-live";
import { useAuthStore } from "@/lib/api/auth-store";

export const Route = createFileRoute("/p/$projectKey/issues/$taskId")({
  component: Page,
});

function Page() {
  const { projectKey, taskId } = Route.useParams();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // 未登录：演示侧的任务详情走 /p/$projectKey/items/$itemKey，这里直接提示登录。
  if (!isAuthenticated) {
    return <EmptyHint>{"登录后查看任务详情。"}</EmptyHint>;
  }

  const id = /^\d+$/.test(taskId) ? Number(taskId) : NaN;
  if (!Number.isInteger(id) || id <= 0) {
    return <EmptyHint>{`任务 ID 不合法（${taskId}）。`}</EmptyHint>;
  }

  return <TaskDetailLive taskId={id} projectKey={projectKey} />;
}
