/**
 * 编辑用户占位路由（P5 p5-user-form 实施后替换为真实表单）。
 * r4 P1-3：从 $userId.tsx 父路由拆出，保证父路由的 <Outlet/> 能渲染子路由。
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { EmptyHint } from "@/components/biz";

export const Route = createFileRoute("/sys/users/$userId/")({
  component: Page,
});

function Page() {
  const { userId } = Route.useParams();
  return (
    <div className="p-4 md:p-6">
      <EmptyHint>
        {`用户 ${userId} 的编辑表单将在 p5-user-form 切片中实现。返回用户列表。`}
      </EmptyHint>
      <div className="mt-2 text-center">
        <Link to="/sys/users" className="type-link hover:underline">
          返回用户列表
        </Link>
      </div>
    </div>
  );
}
