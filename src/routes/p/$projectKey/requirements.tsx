/**
 * requirements 布局路由（P1：修复 requirements.$requirementId 子路由不可达）。
 *
 * 始终渲染子路由 Outlet：未登录时的分支下沉到各子路由自行处理——
 * requirements/index 渲染演示需求树（RequirementsView），
 * requirements.$requirementId 渲染登录提示。
 *
 * Codex review 4175631821：此前父路由在未登录时直接返回 RequirementsView，
 * 导致深链接 /p/<key>/requirements/123 的子路由登录守卫永远不可达，
 * 未登录用户看到的是无关的演示需求树而非登录提示。
 */
import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/p/$projectKey/requirements")({
  component: Page,
});

function Page() {
  return <Outlet />;
}
