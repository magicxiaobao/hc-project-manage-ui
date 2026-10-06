/**
 * /sys/users/$userId 父路由：只渲染 <Outlet/>，子路由（index=编辑占位、
 * roles=分配角色）真正渲染内容。r4 P1-3 修复：此前缺 <Outlet/> 导致
 * roles 子路由不可达。
 */
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/sys/users/$userId")({
  component: Page,
});

function Page() {
  return <Outlet />;
}
