/**
 * 分配角色路由（P5 p5-user-roles）：/sys/users/$userId/roles。
 *
 * 页面即打开 UserRolesDialog（路由型弹窗）：弹窗内 GET /user/v1/roles/{userId}
 * 回显已选，候选走 GET /role/v1/list?keyword=（只含已启用角色），保存走
 * POST /user/v1/assignRoles { userId, roleIds }。关闭弹窗返回用户列表。
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { EmptyHint } from "@/components/biz";
import { UserRolesDialog } from "@/components/pm/user-roles-dialog";
import { hasSystemAdmin, useAuthStore } from "@/lib/api/auth-store";

export const Route = createFileRoute("/sys/users/$userId/roles")({
  component: Page,
});

function Page() {
  const { userId } = Route.useParams();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  // 与 /sys/users 列表页共用同一判定函数：直接访问该路由时同样守卫。
  const authorities = useAuthStore((state) => state.user?.authorities);

  const userIdNum = Number(userId);

  const handleClose = () => {
    void navigate({ to: "/sys/users" });
  };

  if (!isAuthenticated || !hasSystemAdmin(authorities)) {
    return (
      <div className="p-4 md:p-6">
        <EmptyHint>
          该操作需要系统管理员权限。当前账号可访问此页面，但后端管理接口尚不支持细粒度权限。
        </EmptyHint>
      </div>
    );
  }

  // 与编辑路由（$userId/index.tsx）同口径：只接受规范十进制正整数，
  // 拒绝 0x10 / 1e3 / 超安全整数等非规范形式，防止误载入他人角色做全量替换
  if (!/^[1-9]\d*$/.test(userId) || !Number.isSafeInteger(userIdNum)) {
    return (
      <div className="p-4 md:p-6">
        <EmptyHint>用户 id 不合法，无法分配角色。</EmptyHint>
        <div className="mt-2 text-center">
          <Link to="/sys/users" className="type-link hover:underline">
            返回用户列表
          </Link>
        </div>
      </div>
    );
  }

  return <UserRolesDialog open userId={userIdNum} onClose={handleClose} />;
}
