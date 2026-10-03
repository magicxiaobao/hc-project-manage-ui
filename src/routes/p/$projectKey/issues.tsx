/**
 * issues 布局路由（P1：p1-task-detail 重构）。
 *
 * 登录态：仅渲染子路由 Outlet（issues/index 任务列表 / issues/$taskId 任务详情）。
 * 未登录：保留演示列表（ListView），演示详情走 /p/$projectKey/items/$itemKey。
 */
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { ListView } from "@/components/pm/list-view";
import { useAuthStore } from "@/lib/api/auth-store";

export const Route = createFileRoute("/p/$projectKey/issues")({
  component: Page,
});

function Page() {
  const { projectKey } = Route.useParams();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (!isAuthenticated) return <ListView projectKey={projectKey} />;
  return <Outlet />;
}
