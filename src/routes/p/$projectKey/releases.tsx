/**
 * releases 布局路由（P2：p2-release-lifecycle）。
 *
 * 始终渲染子路由 Outlet：未登录时的分支下沉到各子路由自行处理——
 * releases/index 登录态渲染发布列表，未登录渲染演示发布管理；
 * releases/$releaseId 登录态渲染发布详情，未登录渲染登录提示。
 * （沿用 versions / release-environments 布局路由结构）
 */
import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/p/$projectKey/releases")({
  component: Page,
});

function Page() {
  return <Outlet />;
}
