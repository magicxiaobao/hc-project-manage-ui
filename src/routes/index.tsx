import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@heroui/react";
import { FeedPreview, MineList, PageHeading, SprintSummary } from "@/components/biz";
import { AppShell } from "@/components/pm/shell";
import { columnOf, greeting } from "@/lib/pm/domain";
import { usePm } from "@/lib/pm/store";
import { useAuthStore } from "@/lib/api/auth-store";
import { useGoToItem } from "@/components/pm/use-go-item";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <AppShell>
      <HomeBody />
    </AppShell>
  );
}

function HomeBody() {
  const navigate = useNavigate();
  const people = usePm((state) => state.people);
  const projects = usePm((state) => state.projects);
  const items = usePm((state) => state.items);
  const sprints = usePm((state) => state.sprints);
  const feeds = usePm((state) => state.feeds);
  const currentUserId = usePm((state) => state.currentUserId);
  // Phase 0：后端模式下演示 store 只写本地，此处隐藏“创建工作项”入口，
  // 避免用户误以为建了事项并同步到了后端（后端事项接口 Phase 1 接入）。
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const me = people.find((person) => person.id === currentUserId);
  const goToItem = useGoToItem();
  const mine = items.filter((item) => {
    if (item.assigneeId !== currentUserId) return false;
    const column = columnOf(item.kind, item.status);
    return column !== "done" && column !== "cancelled";
  }).sort((a, b) => {
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (Boolean(a.dueDate) !== Boolean(b.dueDate)) return a.dueDate ? -1 : 1;
    const priority = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return priority[a.priority] - priority[b.priority] || a.key.localeCompare(b.key);
  });
  const active = sprints.find((sprint) => sprint.state === "active" && sprint.projectId === "pr-hc");
  const sprintItems = items.filter((item) => item.sprintId === active?.id);
  const donePoints = sprintItems.filter((item) => columnOf(item.kind, item.status) === "done").reduce((sum, item) => sum + (item.storyPoints ?? 0), 0);
  const allPoints = sprintItems.reduce((sum, item) => sum + (item.storyPoints ?? 0), 0);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <PageHeading title={`${greeting()}，${me?.name.slice(1) ?? ""}`} hint="我负责的未完成事项：先按已有截止日期，再按优先级排列。未设置截止日期的事项排在后面。" />
        {!isAuthenticated && (
          <Button variant="primary" onPress={() => usePm.getState().setCreateOpen(true)}>
            创建工作项
          </Button>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <MineList items={mine} projects={projects} people={people} onOpen={goToItem} />
        <div className="flex flex-col gap-4">
          <SprintSummary
            name={active?.name ?? "当前迭代"}
            goal={active?.goal}
            done={donePoints}
            total={allPoints}
            count={sprintItems.length}
            onOpen={() => {
              void navigate({ to: "/p/$projectKey", params: { projectKey: "HC" } });
            }}
          />
          <FeedPreview feeds={feeds.slice(0, 6)} people={people} onOpen={goToItem} />
        </div>
      </div>
    </div>
  );
}
