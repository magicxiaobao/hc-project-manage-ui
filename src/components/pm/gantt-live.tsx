/**
 * 甘特图实时视图（P3：p3-gantt）。
 *
 * 数据全部来自后端（登录态），不再引用 usePm 演示 store：
 * - 时间条：GET /task/v1/gantt/{projectId}（tasks + links），按计划起止日渲染
 * - 拖拽改期/拖进度 → POST /task/v1/batchUpdate（{ tasks: Item[] }，wire 字段
 *   snake_case：start_date/end_date，camelCase 会 400；不接受状态字段）；
 *   同 projectId 并发写入按键串行（useBatchUpdateGanttTasks），拖动顺序 = 写入顺序
 * - 依赖连线：gantt 响应的 links 绘制 SVG；选中任务时用
 *   GET /task/v1/dependencies/{taskId} 展示前置/后置明细
 * - 关键路径高亮：走后端 GET /task/v1/criticalPath/{projectId}（老前端本地
 *   算已废弃，不重复造轮子），可开关
 * - 里程碑叠加：GET /milestone/list/{projectId} 在时间线顶部菱形标记，
 *   点击打开 MilestoneDialog（新建/编辑/删除）
 *
 * 状态分支（本轨道血泪教训）：loading/error/空分支绝不卸载脏表单——
 * gantt 首次失败（data === undefined）才走全页错误态；后台重取失败保留
 * 图表 + 顶部错误横幅 + 重试；里程碑/关键路径失败只出横幅，不影响主图。
 */
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button, Label, Spinner } from "@heroui/react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  EmptyHint,
  FieldError,
  GanttSkeleton,
  PageHeading,
  useUnsavedChangesGuard,
} from "@/components/biz";
import { MilestoneDialog } from "@/components/pm/milestone-dialog";
import {
  buildBatchUpdateItems,
  buildGanttRows,
  chartWidth,
  dayNumber,
  findUnscheduledTasks,
  instantToDateOnly,
  isValidDateOnly,
  isoFromDay,
  milestoneStatusLabel,
  normalizeCriticalPath,
  normalizeGanttData,
  normalizeTaskDependencies,
  sortMilestones,
  tickLabel,
  ticksFor,
  todayNumber,
  weekendDays,
  xPercent,
  type GanttRow,
  type GanttScale,
  type GanttTask,
  type TaskDraft,
} from "@/lib/gantt-live";
import type { MilestoneResponse } from "@/lib/api/gantt-types";
import {
  isGanttFatalError,
  toUserMessage,
  useBatchUpdateGanttTasks,
  useCriticalPath,
  useGanttData,
  useMilestoneList,
  useTaskGanttDependencies,
} from "@/lib/query";
import { cn } from "@/lib/utils";

const SVG_ROW = 56;
const MILESTONE_LANE = 30;

export function GanttLive({
  projectId,
  projectKey,
}: {
  projectId: number;
  projectKey: string;
}) {
  return (
    <GanttLiveInner
      key={projectId}
      projectId={projectId}
      projectKey={projectKey}
    />
  );
}

