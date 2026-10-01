import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@heroui/react";
import { toast } from "sonner";
import { OptionSelect, PageHeading } from "@/components/biz";
import { usePm } from "@/lib/pm/store";

export const Route = createFileRoute("/me")({
  component: Page,
});

function Page() {
  const people = usePm((state) => state.people);
  const currentUserId = usePm((state) => state.currentUserId);
  const me = people.find((person) => person.id === currentUserId);
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4 md:p-6">
      <PageHeading title="个人资料" hint="示例里切换当前用户，负责人和工时登记会跟着变。" />
      <div className="rounded-sm border border-border bg-surface p-4">
        <div className="type-section">{me?.name ?? "未登录"}</div>
        <p className="type-meta mt-1">{me?.role ?? ""}</p>
        <div className="mt-4">
          <OptionSelect
            label="当前用户"
            value={currentUserId}
            options={people.map((person) => ({ id: person.id, label: `${person.name} · ${person.role}` }))}
            onChange={(id) => usePm.getState().setCurrentUser(id)}
          />
        </div>
      </div>
      <Button
        variant="outline"
        onPress={() => {
          usePm.getState().reset();
          toast("已恢复示例数据");
        }}
      >
        恢复示例数据
      </Button>
    </div>
  );
}
