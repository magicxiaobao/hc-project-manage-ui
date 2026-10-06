/**
 * 用户列表 index 路由（P5 p5-user-list）：/sys/users。
 */
import { createFileRoute } from "@tanstack/react-router";
import { UserListLive } from "@/components/pm/user-list-live";

export const Route = createFileRoute("/sys/users/")({
  component: Page,
});

function Page() {
  return <UserListLive />;
}
