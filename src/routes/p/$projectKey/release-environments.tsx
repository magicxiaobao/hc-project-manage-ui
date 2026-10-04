/**
 * release-environments 布局路由（P2：p2-release-env）。
 *
 * 始终渲染子路由 Outlet：未登录时的分支下沉到各子路由自行处理——
 * release-environments/index 登录态渲染发布环境列表，未登录渲染登录提示。
 * （沿用 versions 布局路由结构；Codex review 4175631821 教训）
 */
import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/p/$projectKey/release-environments")({
  component: Page,
});

function Page() {
  return <Outlet />;
}
