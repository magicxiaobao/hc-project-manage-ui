import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { EmptyHint } from "@/components/biz";
import { UserFormDialog } from "@/components/pm/user-form-dialog";

export const Route = createFileRoute("/sys/users/$userId/")({
  component: Page,
});

function Page() {
  const { userId } = Route.useParams();
  const navigate = useNavigate();
  const userIdNum = Number(userId);
  if (!/^[1-9]\d*$/.test(userId) || !Number.isSafeInteger(userIdNum)) {
    return (
      <div className="p-4 md:p-6">
        <EmptyHint>用户 id 不合法，无法编辑用户。</EmptyHint>
        <div className="mt-2 text-center">
          <Link to="/sys/users" className="type-link hover:underline">
            返回用户列表
          </Link>
        </div>
      </div>
    );
  }
  return (
    <UserFormDialog open userId={userIdNum} onClose={() => { void navigate({ to: "/sys/users" }); }} />
  );
}
