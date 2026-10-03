import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { EmptyHint, PageHeading, SprintActions, SprintBucket, SprintIssueRow, SprintRangeField, sprintBadge, sprintDates, sprintTone } from "@/components/biz";
import { byRank, type WorkItem } from "@/lib/pm/domain";
import { usePm } from "@/lib/pm/store";
import { rememberBrowse, useGoToItem } from "@/components/pm/use-go-item";

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
  const ordered = useMemo(
    () => [
      ...sprints.filter((sprint) => sprint.state === "active"),
      ...sprints.filter((sprint) => sprint.state === "planned"),
      ...sprints.filter((sprint) => sprint.state === "closed"),
    ],
    [sprints],
  );
  const unscheduled = useMemo(() => items.filter((item) => !item.sprintId).sort(byRank), [items]);
  useEffect(() => {
    rememberBrowse([...ordered.flatMap((sprint) => items.filter((item) => item.sprintId === sprint.id).sort(byRank)), ...unscheduled].map((item) => item.id));
  }, [items, ordered, unscheduled]);
  if (!project) return <EmptyHint>没有找到这个项目。</EmptyHint>;

  const dropTo = (sprintId: string | null) => (event: React.DragEvent) => {
    event.preventDefault();
    setOver(null);
    const id = event.dataTransfer.getData("text/plain");
    if (!id) return;
    usePm.getState().updateItem(id, { sprintId });
  };
  const place = (sprintId: string | null, beforeId: string, movingId: string) => {
    usePm.getState().updateItem(movingId, { sprintId });
    const lane = usePm
      .getState()
      .items.filter((item) => item.projectId === project.id && (sprintId ? item.sprintId === sprintId : !item.sprintId))
      .map((item) => item.id);
    usePm.getState().placeItem(movingId, beforeId, lane);
  };

  return (
    <div className="pm-backlog mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <PageHeading title="待办" hint="拖进迭代会改排期。拖到某一行上面会排到它前面。事项按父需求分组，旁边是点数合计。" />
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
          detail={`${pointsOf(items.filter((item) => item.sprintId === sprint.id))} 点`}
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
                const result = usePm.getState().completeSprint(sprint.id);
                setConfirmId(null);
                if (result.ok) toast(`${sprint.name} 已完成，未完成事项回到未排期`);
                else toast(result.message);
              }}
            />
          }
        >
          {laneGroups(items.filter((item) => item.sprintId === sprint.id), items).map((group) => (
            <Group key={group.id} title={group.title} points={pointsOf(group.items)}>
              {group.items.map((item) => (
                <SprintIssueRow
                  key={item.id}
                  item={item}
                  assignee={people.find((person) => person.id === item.assigneeId)}
                  sprints={sprints}
                  onOpen={goToItem}
                  onSprint={(sprintId) => usePm.getState().updateItem(item.id, { sprintId })}
                  onDropBefore={(movingId) => place(sprint.id, item.id, movingId)}
                />
              ))}
            </Group>
          ))}
        </SprintBucket>
      ))}
      <SprintBucket
        title="未排期"
        goal="还没放进任何迭代"
        count={unscheduled.length}
        detail={`${pointsOf(unscheduled)} 点`}
        over={over === "none"}
        onDragOver={(event) => {
          event.preventDefault();
          setOver("none");
        }}
        onDrop={dropTo(null)}
      >
        {laneGroups(unscheduled, items).map((group) => (
          <Group key={group.id} title={group.title} points={pointsOf(group.items)}>
            {group.items.map((item) => (
              <SprintIssueRow
                key={item.id}
                item={item}
                assignee={people.find((person) => person.id === item.assigneeId)}
                sprints={sprints}
                onOpen={goToItem}
                onSprint={(sprintId) => usePm.getState().updateItem(item.id, { sprintId })}
                onDropBefore={(movingId) => place(null, item.id, movingId)}
              />
            ))}
          </Group>
        ))}
      </SprintBucket>
    </div>
  );
}

function pointsOf(rows: WorkItem[]) {
  return rows.reduce((sum, item) => sum + (item.storyPoints ?? 0), 0);
}

function laneGroups(rows: WorkItem[], all: WorkItem[]) {
  const groups = new Map<string, { id: string; title: string; items: WorkItem[] }>();
  const loose: WorkItem[] = [];
  for (const item of [...rows].sort(byRank)) {
    const parent = all.find((entry) => entry.id === item.parentId && entry.kind === "requirement");
    if (!parent) {
      loose.push(item);
      continue;
    }
    const group = groups.get(parent.id) ?? { id: parent.id, title: `${parent.key} ${parent.title}`, items: [] };
    group.items.push(item);
    groups.set(parent.id, group);
  }
  return [...groups.values(), ...(loose.length > 0 ? [{ id: "loose", title: groups.size > 0 ? "未归到需求" : "", items: loose }] : [])];
}

function Group({ title, points, children }: { title: string; points: number; children: ReactNode }) {
  return (
    <li className="list-none">
      {title ? (
        <div className="type-caption bg-line/70 px-3 py-1.5">
          {title} · {points} 点
        </div>
      ) : null}
      <ul>{children}</ul>
    </li>
  );
}
