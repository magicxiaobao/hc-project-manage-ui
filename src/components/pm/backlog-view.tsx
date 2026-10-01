import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Avatar, StatusPill, TypeIcon } from "@/components/pm/bits";
import { formatDay, type Sprint } from "@/lib/pm/domain";
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

  if (!project) return <div className="p-8 text-sm text-muted">没有找到这个项目。</div>;

  const ordered = [
    ...sprints.filter((sprint) => sprint.state === "active"),
    ...sprints.filter((sprint) => sprint.state === "planned"),
    ...sprints.filter((sprint) => sprint.state === "closed"),
  ];

  const dropTo = (sprintId: string | null) => (event: React.DragEvent) => {
    event.preventDefault();
    setOver(null);
    const id = event.dataTransfer.getData("text/plain");
    if (!id) return;
    usePm.getState().updateItem(id, { sprintId });
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-lg font-semibold">待办</h1>
        <p className="text-sm text-muted">把事项拖进迭代，或从下拉里改排期。完成进行中的迭代时，未完成事项会退回未排期。</p>
      </div>
      {ordered.map((sprint) => (
        <SprintGroup
          key={sprint.id}
          sprint={sprint}
          over={over === sprint.id}
          confirm={confirmId === sprint.id}
          onConfirm={() => setConfirmId(sprint.id)}
          onCancelConfirm={() => setConfirmId(null)}
          onDragOver={(event) => {
            event.preventDefault();
            setOver(sprint.id);
          }}
          onDrop={dropTo(sprint.id)}
          onStart={() => {
            const result = usePm.getState().startSprint(sprint.id);
            if (!result.ok) toast(result.message);
          }}
          onComplete={() => {
            usePm.getState().completeSprint(sprint.id);
            setConfirmId(null);
            toast(`${sprint.name} 已完成，未完成事项回到未排期`);
          }}
        >
          {items
            .filter((item) => item.sprintId === sprint.id)
            .map((item) => (
              <Row key={item.id} itemId={item.id} peopleName={people.find((person) => person.id === item.assigneeId)} />
            ))}
        </SprintGroup>
      ))}
      <section
        className={`rounded-lg border bg-surface ${over === "none" ? "border-primary" : "border-border"}`}
        onDragOver={(event) => {
          event.preventDefault();
          setOver("none");
        }}
        onDrop={dropTo(null)}
      >
        <header className="flex items-center justify-between px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">未排期</h2>
            <p className="text-xs text-faint">还没放进任何迭代</p>
          </div>
          <span className="text-xs text-muted">{items.filter((item) => !item.sprintId).length}</span>
        </header>
        <ul className="border-t border-border">
          {items
            .filter((item) => !item.sprintId)
            .map((item) => (
              <Row key={item.id} itemId={item.id} peopleName={people.find((person) => person.id === item.assigneeId)} />
            ))}
        </ul>
      </section>
    </div>
  );
}

function SprintGroup({
  sprint,
  children,
  over,
  confirm,
  onConfirm,
  onCancelConfirm,
  onDragOver,
  onDrop,
  onStart,
  onComplete,
}: {
  sprint: Sprint;
  children: React.ReactNode;
  over: boolean;
  confirm: boolean;
  onConfirm: () => void;
  onCancelConfirm: () => void;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
  onStart: () => void;
  onComplete: () => void;
}) {
  const state = sprint.state === "active" ? "进行中" : sprint.state === "planned" ? "规划中" : "已完成";
  return (
    <section className={`rounded-lg border bg-surface ${over ? "border-primary" : "border-border"}`} onDragOver={onDragOver} onDrop={onDrop}>
      <header className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">{sprint.name}</h2>
            <span className="rounded-sm bg-line px-1.5 py-0.5 text-xs text-muted">{state}</span>
          </div>
          <p className="mt-1 text-xs text-muted">{sprint.goal}</p>
          <p className="text-xs text-faint">
            {formatDay(sprint.start)} – {formatDay(sprint.end)}
          </p>
        </div>
        <div className="flex gap-2">
          {sprint.state === "planned" ? (
            <button type="button" className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-surface" onClick={onStart}>
              开始迭代
            </button>
          ) : null}
          {sprint.state === "active" && !confirm ? (
            <button type="button" className="h-8 rounded-md border border-border px-3 text-xs" onClick={onConfirm}>
              完成迭代
            </button>
          ) : null}
          {confirm ? (
            <>
              <button type="button" className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-surface" onClick={onComplete}>
                确认，未完成退回待办
              </button>
              <button type="button" className="h-8 px-2 text-xs text-muted" onClick={onCancelConfirm}>
                取消
              </button>
            </>
          ) : null}
        </div>
      </header>
      <ul className="border-t border-border">{children}</ul>
    </section>
  );
}

function Row({ itemId, peopleName }: { itemId: string; peopleName?: { id: string; name: string; role: string } }) {
  const item = usePm((state) => state.items.find((entry) => entry.id === itemId));
  const goToItem = useGoToItem();
  const allSprints = usePm((state) => state.sprints);
  const sprints = useMemo(
    () => allSprints.filter((entry) => entry.projectId === item?.projectId),
    [allSprints, item?.projectId],
  );
  if (!item) return null;
  return (
    <li
      draggable
      onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)}
      className="flex items-center gap-2 border-b border-line px-3 py-2 last:border-b-0"
    >
      <TypeIcon item={item} />
      <button type="button" className="w-16 shrink-0 text-left text-xs font-medium text-primary-ink" onClick={() => goToItem(item.id)}>
        {item.key}
      </button>
      <button type="button" className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => goToItem(item.id)}>
        {item.title}
      </button>
      <span className="hidden sm:inline">
        <StatusPill kind={item.kind} status={item.status} />
      </span>
      <select
        aria-label={`${item.key} 的迭代`}
        value={item.sprintId ?? ""}
        onChange={(event) => usePm.getState().updateItem(item.id, { sprintId: event.target.value || null })}
        className="hidden h-8 max-w-40 rounded-md border border-border bg-surface px-1 text-xs md:block"
      >
        <option value="">未排期</option>
        {sprints.map((sprint) => (
          <option key={sprint.id} value={sprint.id}>
            {sprint.name}
          </option>
        ))}
      </select>
      <Avatar person={peopleName} />
    </li>
  );
}
