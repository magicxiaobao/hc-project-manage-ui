/**
 * testcases 布局路由（P2：p2-testcase-list-detail）。
 *
 * 始终渲染子路由 Outlet：未登录时的分支下沉到各子路由自行处理——
 * testcases/index 未登录渲染演示测试视图，testcases/$testCaseId 未登录渲染登录提示。
 *
 * defects 路由的同类结构（Codex review 4175631821）：此前父路由在未登录
 * 时直接返回演示视图，会导致深链接 /p/<key>/testcases/123 的子路由守卫不可达。
 */
import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/p/$projectKey/testcases")({
  component: Page,
});

function Page() {
  return <Outlet />;
}
