import { useMemo, useState, type PointerEvent } from "react";
import { Button } from "@heroui/react";
import { toast } from "sonner";
import { PlanDateFields } from "@/components/biz/date-fields";
import { EmptyHint, IssueTypeIcon, PageHeading } from "@/components/biz";
import { useGoToItem } from "@/components/pm/use-go-item";
import type { WorkItem } from "@/lib/pm/domain";
import { formatDay, scheduleConflicts } from "@/lib/pm/domain";
import { alignPlans, dependencyAnchor, type PlanRange } from "@/lib/pm/schedule";
import { cn } from "@/lib/utils";
import { usePm } from "@/lib/pm/store";

// SVG coordinates scale with the full row container at either responsive height.
const SVG_ROW = 64;

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

type Row = { item: WorkItem; start: string; end: string; depth: number; header: boolean };

export function GanttView({ projectKey }: { projectKey: string }) {
  return <ProjectGanttView key={projectKey} projectKey={projectKey} />;
}

function ProjectGanttView({ projectKey }: { projectKey: string }) {
  const project = usePm((state) => state.projects.find((entry) => entry.key === projectKey));
  const allItems = usePm((state) => state.items);
  const sprints = usePm((state) => state.sprints);
  const dependencies = usePm((state) => state.dependencies);
  const versions = usePm((state) => state.versions);
  const items = useMemo(() => allItems.filter((entry) => entry.projectId === project?.id), [allItems, project?.id]);
  const goToItem = useGoToItem();
  const [draft, setDraft] = useState<Record<string, PlanRange> | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  if (!project) return <EmptyHint>没有找到这个项目。</EmptyHint>;

  const scheduled = items.flatMap((item) => {
    const sprint = sprints.find((entry) => entry.id === item.sprintId);
    const planned = draft?.[item.id];
    const start = planned?.start ?? item.planStart ?? sprint?.start;
    const end = planned?.end ?? item.planEnd ?? sprint?.end;
    if (!start || !end) return [];
    return [{ item, start, end }];
  });
  const rows = groupGantt(scheduled, items);
  const unscheduled = items.filter((item) => !scheduled.some((row) => row.item.id === item.id) && item.kind !== "defect");
  const dated = rows.filter((row) => !row.header);
  const origin = dated.length ? Math.min(...dated.flatMap((row) => rangeDays(row))) : 0;
  const finish = dated.length ? Math.max(...dated.flatMap((row) => rangeDays(row))) : origin + 1;
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
      const anchor = dependencyAnchor(entry.dependencyType);
      const y1 = (indexOf.get(entry.predecessorId) ?? 0) * SVG_ROW + SVG_ROW / 2;
      const y2 = (indexOf.get(entry.successorId) ?? 0) * SVG_ROW + SVG_ROW / 2;
      return { id: entry.id, x1: edgeX(from, anchor.from, origin, span), y1, x2: edgeX(to, anchor.to, origin, span), y2, type: entry.dependencyType };
    });
  const conflicts = scheduleConflicts(
    dependencies.filter((entry) => entry.projectId === project.id),
    items,
    sprints,
  );

  // Both drag/resize and date entry use the same existing alignment and store action.
  const commitPlan = (row: Row, proposed: PlanRange, base = Object.fromEntries(rows.map((entry) => [entry.item.id, { start: entry.start, end: entry.end }]))) => {
    const aligned = alignPlans(base, dependencies, row.item.id, proposed);
    const updates = rows.flatMap((entry) => {
      const plan = aligned[entry.item.id];
      if (!plan || (plan.start === entry.start && plan.end === entry.end)) return [];
      return [{ id: entry.item.id, planStart: plan.start, planEnd: plan.end }];
    });
    if (updates.length === 0) return false;
    usePm.getState().setItemPlans(updates);
    const shifted = updates.filter((update) => update.id !== row.item.id);
    if (shifted.length > 0) {
      const names = shifted.map((update) => rows.find((entry) => entry.item.id === update.id)?.item.key).filter(Boolean);
      toast(`已按依赖顺延 ${names.join("、")}`);
    }
    return true;
  };
  const editing = rows.find((row) => row.item.id === editingId && !row.header);
  const closeEditor = () => {
    // Restore before removing the form; no delayed focus can steal a newer navigation.
    document.querySelector<HTMLElement>(`[data-focus-key="plan-${editingId}"]`)?.focus();
    setEditingId(null);
  };

  const drag = (row: Row, edge: "move" | "end", event: PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const host = event.currentTarget.parentElement;
    if (!host) return;
    const width = host.getBoundingClientRect().width;
    const originX = event.clientX;
    const start0 = dayNumber(row.start);
    const end0 = dayNumber(row.end);
    const base = Object.fromEntries(rows.map((entry) => [entry.item.id, { start: entry.start, end: entry.end }]));
    const move = (ev: globalThis.PointerEvent) => {
      const delta = Math.round(((ev.clientX - originX) / Math.max(width, 1)) * span);
      const start = edge === "move" ? start0 + delta : start0;
      const end = Math.max(end0 + delta, start);
      setDraft(alignPlans(base, dependencies, row.item.id, { start: isoFromDay(start), end: isoFromDay(end) }));
    };
    const up = (ev: globalThis.PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const delta = Math.round(((ev.clientX - originX) / Math.max(width, 1)) * span);
      setDraft(null);
      if (delta === 0) return;
      const start = edge === "move" ? start0 + delta : start0;
      const end = Math.max(end0 + delta, start);
      if (!commitPlan(row, { start: isoFromDay(start), end: isoFromDay(end) }, base)) {
        toast("这次拖动违反依赖，计划没有改。");
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeading title="甘特图" hint="点计划日期或用键盘编辑；也可拖动条形改计划、拖右缘改结束。任务圆点拖到另一条上加完成-开始依赖。细条是基线。" />
        <Button
          variant="outline"
          onPress={() => {
            const result = usePm.getState().saveBaseline(project.id);
            if (!result.ok) toast.error(result.message);
            else toast(`已记下 ${result.count} 条基线`);
          }}
        >
          记下基线
        </Button>
      </div>
      <div className="flex flex-wrap gap-3">
        <Legend swatch="bg-epic" label="史诗" />
        <Legend swatch="bg-story" label="故事" />
        <Legend swatch="bg-task" label="任务" />
        <Legend swatch="bg-defect" label="缺陷" />
        <span className="type-caption">细条 基线</span>
        <span className="type-caption">实线 完成-开始</span>
        <span className="type-caption">虚线 开始-开始 / 完成-完成 / 开始-完成</span>
      </div>
      {editing ? (
        <section className="rounded-sm border border-border bg-surface p-3" aria-label={`${editing.item.key} 计划日期编辑`}>
          <h2 className="type-section mb-2">{editing.item.key} · 编辑计划日期</h2>
          <p className="type-caption mb-3">保存时按已有有效依赖顺延后置事项。开始和结束可以是同一天。</p>
          <PlanDateFields key={editing.item.id} start={editing.start} end={editing.end} onCancel={closeEditor} onSave={(start, end) => {
            const changed = start !== editing.start.slice(0, 10) || end !== editing.end.slice(0, 10);
            if (!commitPlan(editing, { start, end }) && changed) toast("这次日期调整违反依赖，计划没有改。");
            closeEditor();
          }} />
        </section>
      ) : null}
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
          {rows.map(({ item, start, end, depth, header }) => {
            const left = ((dayNumber(start) - origin) / span) * 100;
            const width = Math.max(((dayNumber(end) - dayNumber(start) + 1) / span) * 100, 2);
            const progress = Math.min(Math.max(item.progress, 0), 100);
            return (
              <div key={item.id} className="grid h-24 grid-cols-[148px_minmax(0,1fr)] border-b border-border last:border-b-0 sm:h-16 sm:grid-cols-[240px_minmax(0,1fr)]">
                <div className="flex min-w-0 flex-col justify-center">
                <button type="button" className="flex h-11 min-w-0 shrink-0 items-center gap-2 pr-3 text-left hover:bg-line sm:h-auto" style={{ paddingLeft: 12 + depth * 16 }} onClick={() => goToItem(item.id)}>
                  <IssueTypeIcon item={item} />
                  <span className="min-w-0">
                    <span className={header ? "type-emphasis block" : "type-link block"}>{item.key}</span>
                    <span className="type-caption block truncate">{item.title}</span>
                  </span>
                </button>
                {header ? null : <button type="button" data-focus-key={`plan-${item.id}`} aria-label={`编辑 ${item.key} 计划日期，${start} 至 ${end}，进度 ${progress}%`} className="type-caption h-11 min-h-6 shrink-0 truncate rounded-sm px-3 text-left text-primary hover:bg-line focus-visible:outline-2 focus-visible:outline-primary sm:h-6" onClick={() => setEditingId(item.id)}>{start.slice(5)} — {end.slice(5)} · {progress}%</button>}
                </div>
                <span className="relative mr-3" data-gantt-id={item.id}>
                  {showToday ? <span className="absolute inset-y-0 w-px bg-danger" style={{ left: `${((today - origin) / span) * 100}%` }} /> : null}
                  {versions
                    .filter((version) => version.projectId === project.id)
                    .map((version) => {
                      const day = dayNumber(version.plannedReleaseDate);
                      if (day < origin || day > finish) return null;
                      return <span key={version.id} className="absolute inset-y-0 w-px bg-warning" style={{ left: `${((day - origin) / span) * 100}%` }} title={version.versionNumber} />;
                    })}
                  {header ? null : item.baselineStart && item.baselineEnd ? (
                    <span
                      className="absolute top-2 h-1 rounded-sm bg-fg/50"
                      style={{
                        left: `${((dayNumber(item.baselineStart) - origin) / span) * 100}%`,
                        width: `${Math.max(((dayNumber(item.baselineEnd) - dayNumber(item.baselineStart) + 1) / span) * 100, 1.5)}%`,
                      }}
                    />
                  ) : null}
                  {header ? null : (
                  <span
                    className="absolute top-1/2 h-6 -translate-y-1/2 cursor-grab"
                    style={{ left: `${left}%`, width: `${width}%` }}
                    onPointerDown={(event) => drag({ item, start, end, depth, header }, "move", event)}
                  >
                    {item.kind === "task" ? (
                      <span
                        className="absolute top-1/2 left-0 z-10 size-2.5 -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-full bg-primary"
                        onPointerDown={(event) => linkFrom(project.id, item.id, event)}
                      />
                    ) : null}
                    <span className={cn("absolute inset-0 rounded-sm opacity-30", barTone(item))} />
                    {progress > 0 ? <span className={cn("absolute inset-y-0 left-0 rounded-sm", barTone(item))} style={{ width: `${progress}%` }} /> : null}
                    <span className="absolute inset-y-0 right-0 w-2 cursor-ew-resize" onPointerDown={(event) => drag({ item, start, end, depth, header }, "end", event)} />
                  </span>
                  )}
                </span>
              </div>
            );
          })}
          {lines.length > 0 ? (
            <svg className="pointer-events-none absolute top-0 right-3 bottom-0 left-[148px] h-full w-[calc(100%_-_160px)] sm:left-[240px] sm:w-[calc(100%_-_252px)]" viewBox={`0 0 100 ${rows.length * SVG_ROW}`} preserveAspectRatio="none">
              {lines.map((line) => (
                <path
                  key={line.id}
                  d={`M ${line.x1} ${line.y1} H ${(line.x1 + line.x2) / 2} V ${line.y2} H ${line.x2}`}
                  fill="none"
                  stroke={line.type === "FS" ? "#0052cc" : "#44546f"}
                  strokeWidth="1.5"
                  strokeDasharray={line.type === "SS" ? "4 3" : line.type === "FF" ? "1.5 2" : line.type === "SF" ? "5 2 1 2" : undefined}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
          ) : null}
        </div>
      </div>
      {unscheduled.length > 0 ? <p className="type-caption">未排期：{unscheduled.map((item) => item.key).join("、")}</p> : null}
      {conflicts.length > 0 ? (
        <div className="flex flex-col gap-1">
          {conflicts.map((conflict) => (
            <p key={conflict.dependency.id} className="type-caption text-danger">
              {conflict.predecessor.key} 的{conflict.from === "end" ? "结束" : "开始"}
              {conflict.dependency.lagDays > 0 ? `再延后 ${conflict.dependency.lagDays} 天` : ""}要到 {formatDay(conflict.ready)}，晚于 {conflict.successor.key} 的{conflict.to === "end" ? "结束" : "开始"} {formatDay(conflict.actual)}。
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function groupGantt(scheduled: { item: WorkItem; start: string; end: string }[], items: WorkItem[]): Row[] {
  const rowOf = new Map(scheduled.map((row) => [row.item.id, row]));
  const kids = new Map<string, string[]>();
  const loose: string[] = [];
  for (const row of scheduled) {
    const parent = items.find((item) => item.id === row.item.parentId && item.kind === "requirement");
    if (!parent) loose.push(row.item.id);
    else kids.set(parent.id, [...(kids.get(parent.id) ?? []), row.item.id]);
  }
  const rows: Row[] = [];
  const emitted = new Set<string>();
  const emit = (id: string, depth: number) => {
    if (emitted.has(id)) return;
    emitted.add(id);
    const own = rowOf.get(id);
    const children = [...(kids.get(id) ?? [])].sort((a, b) => (rowOf.get(a)?.start ?? "").localeCompare(rowOf.get(b)?.start ?? "") || a.localeCompare(b));
    if (own) rows.push({ ...own, depth, header: false });
    else if (children.length > 0) {
      const parent = items.find((item) => item.id === id);
      const first = rowOf.get(children[0]);
      if (parent && first) rows.push({ item: parent, start: first.start, end: first.end, depth, header: true });
    }
    for (const child of children) emit(child, depth + 1);
  };
  const roots = [...kids.keys()].filter((id) => {
    const parentId = items.find((item) => item.id === id)?.parentId;
    return !parentId || !kids.has(parentId);
  });
  for (const id of roots) emit(id, 0);
  for (const id of loose.sort((a, b) => (rowOf.get(a)?.start ?? "").localeCompare(rowOf.get(b)?.start ?? ""))) emit(id, 0);
  return rows;
}

function linkFrom(projectId: string, fromId: string, event: PointerEvent<HTMLElement>) {
  event.preventDefault();
  event.stopPropagation();
  const up = (ev: globalThis.PointerEvent) => {
    window.removeEventListener("pointerup", up);
    const hit = document.elementFromPoint(ev.clientX, ev.clientY);
    const target = hit instanceof Element ? hit.closest("[data-gantt-id]")?.getAttribute("data-gantt-id") : null;
    if (!target || target === fromId) return;
    const result = usePm.getState().addDependency({
      projectId,
      predecessorId: fromId,
      successorId: target,
      dependencyType: "FS",
      lagDays: 0,
      memo: "",
    });
    if (!result.ok) toast(result.message);
    else toast("已添加完成-开始依赖");
  };
  window.addEventListener("pointerup", up);
}

function rangeDays(row: Row) {
  const days = [dayNumber(row.start), dayNumber(row.end)];
  if (row.item.baselineStart) days.push(dayNumber(row.item.baselineStart));
  if (row.item.baselineEnd) days.push(dayNumber(row.item.baselineEnd));
  return days;
}

function edgeX(row: Row, edge: "start" | "end", origin: number, span: number) {
  const day = edge === "start" ? dayNumber(row.start) : dayNumber(row.end) + 1;
  return ((day - origin) / span) * 100;
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="type-caption flex items-center gap-1.5">
      <span className={cn("size-2.5 rounded-sm", swatch)} />
      {label}
    </span>
  );
}
