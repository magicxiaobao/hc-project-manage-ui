/**
 * boards 布局路由（P3：p3-board-manage/p3-board-kanban）。
 *
 * 始终渲染子路由 Outlet：列表逻辑下沉到 boards/index，任务看板在
 * boards/$boardId（未登录分支由各子路由自行处理）。
 *
 * Codex/pi r7 F1：此前父路由直接返回 BoardView/BoardListLive 而无 <Outlet/>，
 * 子路由 boards/$boardId 匹配后永不渲染（与 issues/requirements 同类已修复
 * 回归同形）。现拆为布局 + index，与 issues.tsx 同模式。
 */
import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/p/$projectKey/boards")({
  component: Page,
});

function Page() {
  return <Outlet />;
}
