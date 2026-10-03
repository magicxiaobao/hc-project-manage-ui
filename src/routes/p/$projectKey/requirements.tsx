/**
 * requirements 布局路由（P1：修复 requirements.$requirementId 子路由不可达）。
 *
 * 登录态：仅渲染子路由 Outlet（requirements/index 需求列表 / requirements/$requirementId 需求详情）。
 * 未登录：保留演示需求树（RequirementsView）。
 */
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { RequirementsView } from "@/components/pm/requirements-view";
import { useAuthStore } from "@/lib/api/auth-store";

export const Route = createFileRoute("/p/$projectKey/requirements")({
  component: Page,
});

function Page() {
  const { projectKey } = Route.useParams();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (!isAuthenticated) return <RequirementsView projectKey={projectKey} />;
  return <Outlet />;
}
