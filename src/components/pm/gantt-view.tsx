import { useMemo, useState, type PointerEvent } from "react";
import { EmptyHint, IssueTypeIcon, PageHeading } from "@/components/biz";
import { useGoToItem } from "@/components/pm/use-go-item";
import type { WorkItem } from "@/lib/pm/domain";
import { cn } from "@/lib/utils";
import { usePm } from "@/lib/pm/store";

const ROW = 64;

function dayNumber(iso: string) {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function isoFromDay(day: number) {
  const date = new Date(day * 86_400_000);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dateNumber = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${dateNumber}`;
}

function todayNumber() {
  const now = new Date();
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000;
}

function tickLabel(day: number) {
  const date = new Date(day * 86_400_000);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

function barTone(item: WorkItem) {
  if (item.kind === "defect") return "bg-defect";
  if (item.kind === "task") return "bg-task";
  if (item.requirementType === "Epic") return "bg-epic";
  return "bg-story";
}

type Row = { item: WorkItem; start: string; end: string };

export function GanttView({ projectKey }: { projectKey: string }) {
  const project = usePm((state) => state.projects.find((entry) => entry.key === projectKey));
  const allItems = usePm((state) => state.items);
  const sprints = usePm((state) => state.sprints);
  const dependencies = usePm((state) => state.dependencies);
  const items = useMemo(() => allItems.filter((entry) => entry.projectId === project?.id), [allItems, project?.id]);
  const goToItem = useGoToItem();
  const [draft, setDraft] = useState<{ id: string; start: string; end: string } | null>(null);
  if (!project) return <EmptyHint>没有找到这个项目。</EmptyHint>;

  const rows = items
    .map((item) => {
      const sprint = sprints.find((entry) => entry.id === item.sprintId);
      const planned = draft?.id === item.id ? draft : null;
      const start = planned?.start ?? item.planStart ?? sprint?.start;
      const end = planned?.end ?? item.planEnd ?? sprint?.end;
      if (!start || !end) return null;
      return { item, start, end };
    })
    .filter((row): row is Row => row !== null)
    .sort((a, b) => a.start.localeCompare(b.start) || a.item.key.localeCompare(b.item.key));
  const unscheduled = items.filter((item) => !rows.some((row) => row.item.id === item.id) && item.kind !== "defect");

  const origin = rows.length ? Math.min(...rows.map((row) => dayNumber(row.start))) : 0;
  const finish = rows.length ? Math.max(...rows.map((row) => dayNumber(row.end))) : origin + 1;
  const span = Math.max(finish - origin, 1);
  const step = span <= 16 ? 2 : span <= 45 ? 7 : 14;
  const ticks: number[] = [];
  for (let day = origin; day <= finish; day += step) ticks.push(day);
  if (ticks[ticks.length - 1] !== finish) {
    if (finish - ticks[ticks.length - 1] < step * 0.65) ticks[ticks.length - 1] = finish;
    else ticks.push(finish);
  }
  const today = todayNumber();
  const showToday = today >= origin && today <= finish;
  const indexOf = new Map(rows.map((row, index) => [row.item.id, index]));
  const lines = dependencies
    .filter((entry) => entry.status === "ACTIVE" && indexOf.has(entry.predecessorId) && indexOf.has(entry.successorId))
    .map((entry) => {
      const from = rows[indexOf.get(entry.predecessorId) ?? 0];
      const to = rows[indexOf.get(entry.successorId) ?? 0];
      const fromLeft = ((dayNumber(from.start) - origin) / span) * 100;
      const fromWidth = Math.max(((dayNumber(from.end) - dayNumber(from.start) + 1) / span) * 100, 2);
      const toLeft = ((dayNumber(to.start) - origin) / span) * 100;
      const y1 = (indexOf.get(entry.predecessorId) ?? 0) * ROW + ROW / 2;
      const y2 = (indexOf.get(entry.successorId) ?? 0) * ROW + ROW / 2;
      return { id: entry.id, x1: fromLeft + fromWidth, y1, x2: toLeft, y2, muted: entry.dependencyType !== "FS" };
    });

  const drag = (row: Row, edge: "move" | "end", event: PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const host = event.currentTarget.parentElement;
    if (!host) return;
    const width = host.getBoundingClientRect().width;
    const originX = event.clientX;
    const start0 = dayNumber(row.start);
    const end0 = dayNumber(row.end);
    const move = (ev: globalThis.PointerEvent) => {
      const delta = Math.round(((ev.clientX - originX) / Math.max(width, 1)) * span);
      const start = edge === "move" ? start0 + delta : start0;
      const end = Math.max(end0 + delta, start);
      setDraft({ id: row.item.id, start: isoFromDay(start), end: isoFromDay(end) });
    };
    const up = (ev: globalThis.PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const delta = Math.round(((ev.clientX - originX) / Math.max(width, 1)) * span);
      const start = edge === "move" ? start0 + delta : start0;
      const end = Math.max(end0 + delta, start);
      setDraft(null);
      if (delta !== 0) usePm.getState().updateItem(row.item.id, { planStart: isoFromDay(start), planEnd: isoFromDay(end) });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-6">
      <PageHeading title="甘特图" hint="拖动条形改计划起止，拖右缘只改结束。连线是有效依赖，完成-开始用实线。" />
      <div className="flex flex-wrap gap-3">
        <Legend swatch="bg-epic" label="史诗" />
        <Legend swatch="bg-story" label="故事" />
        <Legend swatch="bg-task" label="任务" />
        <Legend swatch="bg-defect" label="缺陷" />
      </div>
      <div className="overflow-hidden rounded-sm border border-border bg-surface">
        {rows.length === 0 ? <EmptyHint>还没有可画到时间线上的事项。</EmptyHint> : null}
        {rows.length > 0 ? (
          <div className="grid grid-cols-[148px_minmax(0,1fr)] border-b border-border sm:grid-cols-[240px_minmax(0,1fr)]">
            <span className="type-label px-3 py-2">事项</span>
            <span className="relative mr-3 h-8">
              {ticks.map((day, index) => {
                const ratio = (day - origin) / span;
                const edge = index === 0 || index === ticks.length - 1;
                return (
                  <span
                    key={day}
                    className={cn("type-caption absolute top-2 whitespace-nowrap", !edge && "hidden sm:inline")}
                    style={ratio <= 0.04 ? { left: 0 } : ratio >= 0.96 ? { right: 0 } : { left: `${ratio * 100}%`, transform: "translateX(-50%)" }}
                  >
                    {tickLabel(day)}
                  </span>
                );
              })}
            </span>
          </div>
        ) : null}
        <div className="relative">
          {rows.map(({ item, start, end }) => {
            const left = ((dayNumber(start) - origin) / span) * 100;
            const width = Math.max(((dayNumber(end) - dayNumber(start) + 1) / span) * 100, 2);
            const progress = Math.min(Math.max(item.progress, 0), 100);
            return (
              <div key={item.id} className="grid h-16 grid-cols-[148px_minmax(0,1fr)] border-b border-border last:border-b-0 sm:grid-cols-[240px_minmax(0,1fr)]">
                <button type="button" className="flex min-w-0 items-center gap-2 px-3 text-left hover:bg-line" onClick={() => goToItem(item.id)}>
                  <IssueTypeIcon item={item} />
                  <span className="min-w-0">
                    <span className="type-link block">{item.key}</span>
                    <span className="type-caption block truncate">{item.title}</span>
                  </span>
                </button>
                <span className="relative mr-3">
                  {showToday ? <span className="absolute inset-y-0 w-px bg-danger" style={{ left: `${((today - origin) / span) * 100}%` }} /> : null}
                  <span
                    className="absolute top-1/2 h-6 -translate-y-1/2 cursor-grab"
                    style={{ left: `${left}%`, width: `${width}%` }}
                    onPointerDown={(event) => drag({ item, start, end }, "move", event)}
                  >
                    <span className={cn("absolute inset-0 rounded-sm opacity-30", barTone(item))} />
                    {progress > 0 ? <span className={cn("absolute inset-y-0 left-0 rounded-sm", barTone(item))} style={{ width: `${progress}%` }} /> : null}
                    <span className="absolute inset-y-0 right-0 w-2 cursor-ew-resize" onPointerDown={(event) => drag({ item, start, end }, "end", event)} />
                  </span>
                </span>
              </div>
            );
          })}
          {lines.length > 0 ? (
            <svg className="pointer-events-none absolute top-0 right-3 bottom-0 left-[148px] sm:left-[240px]" viewBox={`0 0 100 ${rows.length * ROW}`} preserveAspectRatio="none">
              {lines.map((line) => (
                <path
                  key={line.id}
                  d={`M ${line.x1} ${line.y1} H ${(line.x1 + line.x2) / 2} V ${line.y2} H ${line.x2}`}
                  fill="none"
                  stroke={line.muted ? "#8993a4" : "#0052cc"}
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
          ) : null}
        </div>
      </div>
      {unscheduled.length > 0 ? <p className="type-caption">未排期：{unscheduled.map((item) => item.key).join("、")}</p> : null}
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="type-caption flex items-center gap-1.5">
      <span className={cn("size-2.5 rounded-sm", swatch)} />
      {label}
    </span>
  );
}
