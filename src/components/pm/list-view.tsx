import { useMemo, useState } from "react";
import { Avatar, PriorityMark, StatusPill, TypeIcon } from "@/components/pm/bits";
import { columnOf } from "@/lib/pm/domain";
import { usePm } from "@/lib/pm/store";
import { useGoToItem } from "@/components/pm/use-go-item";
import { cn } from "@/lib/utils";

export function ListView({ projectKey }: { projectKey: string }) {
  const project = usePm((state) => state.projects.find((entry) => entry.key === projectKey));
  const items = usePm((state) => state.items);
  const people = usePm((state) => state.people);
  const sprints = usePm((state) => state.sprints);
  const currentUserId = usePm((state) => state.currentUserId);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [mine, setMine] = useState(false);
  const [hideDone, setHideDone] = useState(true);
  const goToItem = useGoToItem();

  const rows = useMemo(() => {
    const text = query.trim().toLowerCase();
    return items
      .filter((item) => item.projectId === project?.id)
      .filter((item) => (kind === "all" ? true : item.kind === kind))
      .filter((item) => (mine ? item.assigneeId === currentUserId : true))
      .filter((item) => {
        if (!hideDone) return true;
        const column = columnOf(item.kind, item.status);
        return column !== "done" && column !== "cancelled";
      })
      .filter((item) => (text ? `${item.key} ${item.title}`.toLowerCase().includes(text) : true))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }, [items, project, kind, mine, currentUserId, hideDone, query]);

  if (!project) return <div className="p-8 text-sm text-muted">没有找到这个项目。</div>;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">事项</h1>
          <p className="text-sm text-muted">需求、任务和缺陷在同一张清单里。点一行进入事项页。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索" className={chip} />
          <select value={kind} onChange={(event) => setKind(event.target.value)} className={chip}>
            <option value="all">全部类型</option>
            <option value="requirement">需求</option>
            <option value="task">任务</option>
            <option value="defect">缺陷</option>
          </select>
          <button type="button" className={cn(chip, mine && "border-primary bg-primary-soft text-primary-ink")} onClick={() => setMine((value) => !value)}>
            只看我的
          </button>
          <button type="button" className={cn(chip, !hideDone && "border-primary bg-primary-soft text-primary-ink")} onClick={() => setHideDone((value) => !value)}>
            {hideDone ? "隐藏完成" : "含已完成"}
          </button>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <ul>
          {rows.length === 0 ? <li className="px-4 py-10 text-center text-sm text-faint">没有符合筛选的事项</li> : null}
          {rows.map((item) => {
            const sprint = sprints.find((entry) => entry.id === item.sprintId);
            const assignee = people.find((person) => person.id === item.assigneeId);
            return (
              <li key={item.id} className="border-b border-line last:border-b-0">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-line"
                  onClick={() => goToItem(item.id)}
                >
                  <span className="w-16 shrink-0 text-sm font-medium text-primary-ink">{item.key}</span>
                  <span className="hidden md:block">
                    <TypeIcon item={item} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
                  <span className="hidden md:block">
                    <StatusPill kind={item.kind} status={item.status} />
                  </span>
                  <span className="hidden w-24 truncate text-xs text-muted md:block">{sprint?.name ?? "未排期"}</span>
                  <span className="hidden w-24 items-center gap-1 truncate text-xs text-muted md:flex">
                    <Avatar person={assignee} className="size-6" />
                    {assignee?.name ?? "未分配"}
                  </span>
                  <PriorityMark priority={item.priority} />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

const chip = "h-9 rounded-md border border-border bg-surface px-2 text-sm";
