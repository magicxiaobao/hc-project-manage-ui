import { AppShell } from "@/components/pm/shell";
import { notifyPmChange } from "@/lib/pm/feedback";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@heroui/react";
import { OptionSelect, PageHeading } from "@/components/biz";
import { usePm } from "@/lib/pm/store";
import { useAuthStore } from "@/lib/api/auth-store";

export const Route = createFileRoute("/me")({
  component: Page,
});

function Page() {
  return (
    <AppShell>
      <Body />
    </AppShell>
  );
}

function Body() {
  const people = usePm((state) => state.people);
  const currentUserId = usePm((state) => state.currentUserId);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const authUser = useAuthStore((state) => state.user);
  const me = people.find((person) => person.id === currentUserId);
  // 后端模式下演示数据只读且身份与演示人员无关：展示真实登录用户，而非示例人员
  const displayName = isAuthenticated ? (authUser?.cnName || authUser?.userName || "已登录") : (me?.name ?? "未登录");
  const displayRole = isAuthenticated ? (authUser?.roles.join("、") ?? "") : (me?.role ?? "");
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4 md:p-6">
      <Link to="/" className="type-link w-fit hover:underline">
        返回工作台
      </Link>
      <PageHeading title="个人资料" hint="示例里切换当前用户，负责人和工时登记会跟着变。" />
      <div className="rounded-sm border border-border bg-surface p-4">
        <div className="type-section">{displayName}</div>
        <p className="type-meta mt-1">{displayRole}</p>
        {/* 后端模式下演示数据只读：隐藏演示身份切换 */}
        {!isAuthenticated ? (
          <div className="mt-4">
            <OptionSelect
              label="当前用户"
              value={currentUserId}
              options={people.map((person) => ({
                id: person.id,
                label: `${person.name} · ${person.role}`,
              }))}
              onChange={(id) => usePm.getState().setCurrentUser(id)}
            />
          </div>
        ) : null}
      </div>
      {/* 后端模式下演示数据只读：隐藏“恢复示例数据” */}
      {!isAuthenticated ? (
        <Button
          variant="outline"
          onPress={() => {
            usePm.getState().reset();
            notifyPmChange("已恢复示例数据");
          }}
        >
          恢复示例数据
        </Button>
      ) : null}
    </div>
  );
}
