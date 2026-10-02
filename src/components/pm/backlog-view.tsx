import { notifyPmChange } from "@/lib/pm/feedback";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyHint, PageHeading, SprintActions, SprintBucket, SprintIssueRow, SprintRangeField, sprintBadge, sprintDates, sprintTone } from "@/components/biz";
import { usePm } from "@/lib/pm/store";
import { useGoToItem } from "@/components/pm/use-go-item";

export function BacklogView({ projectKey }: { projectKey: string }) {
  const project = usePm((state) => state.projects.find((entry) => entry.key === projectKey));
  const allSprints = usePm((state) => state.sprints);
  const allItems = usePm((state) => state.items);
  const sprints = useMemo(() => allSprints.filter((entry) => entry.projectId === project?.id), [allSprints, project?.id]);
  const items = useMemo(() => allItems.filter((entry) => entry.projectId === project?.id), [allItems, project?.id]);
  const people = usePm((state) => state.people);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const goToItem = useGoToItem();

  if (!project) return <EmptyHint>没有找到这个项目。</EmptyHint>;

  const ordered = [
    ...sprints.filter((sprint) => sprint.state === "active"),
    ...sprints.filter((sprint) => sprint.state === "planned"),
    ...sprints.filter((sprint) => sprint.state === "closed"),
  ];
  const unscheduled = items.filter((item) => !item.sprintId);

  const dropTo = (sprintId: string | null) => (event: React.DragEvent) => {
    event.preventDefault();
    setOver(null);
    const id = event.dataTransfer.getData("text/plain");
    if (!id) return;
    usePm.getState().updateItem(id, { sprintId });
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <PageHeading title="待办" hint="把事项拖进迭代，或从下拉里改排期。完成进行中的迭代时，未完成事项会退回未排期。" />
      {ordered.map((sprint) => (
        <SprintBucket
          key={sprint.id}
          title={sprint.name}
          badge={sprintBadge(sprint.state)}
          badgeTone={sprintTone(sprint.state)}
          goal={sprint.goal}
          schedule={
            sprint.state === "closed" ? (
              <p className="type-caption">{sprintDates(sprint)}</p>
            ) : (
              <SprintRangeField
                start={sprint.start}
                end={sprint.end}
                marks={sprints
                  .filter((entry) => entry.id !== sprint.id)
                  .flatMap((entry) => [
                    { date: entry.start, tone: "progress" as const },
                    { date: entry.end, tone: "review" as const },
                  ])}
                onChange={(start, end) => usePm.getState().updateSprint(sprint.id, { start, end })}
              />
            )
          }
          count={items.filter((item) => item.sprintId === sprint.id).length}
          over={over === sprint.id}
          onDragOver={(event) => {
            event.preventDefault();
            setOver(sprint.id);
          }}
          onDrop={dropTo(sprint.id)}
          actions={
            <SprintActions
              state={sprint.state}
              confirming={confirmId === sprint.id}
              onStart={() => {
                const result = usePm.getState().startSprint(sprint.id);
                if (!result.ok) toast(result.message);
              }}
              onAskComplete={() => setConfirmId(sprint.id)}
              onCancel={() => setConfirmId(null)}
              onComplete={() => {
                usePm.getState().completeSprint(sprint.id);
                setConfirmId(null);
                notifyPmChange(`${sprint.name} 已完成，未完成事项回到未排期`);
              }}
            />
          }
        >
          {items
            .filter((item) => item.sprintId === sprint.id)
            .map((item) => (
              <SprintIssueRow
                key={item.id}
                item={item}
                assignee={people.find((person) => person.id === item.assigneeId)}
                sprints={sprints}
                onOpen={goToItem}
                onSprint={(sprintId) => usePm.getState().updateItem(item.id, { sprintId })}
              />
            ))}
        </SprintBucket>
      ))}
      <SprintBucket
        title="未排期"
        goal="还没放进任何迭代"
        count={unscheduled.length}
        over={over === "none"}
        onDragOver={(event) => {
          event.preventDefault();
          setOver("none");
        }}
        onDrop={dropTo(null)}
      >
        {unscheduled.map((item) => (
          <SprintIssueRow
            key={item.id}
            item={item}
            assignee={people.find((person) => person.id === item.assigneeId)}
            sprints={sprints}
            onOpen={goToItem}
            onSprint={(sprintId) => usePm.getState().updateItem(item.id, { sprintId })}
          />
        ))}
      </SprintBucket>
    </div>
  );
}
