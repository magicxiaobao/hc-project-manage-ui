/**
 * versions 布局路由（P2：p2-version-slices）。
 *
 * 始终渲染子路由 Outlet：未登录时的分支下沉到各子路由自行处理——
 * versions/index 渲染演示版本管理/登录态列表，versions/$versionId 渲染登录提示。
 *
 * defects 路由的同类结构（Codex review 4175631821）：父路由在未登录时
 * 直接返回演示视图会导致深链接的子路由守卫不可达。
 */
import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/p/$projectKey/versions")({
  component: Page,
});

function Page() {
  return <Outlet />;
}
