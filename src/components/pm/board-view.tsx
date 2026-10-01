import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Avatar, PriorityMark, TypeIcon } from "@/components/pm/bits";
import { COLUMNS, type ColumnId, columnOf } from "@/lib/pm/domain";
import { usePm } from "@/lib/pm/store";
import { useGoToItem } from "@/components/pm/use-go-item";
import { cn } from "@/lib/utils";

export function BoardView({ projectKey }: { projectKey: string }) {
  const project = usePm((state) => state.projects.find((entry) => entry.key === projectKey));
  const allSprints = usePm((state) => state.sprints);
  const sprints = useMemo(() => allSprints.filter((entry) => entry.projectId === project?.id), [allSprints, project?.id]);
  const items = usePm((state) => state.items);
  const people = usePm((state) => state.people);
  const currentUserId = usePm((state) => state.currentUserId);
  const active = sprints.find((sprint) => sprint.state === "active");
  const [sprintId, setSprintId] = useState(active?.id ?? sprints[0]?.id ?? "");
  const [kind, setKind] = useState<"all" | "requirement" | "task" | "defect">("all");
  const [mine, setMine] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [over, setOver] = useState<ColumnId | null>(null);
  const goToItem = useGoToItem();

  const selectedSprint = sprintId || active?.id || "";
  const visible = useMemo(() => {
    return items.filter((item) => {
      if (!project || item.projectId !== project.id) return false;
      if (selectedSprint && item.sprintId !== selectedSprint) return false;
      if (!selectedSprint && item.sprintId) return false;
      if (kind !== "all" && item.kind !== kind) return false;
      if (mine && item.assigneeId !== currentUserId) return false;
      if (!showCancelled && columnOf(item.kind, item.status) === "cancelled") return false;
      return true;
    });
  }, [items, project, selectedSprint, kind, mine, currentUserId, showCancelled]);

  if (!project) return <Missing />;

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <div className="flex shrink-0 flex-col gap-3 px-5 pt-6 pb-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">看板</h1>
          <p className="mt-1 text-sm text-muted">拖到另一列只会走允许的状态流转。</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={mine} onChange={(event) => setMine(event.target.checked)} className="accent-primary" />
            只看我的
          </label>
          <select value={selectedSprint} onChange={(event) => setSprintId(event.target.value)} className={plainSelect}>
            {sprints.length === 0 ? <option value="">没有迭代</option> : null}
            {sprints.map((sprint) => (
              <option key={sprint.id} value={sprint.id}>
                {sprint.name}
                {sprint.state === "active" ? " · 进行中" : sprint.state === "planned" ? " · 规划中" : " · 已完成"}
              </option>
            ))}
          </select>
          <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} className={plainSelect}>
            <option value="all">全部类型</option>
            <option value="requirement">需求</option>
            <option value="task">任务</option>
            <option value="defect">缺陷</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={showCancelled} onChange={(event) => setShowCancelled(event.target.checked)} className="accent-primary" />
            含已取消
          </label>
          <Avatar person={people.find((person) => person.id === currentUserId)} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-x-auto px-4 pb-4">
        <div className="flex h-full gap-3">
          {COLUMNS.map((column) => {
            const cards = visible.filter((item) => columnOf(item.kind, item.status) === column.id);
            return (
              <section
                key={column.id}
                className={cn("flex h-full w-72 shrink-0 flex-col rounded-[3px] bg-line/70 px-2 pt-2 md:w-auto md:min-w-56 md:flex-1", over === column.id && "ring-2 ring-primary")}
                onDragOver={(event) => {
                  event.preventDefault();
                  setOver(column.id);
                }}
                onDragLeave={() => setOver((current) => (current === column.id ? null : current))}
                onDrop={(event) => {
                  event.preventDefault();
                  setOver(null);
                  const id = event.dataTransfer.getData("text/plain");
                  if (!id) return;
                  const result = usePm.getState().moveToColumn(id, column.id);
                  if (!result.ok) toast(result.message);
                }}
              >
                <header className="flex items-center justify-between px-1 py-1">
                  <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">{column.name}</h2>
                  <span className="text-xs text-faint">{cards.length}</span>
                </header>
                <div className="mt-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-2">
                  {cards.length === 0 ? <div className="px-2 py-6 text-center text-xs text-faint">这一列还没有事项</div> : null}
                  {cards.map((item) => {
                    const assignee = people.find((person) => person.id === item.assigneeId);
                    return (
                      <article
                        key={item.id}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData("text/plain", item.id);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        className="cursor-grab rounded-[3px] bg-surface px-3 py-2.5 shadow-[0_1px_2px_rgba(9,30,66,0.25)] active:cursor-grabbing"
                      >
                        <button type="button" className="w-full text-left" onClick={() => goToItem(item.id)}>
                          <h3 className="text-sm leading-snug text-fg">{item.title}</h3>
                          <div className="mt-3 flex items-center">
                            <TypeIcon item={item} />
                            <span className="ml-2">
                              <PriorityMark priority={item.priority} />
                            </span>
                            <span className="ml-auto">
                              <Avatar person={assignee} className="size-6 text-[10px]" />
                            </span>
                          </div>
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Missing() {
  return <div className="p-8 text-sm text-muted">没有找到这个项目。</div>;
}

const plainSelect = "h-8 rounded-[3px] border border-border bg-surface px-2 text-sm text-fg outline-none hover:bg-line";