function GanttLiveInner({
  projectId,
  projectKey,
}: {
  projectId: number;
  projectKey: string;
}) {
  const ganttQuery = useGanttData({ projectId });
  const [showCritical, setShowCritical] = useState(true);
  const criticalQuery = useCriticalPath({ projectId, enabled: showCritical });
  const milestoneQuery = useMilestoneList({ projectId });
  const batchMutation = useBatchUpdateGanttTasks();

  const [scale, setScale] = useState<GanttScale>("week");
  const [collapsed, setCollapsed] = useState<number[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [milestoneEdit, setMilestoneEdit] = useState<MilestoneResponse | null>(null);

  // 拖拽草稿：id → 差量。state 驱动渲染，ref 供 pointerup 闭包读最新值。
  const [draft, setDraftState] = useState<Record<number, TaskDraft>>({});
  const draftRef = useRef<Record<number, TaskDraft>>({});
  const setDraft = (
    updater: (current: Record<number, TaskDraft>) => Record<number, TaskDraft>,
  ) => {
    const next = updater(draftRef.current);
    draftRef.current = next;
    setDraftState(next);
  };

  const chartRef = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const normalized = useMemo(() => normalizeGanttData(ganttQuery.data), [ganttQuery.data]);
  const originalsById = useMemo(
    () => new Map(normalized.tasks.map((task) => [task.id, task])),
    [normalized],
  );
  // 草稿合并到任务上渲染（mutation 成功前保留，失败回滚清空）
  const mergedTasks = useMemo(
    () =>
      normalized.tasks.map((task) => {
        const change = draft[task.id];
        return change ? { ...task, ...change } : task;
      }),
    [normalized, draft],
  );
  const rows = useMemo(() => buildGanttRows(mergedTasks), [mergedTasks]);
  const unscheduled = useMemo(() => findUnscheduledTasks(mergedTasks), [mergedTasks]);

  const milestones = useMemo(
    () => sortMilestones((milestoneQuery.data ?? []) as MilestoneResponse[]),
    [milestoneQuery.data],
  );
  const milestoneDates = useMemo(
    () =>
      milestones
        .map((item) => instantToDateOnly(item.endDate) || instantToDateOnly(item.startDate))
        .filter((date) => date !== ""),
    [milestones],
  );

  const criticalIds = useMemo(
    () => new Set(normalizeCriticalPath(criticalQuery.data).criticalIds),
    [criticalQuery.data],
  );
  const criticalDuration = useMemo(
    () => normalizeCriticalPath(criticalQuery.data).totalDuration,
    [criticalQuery.data],
  );

  // 折叠：隐藏被折叠父任务的后代行
  const visibleRows = useMemo(() => {
    const collapsedSet = new Set(collapsed);
    const hidden = new Set<number>();
    const parentOf = new Map(rows.map((row) => [row.task.id, row.parentId]));
    for (const row of rows) {
      let parent = row.parentId;
      while (parent !== null) {
        if (collapsedSet.has(parent)) {
          hidden.add(row.task.id);
          break;
        }
        parent = parentOf.get(parent) ?? null;
      }
    }
    return rows.filter((row) => !hidden.has(row.task.id));
  }, [rows, collapsed]);

  const rangeDays = useMemo(() => {
    const days: number[] = [];
    for (const row of visibleRows) {
      days.push(dayNumber(row.start), dayNumber(row.end));
    }
    for (const date of milestoneDates) days.push(dayNumber(date));
    return days;
  }, [visibleRows, milestoneDates]);
  const today = todayNumber();
  const origin = rangeDays.length > 0 ? Math.min(...rangeDays) : today;
  const finish = rangeDays.length > 0 ? Math.max(...rangeDays) : origin + 14;
  const span = Math.max(finish - origin, 1);
  const ticks = ticksFor(origin, finish, scale);
  const showToday = today >= origin && today <= finish;
  const weekends = weekendDays(origin, finish);
  const timelineWidth = chartWidth(span, scale);
  const leftWidth = 208 + 72 + 64;
  const grid = `208px 72px 64px ${timelineWidth}px`;
  const indexOf = useMemo(
    () => new Map(visibleRows.map((row, index) => [row.task.id, index])),
    [visibleRows],
  );
  const chartHeight = MILESTONE_LANE + visibleRows.length * SVG_ROW;

  const linkPaths = useMemo(
    () =>
      normalized.links
        .filter((link) => indexOf.has(link.source) && indexOf.has(link.target))
        .map((link) => {
          const fromRow = visibleRows[indexOf.get(link.source) ?? 0];
          const toRow = visibleRows[indexOf.get(link.target) ?? 0];
          const x1 = xPercent(dayNumber(fromRow.end) + 1, origin, span);
          const x2 = xPercent(dayNumber(toRow.start), origin, span);
          const y1 = MILESTONE_LANE + (indexOf.get(link.source) ?? 0) * SVG_ROW + SVG_ROW / 2;
          const y2 = MILESTONE_LANE + (indexOf.get(link.target) ?? 0) * SVG_ROW + SVG_ROW / 2;
          const critical =
            showCritical && criticalIds.has(link.source) && criticalIds.has(link.target);
          return { id: link.id, x1, x2, y1, y2, critical };
        }),
    [normalized.links, visibleRows, indexOf, origin, span, showCritical, criticalIds],
  );

  const openMilestoneDialog = (milestone: MilestoneResponse | null) => {
    setMilestoneEdit(milestone);
    setMilestoneOpen(true);
  };

  // ---------------- 拖拽：改期（move/start/end）与拖进度（progress）

  const commitDraft = () => {
    const items = buildBatchUpdateItems(draftRef.current, originalsById);
    if (items.length === 0) {
      setDraft(() => ({}));
      return;
    }
    // 成功前保留草稿（与服务端数据合并渲染）；失败回滚清空
    batchMutation.mutate(
      { projectId, payload: { tasks: items } },
      {
        onSuccess: () => {
          toast.success(`已保存 ${items.length} 个任务的计划调整`);
        },
        onError: (error) => {
          setDraft(() => ({}));
          toast.error(`保存失败，已回滚到服务端数据：${toUserMessage(error)}`);
        },
      },
    );
  };

  const dragBar = (
    row: GanttRow,
    edge: "move" | "start" | "end" | "progress",
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (row.summary || row.task.readonly || batchMutation.isPending) return;
    event.preventDefault();
    event.stopPropagation();
    const taskId = row.task.id;
    const start0 = dayNumber(row.start);
    const end0 = dayNumber(row.end);
    const progress0 = row.task.progress ?? 0;
    const originX = event.clientX;
    let barLeft = 0;
    let barWidth = 1;
    if (edge === "progress") {
      const bar = (event.target as HTMLElement).closest("[data-gantt-bar]");
      const rect = bar?.getBoundingClientRect();
      if (rect) {
        barLeft = rect.left;
        barWidth = Math.max(rect.width, 1);
      }
    }
    const applyDelta = (delta: number) => {
      setDraft((current) => {
        const prev = current[taskId] ?? {};
        if (edge === "progress") {
          const progress = Math.min(Math.max(Math.round(progress0 + delta), 0), 100);
          return { ...current, [taskId]: { ...prev, progress } };
        }
        let start = start0;
        let end = end0;
        if (edge === "move") {
          start += delta;
          end += delta;
        } else if (edge === "start") {
          start = Math.min(start0 + delta, end0);
        } else {
          end = Math.max(end0 + delta, start0);
        }
        return {
          ...current,
          [taskId]: { ...prev, startDate: isoFromDay(start), endDate: isoFromDay(end) },
        };
      });
    };
    const deltaOf = (clientX: number) => {
      if (edge === "progress") {
        return Math.round(((clientX - barLeft) / barWidth) * 100) - progress0;
      }
      return Math.round(((clientX - originX) / Math.max(timelineWidth, 1)) * span);
    };
    const move = (ev: PointerEvent) => applyDelta(deltaOf(ev.clientX));
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      applyDelta(deltaOf(ev.clientX));
      commitDraft();
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

  // ---------------- 状态分支

  const ganttFatal = isGanttFatalError(ganttQuery);
  const backgroundError =
    !ganttFatal && ganttQuery.isError ? ganttQuery.error : null;

  if (ganttQuery.isPending) {
    return <GanttSkeleton />;
  }

  if (ganttFatal) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-3 p-4 md:p-6">
        <PageHeading title="甘特图" hint="真实后端数据：任务时间条可拖拽改期，依赖连线与关键路径来自后端计算。" />
        <p className="type-body text-danger">
          甘特图数据加载失败：{toUserMessage(ganttQuery.error)}
        </p>
        <Button variant="ghost" onPress={() => void ganttQuery.refetch()}>
          重试
        </Button>
      </div>
    );
  }

  const selectedTask = selectedId !== null ? originalsById.get(selectedId) ?? null : null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeading
          title="甘特图"
          hint={`真实后端数据。拖动时间条改期，拖左右缘改工期，拖进度条末端小三角改进度；松开即按 projectId 串行写入（POST /task/v1/batchUpdate）。红框 = 后端计算的关键路径${showCritical && criticalDuration > 0 ? `（总工期 ${criticalDuration} 天）` : ""}。`}
        />
        <div className="flex flex-wrap gap-2">
          {(["day", "week", "month"] as GanttScale[]).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={scale === value ? "primary" : "outline"}
              onPress={() => setScale(value)}
            >
              {value === "day" ? "日" : value === "week" ? "周" : "月"}
            </Button>
          ))}
          <Button size="sm" variant="outline" onPress={scrollToday}>
            回到今天
          </Button>
          <Button
            size="sm"
            variant={showCritical ? "primary" : "outline"}
            onPress={() => setShowCritical((current) => !current)}
          >
            关键路径
          </Button>
          <Button size="sm" variant="outline" onPress={() => openMilestoneDialog(null)}>
            里程碑
          </Button>
        </div>
      </div>

      {batchMutation.isPending ? (
        <p className="type-caption flex items-center gap-2 text-default-500" role="status">
          <Spinner size="sm" />
          正在保存计划调整…
        </p>
      ) : null}

      {/* 后台重取失败：横幅 + 重试，保留图表与脏表单，不卸载 */}
      {backgroundError ? (
        <div className="flex items-center gap-3 rounded-md border border-danger/40 bg-danger/5 px-4 py-2">
          <p className="type-body flex-1 text-danger">
            数据加载失败（后台刷新）：{toUserMessage(backgroundError)}。当前展示上次成功的数据。
          </p>
          <Button size="sm" variant="ghost" onPress={() => void ganttQuery.refetch()}>
            重试
          </Button>
        </div>
      ) : null}

      {showCritical && criticalQuery.isError ? (
        <div className="flex items-center gap-3 rounded-md border border-warning/40 bg-warning/5 px-4 py-2">
          <p className="type-body flex-1 text-warning-700">
            关键路径计算失败：{toUserMessage(criticalQuery.error)}。时间条不受影响。
          </p>
          <Button size="sm" variant="ghost" onPress={() => void criticalQuery.refetch()}>
            重试
          </Button>
        </div>
      ) : null}

      {milestoneQuery.isError ? (
        <div className="flex items-center gap-3 rounded-md border border-warning/40 bg-warning/5 px-4 py-2">
          <p className="type-body flex-1 text-warning-700">
            里程碑加载失败：{toUserMessage(milestoneQuery.error)}。时间条不受影响。
          </p>
          <Button size="sm" variant="ghost" onPress={() => void milestoneQuery.refetch()}>
            重试
          </Button>
        </div>
      ) : null}

      {normalized.invalidCount > 0 ? (
        <p className="type-caption text-warning-700" role="status">
          后端返回了 {normalized.invalidCount} 条无法解析的任务/连线数据，已跳过。
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <span className="type-caption">红框 关键路径</span>
        <span className="type-caption">菱形 里程碑（点击编辑）</span>
        <span className="type-caption">浅蓝底 周末</span>
        <span className="type-caption">灰条 只读（依赖上下文）</span>
      </div>

      {visibleRows.length === 0 ? (
        <EmptyHint>还没有可画到时间线上的任务（需要计划开始/结束日期）。</EmptyHint>
      ) : (
        <div ref={scroller} className="overflow-x-auto rounded-sm border border-border bg-surface">
          <div style={{ width: leftWidth + timelineWidth }}>
            <div className="grid border-b border-border" style={{ gridTemplateColumns: grid }}>
              <span className="type-label flex items-center px-2 py-2">任务</span>
              <span className="type-label flex items-center px-2 py-2">状态</span>
              <span className="type-label flex items-center px-2 py-2">进度</span>
              <span className="relative h-10">
                {ticks.map((day) => (
                  <span
                    key={day}
                    className="type-caption absolute top-4 whitespace-nowrap"
                    style={{ left: `${xPercent(day, origin, span)}%` }}
                  >
                    {tickLabel(day, scale)}
                  </span>
                ))}
              </span>
            </div>
            <div ref={chartRef} className="relative" style={{ height: chartHeight }}>
              {/* 里程碑泳道 */}
              <div className="relative border-b border-border" style={{ height: MILESTONE_LANE }}>
                <span className="type-caption absolute top-1/2 left-2 -translate-y-1/2 text-default-400">
                  里程碑
                </span>
                {milestones.map((milestone) => {
                  const date = instantToDateOnly(milestone.endDate) || instantToDateOnly(milestone.startDate);
                  if (!date) return null;
                  const day = dayNumber(date);
                  if (day < origin || day > finish) return null;
                  return (
                    <button
                      key={milestone.id}
                      type="button"
                      title={`${milestone.name}（${milestoneStatusLabel(milestone.status)}）${date}`}
                      aria-label={`编辑里程碑 ${milestone.name}`}
                      className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-warning ring-1 ring-warning-700 hover:ring-2"
                      style={{ left: `${leftWidth + (xPercent(day, origin, span) / 100) * timelineWidth}px` }}
                      onClick={() => openMilestoneDialog(milestone)}
                    />
                  );
                })}
              </div>
              {weekends.map((day) => (
                <span
                  key={day}
                  className="absolute bottom-0 bg-primary-soft/50"
                  style={{
                    top: MILESTONE_LANE,
                    left: leftWidth + ((day - origin) / span) * timelineWidth,
                    width: timelineWidth / span,
                  }}
                />
              ))}
              {showToday ? (
                <span
                  className="absolute bottom-0 z-10 w-px bg-danger"
                  style={{
                    top: MILESTONE_LANE,
                    left: leftWidth + ((today - origin) / span) * timelineWidth,
                  }}
                />
              ) : null}
              {visibleRows.map((row) => {
                const left = xPercent(dayNumber(row.start), origin, span);
                const width = Math.max(xPercent(dayNumber(row.end) + 1, origin, span) - left, 1.5);
                const progress = Math.min(Math.max(row.task.progress ?? 0, 0), 100);
                const isCritical = showCritical && criticalIds.has(row.task.id);
                const isSelected = selectedId === row.task.id;
                const draggable = !row.summary && !row.task.readonly && !batchMutation.isPending;
                return (
                  <div
                    key={row.task.id}
                    className={cn("grid border-b border-border", isSelected && "bg-primary-soft/40")}
                    style={{ gridTemplateColumns: grid, height: SVG_ROW }}
                  >
                    <div className="flex min-w-0 items-center gap-1 pr-2" style={{ paddingLeft: 8 + row.depth * 14 }}>
                      {row.summary ? (
                        <button
                          type="button"
                          aria-expanded={!collapsed.includes(row.task.id)}
                          aria-label={collapsed.includes(row.task.id) ? `展开 ${row.task.text}` : `折叠 ${row.task.text}`}
                          className="type-caption w-5 shrink-0"
                          onClick={() =>
                            setCollapsed((current) =>
                              current.includes(row.task.id)
                                ? current.filter((id) => id !== row.task.id)
                                : [...current, row.task.id],
                            )
                          }
                        >
                          {collapsed.includes(row.task.id) ? "▸" : "▾"}
                        </button>
                      ) : (
                        <span className="w-5 shrink-0" />
                      )}
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left"
                        title={`${row.task.text}（#${row.task.id}）`}
                        onClick={() => setSelectedId((current) => (current === row.task.id ? null : row.task.id))}
                      >
                        <span className={cn("type-body block truncate", row.summary && "font-medium")}>
                          #{row.task.id} {row.task.text}
                        </span>
                        <span className="type-caption block truncate text-default-400">
                          {row.start.slice(5)} — {row.end.slice(5)}
                          {row.task.readonly ? " · 只读" : ""}
                        </span>
                      </button>
                    </div>
                    <span className="type-caption flex items-center truncate px-2">
                      {row.task.status ?? "—"}
                    </span>
                    <span className="type-caption flex items-center px-2">{progress}%</span>
                    <span className="relative">
                      <span
                        data-gantt-bar={draggable ? true : undefined}
                        title={draggable ? `拖动调整 ${row.task.text} 的计划日期；拖左右缘改工期，拖末端小块改进度` : undefined}
                        className={cn(
                          "absolute top-1/2 h-6 -translate-y-1/2",
                          row.summary ? "h-3 opacity-80" : "",
                          draggable ? "cursor-grab" : "",
                          row.task.readonly ? "opacity-40" : "",
                          isCritical ? "ring-2 ring-danger ring-inset" : "",
                        )}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        onPointerDown={draggable ? (event) => dragBar(row, "move", event) : undefined}
                      >
                        <span className={cn("absolute inset-0 rounded-sm", row.summary ? "bg-epic" : "bg-task opacity-30")} />
                        {!row.summary && progress > 0 ? (
                          <span className="absolute inset-y-0 left-0 rounded-sm bg-task" style={{ width: `${progress}%` }} />
                        ) : null}
                        {draggable ? (
                          <>
                            <span
                              className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize"
                              onPointerDown={(event) => dragBar(row, "start", event)}
                            />
                            <span
                              className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize"
                              onPointerDown={(event) => dragBar(row, "end", event)}
                            />
                            {/* 进度拖柄：进度填充末端的小三角 */}
                            <span
                              className="absolute top-0 bottom-0 z-10 w-3 cursor-ew-resize"
                              style={{ left: `calc(${progress}% - 6px)` }}
                              title="拖动调整进度"
                              onPointerDown={(event) => dragBar(row, "progress", event)}
                            >
                              <span className="absolute top-1/2 left-1/2 h-3 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-fg" />
                            </span>
                          </>
                        ) : null}
                      </span>
                    </span>
                  </div>
                );
              })}
              <svg
                className="pointer-events-none absolute top-0 h-full"
                style={{ left: leftWidth, width: timelineWidth }}
                viewBox={`0 0 100 ${chartHeight}`}
                preserveAspectRatio="none"
              >
                {linkPaths.map((line) => (
                  <path
                    key={line.id}
                    d={`M ${line.x1} ${line.y1} H ${(line.x1 + line.x2) / 2} V ${line.y2} H ${line.x2}`}
                    fill="none"
                    stroke={line.critical ? "#c52a2a" : "#0052cc"}
                    strokeWidth="1.5"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
            </div>
          </div>
        </div>
      )}

      {unscheduled.length > 0 ? (
        <p className="type-caption">
          未排期（{unscheduled.length}）：{unscheduled.slice(0, 8).map((task) => `#${task.id} ${task.text}`).join("、")}
          {unscheduled.length > 8 ? "…" : ""}
        </p>
      ) : null}

      {selectedTask ? (
        <SelectedTaskPanel
          key={selectedId}
          projectKey={projectKey}
          task={selectedTask}
          batchPending={batchMutation.isPending}
          onSubmit={(items) => {
            batchMutation.mutate(
              { projectId, payload: { tasks: items } },
              {
                onSuccess: () => toast.success("已保存计划调整"),
                onError: (error) => toast.error(`保存失败：${toUserMessage(error)}`),
              },
            );
          }}
          onClose={() => setSelectedId(null)}
        />
      ) : null}

      {milestoneOpen ? (
        <MilestoneDialog
          open
          projectId={projectId}
          initialEdit={milestoneEdit}
          onClose={() => {
            setMilestoneOpen(false);
            setMilestoneEdit(null);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * 选中任务面板：计划日期/进度编辑（键盘可达的改期入口，与拖拽同一
 * batchUpdate 通道）+ 前置/后置依赖明细。
 * 内联表单接 dirty 守卫：blocker 挂在面板根部（非弹窗，无 AppModal 嵌套问题）。
 */
function SelectedTaskPanel({
  projectKey,
  task,
  batchPending,
  onSubmit,
  onClose,
}: {
  projectKey: string;
  task: GanttTask;
  batchPending: boolean;
  onSubmit: (items: { id: number; start_date?: string; end_date?: string; progress?: number }[]) => void;
  onClose: () => void;
}) {
  const depsQuery = useTaskGanttDependencies({ taskId: task.id });
  const deps = useMemo(() => normalizeTaskDependencies(depsQuery.data), [depsQuery.data]);

  const [startDate, setStartDate] = useState(task.startDate ?? "");
  const [endDate, setEndDate] = useState(task.endDate ?? "");
  const [progress, setProgress] = useState(String(task.progress ?? 0));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isDirty =
    startDate !== (task.startDate ?? "") ||
    endDate !== (task.endDate ?? "") ||
    progress !== String(task.progress ?? 0);
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(isDirty);

  const close = () => guard(onClose);

  const clearError = (field: string) =>
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });

  const handleSave = () => {
    const next: Record<string, string> = {};
    if (startDate && !isValidDateOnly(startDate)) next.startDate = "开始日期格式无效（YYYY-MM-DD）";
    if (endDate && !isValidDateOnly(endDate)) next.endDate = "结束日期格式无效（YYYY-MM-DD）";
    if (startDate && endDate && isValidDateOnly(startDate) && isValidDateOnly(endDate) && startDate > endDate) {
      next.endDate = "结束日期不能早于开始日期";
    }
    const progressNum = Number(progress);
    if (progress.trim() === "" || !Number.isFinite(progressNum) || progressNum < 0 || progressNum > 100) {
      next.progress = "进度必须是 0–100 的数字";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const item: { id: number; start_date?: string; end_date?: string; progress?: number } = {
      id: task.id,
    };
    let changed = false;
    if (startDate !== (task.startDate ?? "") && isValidDateOnly(startDate)) {
      item.start_date = startDate;
      changed = true;
    }
    if (endDate !== (task.endDate ?? "") && isValidDateOnly(endDate)) {
      item.end_date = endDate;
      changed = true;
    }
    const rounded = Math.round(progressNum);
    if (rounded !== (task.progress ?? 0)) {
      item.progress = rounded;
      changed = true;
    }
    if (!changed) {
      guard(onClose);
      return;
    }
    // 防御：起止反转则交换，保证 start ≤ end
    if (item.start_date && item.end_date && item.start_date > item.end_date) {
      const swap = item.start_date;
      item.start_date = item.end_date;
      item.end_date = swap;
    }
    // 提交即授权离开：面板关闭，不拦截
    markClean();
    onClose();
    onSubmit([item]);
  };

  const inputClass = "type-body h-9 w-full rounded-sm border border-border bg-surface px-2";

  return (
    <section aria-label={`任务 #${task.id} ${task.text}`} className="rounded-sm border border-border bg-surface p-4">
      {blocker}
      {dialog}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="type-section">
          #{task.id} {task.text}
          {task.readonly ? <span className="type-caption ml-2 text-default-400">只读</span> : null}
        </h2>
        <div className="flex gap-2">
          <Link
            to="/p/$projectKey/issues/$taskId"
            params={{ projectKey, taskId: String(task.id) }}
            className="type-caption text-primary hover:underline"
          >
            查看详情
          </Link>
          <button type="button" className="type-caption text-default-500 hover:underline" onClick={close}>
            关闭面板
          </button>
        </div>
      </div>

      {task.readonly ? (
        <p className="type-caption mb-3 text-default-500">
          该任务在甘特图数据中标记为只读（依赖上下文中的失效端点），不可调整计划。
        </p>
      ) : (
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <Label className="mb-1 block">计划开始</Label>
            <input
              type="date"
              aria-label="计划开始日期"
              className={inputClass}
              value={startDate}
              disabled={batchPending}
              onChange={(event) => {
                setStartDate(event.target.value);
                clearError("startDate");
              }}
            />
            <FieldError message={errors.startDate} />
          </div>
          <div>
            <Label className="mb-1 block">计划结束</Label>
            <input
              type="date"
              aria-label="计划结束日期"
              className={inputClass}
              value={endDate}
              disabled={batchPending}
              onChange={(event) => {
                setEndDate(event.target.value);
                clearError("endDate");
              }}
            />
            <FieldError message={errors.endDate} />
          </div>
          <div>
            <Label className="mb-1 block">进度（0–100）</Label>
            <input
              type="number"
              aria-label="进度百分比"
              className={inputClass}
              value={progress}
              min={0}
              max={100}
              disabled={batchPending}
              onChange={(event) => {
                setProgress(event.target.value);
                clearError("progress");
              }}
            />
            <FieldError message={errors.progress} />
          </div>
          <div className="flex items-end gap-2">
            <Button variant="primary" size="sm" onPress={handleSave} isDisabled={batchPending || !isDirty}>
              {batchPending ? <Spinner size="sm" /> : null}
              保存
            </Button>
            <Button variant="ghost" size="sm" onPress={close} isDisabled={batchPending}>
              取消
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <DependencyList
          title="前置任务"
          loading={depsQuery.isPending}
          error={depsQuery.isError ? depsQuery.error : null}
          onRetry={() => void depsQuery.refetch()}
          items={deps.predecessors}
          projectKey={projectKey}
        />
        <DependencyList
          title="后置任务"
          loading={depsQuery.isPending}
          error={depsQuery.isError ? depsQuery.error : null}
          onRetry={() => void depsQuery.refetch()}
          items={deps.successors}
          projectKey={projectKey}
        />
      </div>
    </section>
  );
}

function DependencyList({
  title,
  loading,
  error,
  onRetry,
  items,
  projectKey,
}: {
  title: string;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  items: { id: number; title: string }[];
  projectKey: string;
}) {
  return (
    <div className="rounded-sm border border-border p-3">
      <h3 className="type-label mb-2">{title}</h3>
      {loading ? (
        <p className="type-caption flex items-center gap-2 text-default-500">
          <Spinner size="sm" />
          加载中…
        </p>
      ) : error ? (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="type-caption text-danger">
            加载失败：{toUserMessage(error)}
          </p>
          <Button size="sm" variant="ghost" onPress={onRetry}>
            重试
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className="type-caption text-default-400">无</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.id} className="type-body">
              <Link
                to="/p/$projectKey/issues/$taskId"
                params={{ projectKey, taskId: String(item.id) }}
                className="hover:underline"
              >
                #{item.id} {item.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
