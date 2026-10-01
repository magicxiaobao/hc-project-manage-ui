import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@heroui/react";
import { FeedPreview, MineList, PageHeading, SprintSummary } from "@/components/biz";
import { AppShell } from "@/components/pm/shell";
import { columnOf, greeting } from "@/lib/pm/domain";
import { usePm } from "@/lib/pm/store";
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
  const me = people.find((person) => person.id === currentUserId);
  const goToItem = useGoToItem();
  const mine = items.filter((item) => {
    if (item.assigneeId !== currentUserId) return false;
    const column = columnOf(item.kind, item.status);
    return column !== "done" && column !== "cancelled";
  });
  const active = sprints.find((sprint) => sprint.state === "active" && sprint.projectId === "pr-hc");
  const sprintItems = items.filter((item) => item.sprintId === active?.id);
  const donePoints = sprintItems.filter((item) => columnOf(item.kind, item.status) === "done").reduce((sum, item) => sum + (item.storyPoints ?? 0), 0);
  const allPoints = sprintItems.reduce((sum, item) => sum + (item.storyPoints ?? 0), 0);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <PageHeading title={`${greeting()}，${me?.name.slice(1) ?? ""}`} hint="今天先处理负责人是你的事项。看板只接受状态机允许的拖拽。" />
        <Button variant="primary" onPress={() => usePm.getState().setCreateOpen(true)}>
          创建工作项
        </Button>
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
