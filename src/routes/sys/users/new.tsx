/**
 * 新建用户占位路由（P5 p5-user-form 实施后替换为真实表单）。
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { EmptyHint } from "@/components/biz";

export const Route = createFileRoute("/sys/users/new")({
  component: Page,
});

function Page() {
  return (
    <div className="p-4 md:p-6">
      <EmptyHint>
        用户创建表单将在 p5-user-form 切片中实现。返回用户列表。
      </EmptyHint>
      <div className="mt-2 text-center">
        <Link to="/sys/users" className="type-link hover:underline">
          返回用户列表
        </Link>
      </div>
    </div>
  );
}
