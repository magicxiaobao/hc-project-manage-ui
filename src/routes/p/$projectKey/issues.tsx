/**
 * issues 布局路由（P1：p1-task-detail 重构）。
 *
 * 始终渲染子路由 Outlet：未登录时的分支下沉到各子路由自行处理——
 * issues/index 渲染演示列表（ListView），issues/$taskId 与 issues/new 渲染登录提示。
 *
 * Codex review 4175631821：此前父路由在未登录时直接返回 ListView，导致深链接
 * /p/<key>/issues/123、/p/<key>/issues/new 的子路由登录守卫永远不可达，
 * 未登录用户看到的是无关的演示列表而非登录提示。
 */
import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/p/$projectKey/issues")({
  component: Page,
});

function Page() {
  return <Outlet />;
}
