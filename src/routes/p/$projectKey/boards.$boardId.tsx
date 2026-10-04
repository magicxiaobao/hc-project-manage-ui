/**
 * 任务看板路由（P3：p3-board-kanban）。
 *
 * /p/$projectKey/boards/$boardId，对标老前端 views/board/TaskBoard.vue。
 * 数据层 TaskBoardLive：GET boardColumn/v1/board/{boardId}/columnsWithTasks
 * 取列+卡片；列 CRUD/拖拽排序；卡片跨列拖拽走 task/v1/updateStatus 状态机。
 */
import { createFileRoute } from "@tanstack/react-router";
import { EmptyHint } from "@/components/biz";
import { TaskBoardLive } from "@/components/pm/task-board-live";
import { useAuthStore } from "@/lib/api/auth-store";
import { parseRequiredPositiveInt } from "@/lib/task-create";

export const Route = createFileRoute("/p/$projectKey/boards/$boardId")({
  component: Page,
});

function Page() {
  const { projectKey, boardId } = Route.useParams();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // 未登录：演示侧没有任务看板页，直接提示登录。
  if (!isAuthenticated) {
    return <EmptyHint>{"登录后查看任务看板。"}</EmptyHint>;
  }

  // 十进制严格解析 + 回绕校验：拒绝超安全整数的静默舍入
  const id = parseRequiredPositiveInt(boardId);
  if (id === null) {
    return <EmptyHint>{`看板 ID 不合法（${boardId}）。`}</EmptyHint>;
  }

  // key 按 boardId 重新挂载：参数导航（看板 A → 看板 B）时路由复用组件，
  // 列/卡片/弹窗等 board-scoped 状态会残留——强制重挂载一次性全量重置。
  return <TaskBoardLive key={id} boardId={id} projectKey={projectKey} />;
}
