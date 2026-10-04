/**
 * sprints 布局路由（P3：p3-sprint-list/p3-sprint-detail）。
 *
 * 始终渲染子路由 Outlet：列表逻辑下沉到 sprints/index，冲刺详情在
 * sprints/$sprintId（未登录分支由各子路由自行处理）。
 *
 * Codex/pi r14 F1：此前父路由直接返回 SprintListLive/SprintsView 而无
 * <Outlet/>，子路由 sprints/$sprintId 匹配后永不渲染（与 boards r7 F1
 * 同类已修复回归同形）。现拆为布局 + index，与 boards.tsx 同模式。
 */
import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/p/$projectKey/sprints")({
  component: Page,
});

function Page() {
  return <Outlet />;
}
