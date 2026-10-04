/**
 * defects 布局路由（P2：p2-defect-detail-flow 重构）。
 *
 * 始终渲染子路由 Outlet：未登录时的分支下沉到各子路由自行处理——
 * defects/index 渲染演示看板/登录态列表，defects/$defectId 渲染登录提示。
 *
 * issues 路由的同类结构修复（Codex review 4175631821）：此前父路由在未登录
 * 时直接返回演示视图，导致深链接 /p/<key>/defects/123 的子路由守卫不可达。
 */
import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/p/$projectKey/defects")({
  component: Page,
});

function Page() {
  return <Outlet />;
}
