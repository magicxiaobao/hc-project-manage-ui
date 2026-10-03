import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@heroui/react";
import { toast } from "sonner";
import { PlanDateFields } from "@/components/biz/date-fields";
import { EmptyHint, IssueTypeIcon, PageHeading } from "@/components/biz";
import { useGoToItem } from "@/components/pm/use-go-item";
import type { DependencyType, WorkItem } from "@/lib/pm/domain";
import { formatDay, scheduleConflicts, statusLabel } from "@/lib/pm/domain";
import { alignPlans, criticalTaskIds, dependencyAnchor, type PlanRange } from "@/lib/pm/schedule";
import { cn } from "@/lib/utils";
import { usePm } from "@/lib/pm/store";

const SVG_ROW = 64;
const LINK_LABEL: Record<DependencyType, string> = {
  FS: "完成-开始",
  SS: "开始-开始",
  FF: "完成-完成",
  SF: "开始-完成",
};

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

function tickLabel(day: number, scale: Scale) {
  const date = new Date(day * 86_400_000);
  if (scale === "month") return `${date.getUTCFullYear()}/${date.getUTCMonth() + 1}`;
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

function barTone(item: WorkItem) {
  if (item.kind === "defect") return "bg-defect";
  if (item.kind === "task") return "bg-task";
  if (item.requirementType === "Epic") return "bg-epic";
  return "bg-story";
}

type Scale = "day" | "week" | "month";
type Row = { item: WorkItem; start: string; end: string; depth: number; summary: boolean; parentId: string | null };

export function GanttView({ projectKey }: { projectKey: string }) {
  return <ProjectGanttView key={projectKey} projectKey={projectKey} />;
}

function ProjectGanttView({ projectKey }: { projectKey: string }) {
  const project = usePm((state) => state.projects.find((entry) => entry.key === projectKey));
  const allItems = usePm((state) => state.items);
  const sprints = usePm((state) => state.sprints);
  const dependencies = usePm((state) => state.dependencies);
  const versions = usePm((state) => state.versions);
  const people = usePm((state) => state.people);
  const items = useMemo(() => allItems.filter((entry) => entry.projectId === project?.id), [allItems, project?.id]);
  const goToItem = useGoToItem();
  const scroller = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Record<string, PlanRange> | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [scale, setScale] = useState<Scale>("week");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [columns, setColumns] = useState({ name: 220, person: 72, status: 72 });
  const [rubber, setRubber] = useState<{ fromId: string; x: number; y: number } | null>(null);
  const [pendingLink, setPendingLink] = useState<{ fromId: string; toId: string } | null>(null);
  const [linkType, setLinkType] = useState<DependencyType>("FS");
  const [lagDays, setLagDays] = useState(0);
  if (!project) return <EmptyHint>没有找到这个项目。</EmptyHint>;

  const scheduled = items.flatMap((item) => {
    const sprint = sprints.find((entry) => entry.id === item.sprintId);
    const planned = draft?.[item.id];
    const start = planned?.start ?? item.planStart ?? sprint?.start;
    const end = planned?.end ?? item.planEnd ?? sprint?.end;
    if (!start || !end) return [];
    return [{ item, start, end }];
  });
  const tree = groupGantt(scheduled, items);
  const hidden = new Set<string>();
  const byParent = new Map(tree.map((row) => [row.item.id, row]));
  for (const row of tree) {
    let parent = row.parentId;
    while (parent) {
      if (collapsed.includes(parent)) hidden.add(row.item.id);
      parent = byParent.get(parent)?.parentId ?? null;
    }
  }
  const rows = tree.filter((row) => !hidden.has(row.item.id));
  const unscheduled = items.filter((item) => !tree.some((row) => row.item.id === item.id) && item.kind !== "defect");
  const dated = rows.filter((row) => !row.summary);
  const origin = dated.length ? Math.min(...dated.flatMap((row) => rangeDays(row))) : todayNumber();
  const finish = dated.length ? Math.max(...dated.flatMap((row) => rangeDays(row))) : origin + 14;
  const span = Math.max(finish - origin, 1);
  const ticks = ticksFor(origin, finish, scale);
  const today = todayNumber();
  const showToday = today >= origin && today <= finish;
  const weekends = weekendDays(origin, finish);
  const timelineWidth = chartWidth(span, scale);
  const leftWidth = columns.name + columns.person + columns.status;
  const grid = `${columns.name}px ${columns.person}px ${columns.status}px ${timelineWidth}px`;
  const indexOf = new Map(rows.map((row, index) => [row.item.id, index]));
  const taskPlans = Object.fromEntries(rows.filter((row) => !row.summary && row.item.kind === "task").map((row) => [row.item.id, { start: row.start, end: row.end }]));
  const critical = new Set(criticalTaskIds(taskPlans, dependencies.filter((entry) => entry.projectId === project.id)));
  const lines = dependencies
    .filter((entry) => entry.status === "ACTIVE" && indexOf.has(entry.predecessorId) && indexOf.has(entry.successorId))
    .map((entry) => {
      const from = rows[indexOf.get(entry.predecessorId) ?? 0];
      const to = rows[indexOf.get(entry.successorId) ?? 0];
      const anchor = dependencyAnchor(entry.dependencyType);
      const y1 = (indexOf.get(entry.predecessorId) ?? 0) * SVG_ROW + SVG_ROW / 2;
      const y2 = (indexOf.get(entry.successorId) ?? 0) * SVG_ROW + SVG_ROW / 2;
      return { id: entry.id, x1: edgeX(from, anchor.from, origin, span), y1, x2: edgeX(to, anchor.to, origin, span), y2, type: entry.dependencyType, critical: critical.has(entry.predecessorId) && critical.has(entry.successorId) };
    });
  const conflicts = scheduleConflicts(
    dependencies.filter((entry) => entry.projectId === project.id),
    items,
    sprints,
  );
  const leafRows = () => rows.filter((entry) => !entry.summary);

  const commitPlan = (row: Row, proposed: PlanRange, base = Object.fromEntries(leafRows().map((entry) => [entry.item.id, { start: entry.start, end: entry.end }]))) => {
    const aligned = alignPlans(base, dependencies, row.item.id, proposed);
    const updates = leafRows().flatMap((entry) => {
      const plan = aligned[entry.item.id];
      if (!plan || (plan.start === entry.start && plan.end === entry.end)) return [];
      return [{ id: entry.item.id, planStart: plan.start, planEnd: plan.end }];
    });
    if (updates.length === 0) return false;
    const result = usePm.getState().setItemPlans(updates);
    if (!result.ok) {
      toast(result.message ?? "后端模式下演示数据为只读。");
      return false;
    }
    const shifted = updates.filter((update) => update.id !== row.item.id);
    if (shifted.length > 0) {
      const names = shifted.map((update) => rows.find((entry) => entry.item.id === update.id)?.item.key).filter(Boolean);
      toast(`已按依赖顺延 ${names.join("、")}`);
    }
    return true;
  };
  const editing = rows.find((row) => row.item.id === editingId && !row.summary);
  const closeEditor = () => {
    document.querySelector<HTMLElement>(`[data-focus-key="plan-${editingId}"]`)?.focus();
    setEditingId(null);
  };

  const drag = (row: Row, edge: "move" | "start" | "end", event: ReactPointerEvent<HTMLElement>) => {
    if (row.summary) return;
    event.preventDefault();
    event.stopPropagation();
    const host = chartRef.current;
    if (!host) return;
    const width = timelineWidth;
    const originX = event.clientX;
    const start0 = dayNumber(row.start);
    const end0 = dayNumber(row.end);
    const base = Object.fromEntries(leafRows().map((entry) => [entry.item.id, { start: entry.start, end: entry.end }]));
    const proposed = (delta: number) => {
      let start = start0;
      let end = end0;
      if (edge === "move") {
        start += delta;
        end += delta;
      } else if (edge === "start") start = Math.min(start0 + delta, end0);
      else end = Math.max(end0 + delta, start0);
      return { start: isoFromDay(start), end: isoFromDay(end) };
    };
    const move = (ev: PointerEvent) => {
      const delta = Math.round(((ev.clientX - originX) / Math.max(width, 1)) * span);
      setDraft(alignPlans(base, dependencies, row.item.id, proposed(delta)));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const delta = Math.round(((ev.clientX - originX) / Math.max(width, 1)) * span);
      setDraft(null);
      if (delta === 0) return;
      if (!commitPlan(row, proposed(delta), base)) toast("这次拖动违反依赖，计划没有改。");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const resizeColumn = (key: keyof typeof columns, event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    const originX = event.clientX;
    const start = columns[key];
    const move = (ev: PointerEvent) => setColumns((current) => ({ ...current, [key]: Math.max(56, Math.min(360, start + ev.clientX - originX)) }));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const linkFrom = (fromId: string, event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const point = (ev: PointerEvent) => {
      const host = chartRef.current;
      if (!host) return { x: 0, y: 0 };
      const rect = host.getBoundingClientRect();
      const xPx = ev.clientX - rect.left - leftWidth;
      return {
        x: (xPx / Math.max(timelineWidth, 1)) * 100,
        y: ((ev.clientY - rect.top) / Math.max(rect.height, 1)) * rows.length * SVG_ROW,
      };
    };
    const move = (ev: PointerEvent) => setRubber({ fromId, ...point(ev) });
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setRubber(null);
      const hit = document.elementFromPoint(ev.clientX, ev.clientY);
      const target = hit instanceof Element ? hit.closest("[data-gantt-id]")?.getAttribute("data-gantt-id") : null;
      if (!target || target === fromId) return;
      setPendingLink({ fromId, toId: target });
      setLinkType("FS");
      setLagDays(0);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const scrollToday = () => {
    const el = scroller.current;
    if (!el || !showToday) {
      toast("今天不在当前计划范围内。");
      return;
    }
    const x = leftWidth + ((today - origin) / span) * timelineWidth - el.clientWidth / 2;
    el.scrollTo({ left: Math.max(0, x), behavior: "smooth" });
  };

  const fromRow = rubber ? rows[indexOf.get(rubber.fromId) ?? -1] : undefined;
  const pendingFrom = pendingLink ? items.find((item) => item.id === pendingLink.fromId) : undefined;
  const pendingTo = pendingLink ? items.find((item) => item.id === pendingLink.toId) : undefined;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeading title="甘特图" hint="日、周、月切换刻度。父条是子事项的起止，可以折叠。拖左右缘改工期，拖任务圆点连依赖。" />
        <div className="flex flex-wrap gap-2">
          {(["day", "week", "month"] as Scale[]).map((value) => (
            <Button key={value} variant={scale === value ? "primary" : "outline"} onPress={() => setScale(value)}>
              {value === "day" ? "日" : value === "week" ? "周" : "月"}
            </Button>
          ))}
          <Button variant="outline" onPress={scrollToday}>回到今天</Button>
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
      </div>
      <div className="flex flex-wrap gap-3">
        <Legend swatch="bg-epic" label="史诗" />
        <Legend swatch="bg-story" label="故事" />
        <Legend swatch="bg-task" label="任务" />
        <Legend swatch="bg-defect" label="缺陷" />
        <span className="type-caption">红框 关键路径</span>
        <span className="type-caption">菱形 版本</span>
        <span className="type-caption">细条 基线</span>
        <span className="type-caption">浅蓝底 周末</span>
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
      {pendingFrom && pendingTo && pendingLink ? (
        <form
          className="flex flex-wrap items-end gap-3 rounded-sm border border-border bg-surface p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const result = usePm.getState().addDependency({
              projectId: project.id,
              predecessorId: pendingLink.fromId,
              successorId: pendingLink.toId,
              dependencyType: linkType,
              lagDays,
              memo: "",
            });
            if (!result.ok) toast(result.message);
            else {
              toast(`已添加${LINK_LABEL[linkType]}依赖`);
              setPendingLink(null);
            }
          }}
        >
          <p className="type-body">{pendingFrom.key} → {pendingTo.key}</p>
          <label className="type-caption flex flex-col gap-1">
            类型
            <select className="type-body h-9 rounded-sm border border-border bg-surface px-2" value={linkType} onChange={(event) => setLinkType(event.target.value as DependencyType)}>
              {(Object.keys(LINK_LABEL) as DependencyType[]).map((type) => <option key={type} value={type}>{LINK_LABEL[type]}</option>)}
            </select>
          </label>
          <label className="type-caption flex flex-col gap-1">
            滞后
            <input aria-label="滞后天数" type="number" min={0} max={60} value={lagDays} className="type-body h-9 w-20 rounded-sm border border-border px-2" onChange={(event) => setLagDays(Number(event.target.value))} />
          </label>
          <Button type="submit" variant="primary">添加依赖</Button>
          <Button variant="outline" onPress={() => setPendingLink(null)}>取消</Button>
        </form>
      ) : null}
      <div ref={scroller} className="overflow-x-auto rounded-sm border border-border bg-surface">
        {rows.length === 0 ? <EmptyHint>还没有可画到时间线上的事项。</EmptyHint> : null}
        {rows.length > 0 ? (
          <div style={{ width: leftWidth + timelineWidth }}>
            <div className="grid border-b border-border" style={{ gridTemplateColumns: grid }}>
              <ColumnHead label="事项" onResize={(event) => resizeColumn("name", event)} />
              <ColumnHead label="负责人" onResize={(event) => resizeColumn("person", event)} />
              <ColumnHead label="状态" onResize={(event) => resizeColumn("status", event)} />
              <span className="relative h-8">
                {versions.filter((version) => version.projectId === project.id).map((version) => {
                  const day = dayNumber(version.plannedReleaseDate);
                  if (day < origin || day > finish) return null;
                  return (
                    <span
                      key={version.id}
                      title={`${version.versionNumber} ${version.plannedReleaseDate}`}
                      className="absolute top-1 size-3 -translate-x-1/2 rotate-45 bg-warning"
                      style={{ left: `${((day - origin) / span) * 100}%` }}
                    />
                  );
                })}
                {ticks.map((day) => (
                  <span key={day} className="type-caption absolute top-4 whitespace-nowrap" style={{ left: `${((day - origin) / span) * 100}%` }}>
                    {tickLabel(day, scale)}
                  </span>
                ))}
              </span>
            </div>
            <div ref={chartRef} className="relative" style={{ height: rows.length * SVG_ROW }}>
              {weekends.map((day) => (
                <span key={day} className="absolute top-0 bottom-0 bg-primary-soft/50" style={{ left: leftWidth + ((day - origin) / span) * timelineWidth, width: timelineWidth / span }} />
              ))}
              {showToday ? <span className="absolute top-0 bottom-0 z-10 w-px bg-danger" style={{ left: leftWidth + ((today - origin) / span) * timelineWidth }} /> : null}
              {rows.map((row) => {
                const left = ((dayNumber(row.start) - origin) / span) * 100;
                const width = Math.max(((dayNumber(row.end) - dayNumber(row.start) + 1) / span) * 100, 1.5);
                const progress = Math.min(Math.max(row.item.progress, 0), 100);
                const person = people.find((entry) => entry.id === row.item.assigneeId);
                return (
                  <div key={row.item.id} className="grid border-b border-border" style={{ gridTemplateColumns: grid, height: SVG_ROW }}>
                    <div className="flex min-w-0 items-center gap-1 pr-2" style={{ paddingLeft: 8 + row.depth * 14 }}>
                      {row.summary ? (
                        <button type="button" aria-expanded={!collapsed.includes(row.item.id)} className="type-caption w-5 shrink-0" onClick={() => setCollapsed((current) => current.includes(row.item.id) ? current.filter((id) => id !== row.item.id) : [...current, row.item.id])}>
                          {collapsed.includes(row.item.id) ? "▸" : "▾"}
                        </button>
                      ) : <span className="w-5 shrink-0" />}
                      <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => goToItem(row.item.id)}>
                        <IssueTypeIcon item={row.item} />
                        <span className="min-w-0">
                          <span className={row.summary ? "type-emphasis block truncate" : "type-link block truncate"}>{row.item.key}</span>
                          <span className="type-caption block truncate">{row.item.title}</span>
                        </span>
                      </button>
                    </div>
                    <span className="type-caption flex items-center truncate px-2">{person?.name ?? "未分配"}</span>
                    <span className="type-caption flex items-center truncate px-2">{statusLabel(row.item.kind, row.item.status)}</span>
                    <span className="relative" data-gantt-id={row.summary ? undefined : row.item.id}>
                      {!row.summary && row.item.baselineStart && row.item.baselineEnd ? (
                        <span className="absolute top-2 h-1 rounded-sm bg-fg/50" style={{ left: `${((dayNumber(row.item.baselineStart) - origin) / span) * 100}%`, width: `${Math.max(((dayNumber(row.item.baselineEnd) - dayNumber(row.item.baselineStart) + 1) / span) * 100, 1.5)}%` }} />
                      ) : null}
                      <span
                        className={cn("absolute top-1/2 h-6 -translate-y-1/2", row.summary ? "h-3 opacity-80" : "cursor-grab", critical.has(row.item.id) && "ring-2 ring-danger ring-inset")}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        onPointerDown={row.summary ? undefined : (event) => drag(row, "move", event)}
                      >
                        {!row.summary && row.item.kind === "task" ? (
                          <span className="absolute top-1/2 left-0 z-10 size-2.5 -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-full bg-primary" onPointerDown={(event) => linkFrom(row.item.id, event)} />
                        ) : null}
                        <span className={cn("absolute inset-0 rounded-sm", row.summary ? barTone(row.item) : cn("opacity-30", barTone(row.item)))} />
                        {!row.summary && progress > 0 ? <span className={cn("absolute inset-y-0 left-0 rounded-sm", barTone(row.item))} style={{ width: `${progress}%` }} /> : null}
                        {row.summary ? null : (
                          <>
                            <span className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize" onPointerDown={(event) => drag(row, "start", event)} />
                            <span className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize" onPointerDown={(event) => drag(row, "end", event)} />
                          </>
                        )}
                      </span>
                      {row.summary ? null : (
                        <button type="button" data-focus-key={`plan-${row.item.id}`} aria-label={`编辑 ${row.item.key} 计划日期，${row.start} 至 ${row.end}，进度 ${progress}%`} className="type-caption absolute bottom-0 left-1 max-w-full truncate text-left text-primary" onClick={() => setEditingId(row.item.id)}>
                          {row.start.slice(5)} — {row.end.slice(5)}
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
              <svg className="pointer-events-none absolute top-0 h-full" style={{ left: leftWidth, width: timelineWidth }} viewBox={`0 0 100 ${rows.length * SVG_ROW}`} preserveAspectRatio="none">
                {lines.map((line) => (
                  <path
                    key={line.id}
                    d={`M ${line.x1} ${line.y1} H ${(line.x1 + line.x2) / 2} V ${line.y2} H ${line.x2}`}
                    fill="none"
                    stroke={line.critical ? "#c52a2a" : line.type === "FS" ? "#0052cc" : "#44546f"}
                    strokeWidth="1.5"
                    strokeDasharray={line.type === "SS" ? "4 3" : line.type === "FF" ? "1.5 2" : line.type === "SF" ? "5 2 1 2" : undefined}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {rubber && fromRow ? (
                  <path d={`M ${edgeX(fromRow, "end", origin, span)} ${(indexOf.get(rubber.fromId) ?? 0) * SVG_ROW + SVG_ROW / 2} L ${rubber.x} ${rubber.y}`} fill="none" stroke="#0052cc" strokeWidth="1.5" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
                ) : null}
              </svg>
            </div>
          </div>
        ) : null}
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

function ColumnHead({ label, onResize }: { label: string; onResize: (event: ReactPointerEvent<HTMLElement>) => void }) {
  return (
    <span className="type-label relative flex items-center px-2 py-2">
      {label}
      <button type="button" aria-label={`调整${label}列宽`} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize" onPointerDown={onResize} />
    </span>
  );
}

function chartWidth(span: number, scale: Scale) {
  if (scale === "day") return Math.max(span * 28, 720);
  if (scale === "week") return Math.max(Math.ceil(span / 7) * 96, 720);
  return Math.max(Math.ceil(span / 30) * 120, 720);
}

function ticksFor(origin: number, finish: number, scale: Scale) {
  const ticks: number[] = [];
  if (scale === "month") {
    let cursor = origin;
    while (cursor <= finish) {
      ticks.push(cursor);
      const date = new Date(cursor * 86_400_000);
      const next = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) / 86_400_000;
      cursor = next <= cursor ? cursor + 28 : next;
    }
    return ticks;
  }
  const step = scale === "day" ? 1 : 7;
  for (let day = origin; day <= finish; day += step) ticks.push(day);
  return ticks;
}

function weekendDays(origin: number, finish: number) {
  const days: number[] = [];
  for (let day = origin; day <= finish; day += 1) {
    const weekday = new Date(day * 86_400_000).getUTCDay();
    if (weekday === 0 || weekday === 6) days.push(day);
  }
  return days;
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
  const spanMemo = new Map<string, { start: string; end: string } | null>();
  const spanOf = (id: string): { start: string; end: string } | null => {
    if (spanMemo.has(id)) return spanMemo.get(id) ?? null;
    const children = kids.get(id) ?? [];
    let start: string | undefined;
    let end: string | undefined;
    if (children.length === 0) {
      const own = rowOf.get(id);
      start = own?.start;
      end = own?.end;
    } else {
      for (const child of children) {
        const sub = spanOf(child);
        if (!sub) continue;
        if (!start || sub.start < start) start = sub.start;
        if (!end || sub.end > end) end = sub.end;
      }
    }
    const result = start && end ? { start, end } : null;
    spanMemo.set(id, result);
    return result;
  };
  const rows: Row[] = [];
  const emitted = new Set<string>();
  const emit = (id: string, depth: number, parentId: string | null) => {
    if (emitted.has(id)) return;
    const range = spanOf(id);
    const item = items.find((entry) => entry.id === id) ?? rowOf.get(id)?.item;
    if (!range || !item) return;
    emitted.add(id);
    const children = [...(kids.get(id) ?? [])].sort((a, b) => (spanOf(a)?.start ?? "").localeCompare(spanOf(b)?.start ?? "") || a.localeCompare(b));
    rows.push({ item, start: range.start, end: range.end, depth, summary: children.some((child) => spanOf(child)), parentId });
    for (const child of children) emit(child, depth + 1, id);
  };
  const roots = [...kids.keys()].filter((id) => {
    const parentId = items.find((item) => item.id === id)?.parentId;
    return !parentId || !kids.has(parentId);
  });
  for (const id of roots) emit(id, 0, null);
  for (const id of loose.sort((a, b) => (rowOf.get(a)?.start ?? "").localeCompare(rowOf.get(b)?.start ?? ""))) emit(id, 0, null);
  return rows;
}

function rangeDays(row: Row) {
  const days = [dayNumber(row.start), dayNumber(row.end)];
  if (!row.summary && row.item.baselineStart) days.push(dayNumber(row.item.baselineStart));
  if (!row.summary && row.item.baselineEnd) days.push(dayNumber(row.item.baselineEnd));
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
