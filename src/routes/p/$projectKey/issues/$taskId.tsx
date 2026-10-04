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
import { parseRequiredPositiveInt } from "@/lib/task-create";

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

  // 十进制严格解析 + 回绕校验：拒绝超安全整数的静默舍入
  //（"9007199254740993" 会被 Number 舍入为 9007199254740992，渲染前必须阻断）
  const id = parseRequiredPositiveInt(taskId);
  if (id === null) {
    return <EmptyHint>{`任务 ID 不合法（${taskId}）。`}</EmptyHint>;
  }

  // Codex review 4175693765：参数导航（任务 A → 任务 B）时路由复用组件，
  // 草稿/replyTo/流转/改派/评论页码等 item-scoped 状态会残留而 mutation 已
  // 指向 B——key 强制按 taskId 重新挂载，一次性全量重置，不逐个遗漏。
  return <TaskDetailLive key={id} taskId={id} projectKey={projectKey} />;
}
