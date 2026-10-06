import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { EmptyHint } from "@/components/biz";
import { UserFormDialog } from "@/components/pm/user-form-dialog";
import { hasSystemAdmin, useAuthStore } from "@/lib/api/auth-store";

export const Route = createFileRoute("/sys/users/new")({
  component: Page,
});

function Page() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const authorities = useAuthStore((state) => state.user?.authorities);
  if (!isAuthenticated || !hasSystemAdmin(authorities)) {
    return (
      <div className="p-4 md:p-6">
        <EmptyHint>
          该操作需要系统管理员权限。当前账号可访问此页面，但后端管理接口尚不支持细粒度权限。
        </EmptyHint>
      </div>
    );
  }
  return (
    <UserFormDialog open userId={null} onClose={() => { void navigate({ to: "/sys/users" }); }} />
  );
}
