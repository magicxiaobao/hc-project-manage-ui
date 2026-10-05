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
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button, Label, Spinner } from "@heroui/react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  EmptyHint,
  FieldError,
  GanttSkeleton,
  PageHeading,
  RequiredMark,
  useUnsavedChangesGuard,
} from "@/components/biz";
import { MilestoneDialog } from "@/components/pm/milestone-dialog";
import {
  buildBatchUpdateItems,
  buildGanttRows,
  chartWidth,
  clampBarWidth,
  closeSelectedIfCurrent,
  dayNumber,
  dropUnsupportedDraftEntries,
  findUnscheduledTasks,
  instantToDateOnly,
  isProgressLocked,
  isSameTaskDraft,
  isValidDateOnly,
  isoFromDay,
  milestoneStatusLabel,
  normalizeCriticalPath,
  normalizeGanttData,
  normalizeTaskDependencies,
  overlayCommittedBaseline,
  partitionConfirmedBatches,
  pruneDeadBatches,
  restoreDraftAfterFailure,
  sortMilestones,
  tickLabel,
  ticksFor,
  todayNumber,
  weekendDays,
  xPercent,
  type CommittedBatch,
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

  // 选中任务面板的脏态上报到这里：切换/取消选中任务（= 卸载脏面板）
  // 必须经过这里的 dirty guard，否则面板自己的守卫随卸载一起消失，
  // 形同虚设
  const [panelDirty, setPanelDirty] = useState(false);
  const [panelSavePending, setPanelSavePending] = useState(false);
  const selectionGuard = useUnsavedChangesGuard(panelDirty);
  const reportPanelDirty = useCallback((dirty: boolean) => setPanelDirty(dirty), []);
  const reportPanelSavePending = useCallback((pending: boolean) => setPanelSavePending(pending), []);
  const requestSelectTask = (taskId: number) => {
    // r25-4：面板保存请求在途时禁止切换任务——旧面板的 onSuccess 闭包
    // 会无条件关闭新面板，丢弃其未保存修改并绕过 dirty 守卫
    if (panelSavePending) {
      toast("正在保存任务调整，请稍候再切换。");
      return;
    }
    selectionGuard.guard(() =>
      setSelectedId((current) => (current === taskId ? null : taskId)),
    );
  };

  // 拖拽草稿：id → 差量。state 驱动渲染，ref 供 pointerup 闭包读最新值。
  const [draft, setDraftState] = useState<Record<number, TaskDraft>>({});
  const draftRef = useRef<Record<number, TaskDraft>>({});
  const setDraft = useCallback(
    (updater: (current: Record<number, TaskDraft>) => Record<number, TaskDraft>) => {
      const next = updater(draftRef.current);
      draftRef.current = next;
      setDraftState(next);
    },
    [],
  );

  // 成功提交继续覆盖旧缓存；值落地或更新的权威读取证明已被覆盖后释放。
  const commitLogRef = useRef<CommittedBatch[]>([]);
  const dragCancelRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const log = commitLogRef.current;
    if (log.length === 0) return;
    const authoritative = new Map(
      normalizeGanttData(ganttQuery.data).tasks.map((task) => [task.id, task]),
    );
    const { confirmed, remaining } = partitionConfirmedBatches(log, authoritative, ganttQuery.readVersion);
    const released: Record<number, TaskDraft> = {};
    for (const batch of confirmed) Object.assign(released, batch.snapshot);
    // 先纯算出释放后的 draft，再据此裁剪死批次，最后一次性落盘
    const current = draftRef.current;
    let next = current;
    for (const [idKey, change] of Object.entries(released)) {
      const id = Number(idKey);
      const existing = next[id];
      if (existing !== undefined && isSameTaskDraft(existing, change)) {
        if (next === current) next = { ...current };
        delete next[id];
      }
    }
    // 正在拖动/提交时，旧快照仍是取消或失败回滚的基线，不能提前裁掉。
    commitLogRef.current = batchMutation.isPending || dragCancelRef.current
      ? remaining
      : pruneDeadBatches(remaining, next);
    if (next !== current) setDraft(() => next);
  }, [ganttQuery.dataUpdatedAt, ganttQuery.data, ganttQuery.readVersion, batchMutation.isPending, setDraft]);

  const chartRef = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => () => dragCancelRef.current?.(), []);

  const normalized = useMemo(() => normalizeGanttData(ganttQuery.data), [ganttQuery.data]);
  const originalsById = useMemo(
    () => new Map(normalized.tasks.map((task) => [task.id, task])),
    [normalized],
  );
  // 草稿合并到任务上渲染：提交成功后保持应用，直到某次权威重取确认
  // 该批（上方 effect 按批释放）；提交失败回滚本次字段
  const mergedTasks = useMemo(
    () =>
      normalized.tasks.map((task) => {
        const change = draft[task.id];
        return change ? { ...task, ...change } : task;
      }),
    [normalized, draft],
  );
  // 编辑面板从合并后的任务取值：拖拽保存在途/权威重取前，面板与时间条显示一致
  const mergedById = useMemo(
    () => new Map(mergedTasks.map((task) => [task.id, task])),
    [mergedTasks],
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
  // 条宽与依赖起点按 end+1（含结束日）计算，范围跨度也要含结束日，
  // 否则条末端坐标会超过 100% 越界
  const span = Math.max(finish - origin + 1, 1);
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
    // r25-1：diff 基线 = 权威缓存叠加已提交值。提交成功后、权威重取到达前
    // 旧缓存仍是提交前的值，直接相对它比较会误判（窗口内再次拖拽按旧几何
    // 基线提交，覆盖已保存的新日期）。
    const committed: Record<number, TaskDraft> = {};
    for (const batch of commitLogRef.current) Object.assign(committed, batch.snapshot);
    const baseline = overlayCommittedBaseline(originalsById, committed);
    const items = buildBatchUpdateItems(draftRef.current, baseline);
    if (items.length === 0) {
      // r26-1：无变化（如原地单击 delta=0）时不提交。
      // r27-2：顺带清理"与基线同值、且无提交日志支撑"的残留条目——它们
      // 永远不会被确认释放，会永久遮蔽权威数据（r26-1 要求保留的是已提交
      // 未释放的值，那些必在 commitLog 快照中，不在此列）。
      const cleaned = dropUnsupportedDraftEntries(
        draftRef.current,
        commitLogRef.current,
        baseline,
      );
      if (cleaned !== draftRef.current) setDraft(() => cleaned);
      return;
    }
    const snapshot = { ...draftRef.current };
    const submittedBaseline = Object.fromEntries(items.map((item) => {
      const task = baseline.get(item.id)!;
      return [item.id, { startDate: task.startDate, endDate: task.endDate, progress: task.progress }];
    }));
    batchMutation.mutate(
      { projectId, payload: { tasks: items } },
      {
        onSuccess: ({ version }) => {
          commitLogRef.current = [
            ...commitLogRef.current,
            {
              version,
              items,
              snapshot,
              baseline: submittedBaseline,
            },
          ];
          toast.success(`已保存 ${items.length} 个任务的计划调整`);
        },
        onError: () => {
          // 错误提示由 hook 发出；回滚失败字段，保留剩余成功批次与后来的修改。
          const restored = restoreDraftAfterFailure(
            snapshot,
            draftRef.current,
            items,
            commitLogRef.current,
          );
          setDraft(() => restored);
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
    // 终态任务进度只读（后端 COMPLETED/CANCELLED 口径）：禁止拖进度，改期仍允许
    if (edge === "progress" && isProgressLocked(row.task.status)) return;
    dragCancelRef.current?.();
    event.preventDefault();
    event.stopPropagation();
    const pointerId = event.pointerId;
    const captureTarget = event.currentTarget;
    const taskId = row.task.id;
    const start0 = dayNumber(row.start);
    const end0 = dayNumber(row.end);
    const progress0 = row.task.progress ?? 0;
    const originX = event.clientX;
    // r27-2：记录拖拽开始前该任务是否已有草稿条目。零差量收尾时，只有
    // "本次新建的无差量条目"才可丢弃；已存在的条目（已提交未释放等）必须
    // 保留，不能误删。
    const hadDraftEntry = taskId in draftRef.current;
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
    const move = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) applyDelta(deltaOf(ev.clientX));
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancelPointer);
      window.removeEventListener("blur", cancel);
      captureTarget.removeEventListener("lostpointercapture", cancelPointer);
      dragCancelRef.current = null;
      if (captureTarget.hasPointerCapture(pointerId)) captureTarget.releasePointerCapture(pointerId);
    };
    const cancel = () => {
      cleanup();
      // 中断不提交；只回滚本次拖动字段，保留其他字段与待确认成功值。
      setDraft((current) => restoreDraftAfterFailure(
        current,
        current,
        [{
          id: taskId,
          ...(edge === "progress"
            ? { progress: current[taskId]?.progress ?? progress0 }
            : { start_date: isoFromDay(start0), end_date: isoFromDay(end0) }),
        }],
        commitLogRef.current,
      ));
    };
    const cancelPointer = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) cancel();
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      cleanup();
      const delta = deltaOf(ev.clientX);
      if (delta === 0 && !hadDraftEntry) {
        setDraft((current) => {
          if (!(taskId in current)) return current;
          const next = { ...current };
          delete next[taskId];
          return next;
        });
        return;
      }
      applyDelta(delta);
      commitDraft();
    };
    dragCancelRef.current = cancel;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancelPointer);
    window.addEventListener("blur", cancel);
    captureTarget.addEventListener("lostpointercapture", cancelPointer);
    captureTarget.setPointerCapture(pointerId);
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

  const selectedTask = selectedId !== null ? mergedById.get(selectedId) ?? null : null;

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

      {/* 无可见任务行但有里程碑时仍渲染图表：里程碑泳道是时间线的一部分，
          里程碑日期也参与了范围计算 */}
      {visibleRows.length === 0 && milestoneDates.length === 0 ? (
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
                // r25-3：最小视觉宽度 1.5%，但右端钳制在 100% 以内
                const width = clampBarWidth(xPercent(dayNumber(row.end) + 1, origin, span) - left, left);
                const progress = Math.min(Math.max(row.task.progress ?? 0, 0), 100);
                const isCritical = showCritical && criticalIds.has(row.task.id);
                const isSelected = selectedId === row.task.id;
                const draggable = !row.summary && !row.task.readonly && !batchMutation.isPending;
                // 终态任务的进度拖柄禁用（进度只读，改期仍可拖）
                const progressDraggable = draggable && !isProgressLocked(row.task.status);
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
                        onClick={() => requestSelectTask(row.task.id)}
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
                        title={draggable ? (progressDraggable ? `拖动调整 ${row.task.text} 的计划日期；拖左右缘改工期，拖末端小块改进度` : `拖动调整 ${row.task.text} 的计划日期；拖左右缘改工期（已完成/已取消任务进度只读）`) : undefined}
                        className={cn(
                          "absolute top-1/2 h-6 -translate-y-1/2",
                          row.summary ? "h-3 opacity-80" : "",
                          draggable ? "cursor-grab touch-none" : "",
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
                            {/* 进度拖柄：进度填充末端的小三角（终态任务禁用） */}
                            {progressDraggable ? (
                              <span
                                className="absolute top-0 bottom-0 z-10 w-3 cursor-ew-resize"
                                style={{ left: `calc(${progress}% - 6px)` }}
                                title="拖动调整进度"
                                onPointerDown={(event) => dragBar(row, "progress", event)}
                              >
                                <span className="absolute top-1/2 left-1/2 h-3 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-fg" />
                              </span>
                            ) : null}
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
        <>
          {selectionGuard.dialog}
          {selectionGuard.blocker}
          <SelectedTaskPanel
            key={selectedId}
            projectId={projectId}
            projectKey={projectKey}
            task={selectedTask}
            guard={selectionGuard.guard}
            markClean={selectionGuard.markClean}
            cancelConfirm={selectionGuard.cancelConfirm}
            onDirtyChange={reportPanelDirty}
            onSavePendingChange={reportPanelSavePending}
            // r25-4：按 id 条件关闭——旧面板保存成功回调的闭包 onClose 不能
            // 无条件关闭：期间若已选中新任务，必须保留新面板
            onClose={() => setSelectedId((current) => closeSelectedIfCurrent(current, selectedTask.id))}
          />
        </>
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
 * 脏拦截由父级的 selectionGuard 统一接管：切换/取消选中任务（= 卸载面板）
 * 也要先过确认，面板自己的守卫随卸载消失、覆盖不到这里。dirty 判定基线是
 * 挂载瞬间的冻结快照（board-form-dialog 的 initialRef 约定），不是实时 task
 * prop——打开面板期间后台重取带来的 prop 变化不能翻脏，否则会把刚保存的
 * 拖拽值写回旧值。
 */
function SelectedTaskPanel({
  projectId,
  projectKey,
  task,
  guard,
  markClean,
  cancelConfirm,
  onDirtyChange,
  onSavePendingChange,
  onClose,
}: {
  projectId: number;
  projectKey: string;
  task: GanttTask;
  guard: (action: () => void) => void;
  markClean: () => void;
  cancelConfirm: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSavePendingChange?: (pending: boolean) => void;
  onClose: () => void;
}) {
  const depsQuery = useTaskGanttDependencies({ taskId: task.id });
  const deps = useMemo(() => normalizeTaskDependencies(depsQuery.data), [depsQuery.data]);

  // 挂载瞬间的冻结基线（只捕获一次）：dirty = 当前值偏离该快照
  const initialRef = useRef({
    startDate: task.startDate ?? "",
    endDate: task.endDate ?? "",
    progress: String(task.progress ?? 0),
  });
  const initial = initialRef.current;

  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [progress, setProgress] = useState(initial.progress);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");

  const saveMutation = useBatchUpdateGanttTasks();
  const batchPending = saveMutation.isPending;
  // 终态任务进度只读（后端 COMPLETED/CANCELLED 口径）：进度输入禁用，
  // 不参与脏判断与提交载荷
  const progressLocked = isProgressLocked(task.status);

  const isDirty =
    startDate !== initial.startDate ||
    endDate !== initial.endDate ||
    (!progressLocked && progress !== initial.progress);

  // 脏态上报给父级守卫；卸载时清零，避免残留脏标记拦截后续切换
  useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  // r25-4：保存请求在途状态上报父级——在途时父级禁止切换任务/关闭面板；
  // 卸载时清零
  useEffect(() => {
    onSavePendingChange?.(batchPending);
    return () => onSavePendingChange?.(false);
  }, [batchPending, onSavePendingChange]);

  const close = () => guard(onClose);

  const clearError = (field: string) =>
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });

  const handleSave = () => {
    setSubmitError("");
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
    if (startDate !== initial.startDate && isValidDateOnly(startDate)) {
      item.start_date = startDate;
      changed = true;
    }
    if (endDate !== initial.endDate && isValidDateOnly(endDate)) {
      item.end_date = endDate;
      changed = true;
    }
    const rounded = Math.round(progressNum);
    if (!progressLocked && rounded !== Number(initial.progress)) {
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
    // 成功才放行并关闭；失败时保留草稿与面板，只展示错误（不 markClean、不关闭）
    saveMutation.mutate(
      { projectId, payload: { tasks: [item] } },
      {
        onSuccess: () => {
          // r25-4：编辑会话结束——先复位可能残留的确认框（confirming/
          // pendingRef），否则下次选中新任务会弹出过期确认框执行陈旧动作；
          // 再清脏关闭（父级 onClose 按 id 条件关闭，旧面板回调不会关新面板）
          cancelConfirm();
          markClean();
          toast.success("已保存计划调整");
          onClose();
        },
        onError: (error) => {
          // r25-5/r26-4：内联错误保留在面板内（挂载时可见）；跨卸载的
          // 失败 toast 由 useBatchUpdateGanttTasks 的 hook 级 onError 发出
          // （mutate 单次回调在面板卸载后不会执行），这里不再重复 toast。
          setSubmitError(toUserMessage(error));
        },
      },
    );
  };

  const inputClass = "type-body h-9 w-full rounded-sm border border-border bg-surface px-2";

  return (
    <section aria-label={`任务 #${task.id} ${task.text}`} className="rounded-sm border border-border bg-surface p-4">
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
          <button
            type="button"
            className="type-caption text-default-500 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            onClick={close}
            disabled={batchPending}
            title={batchPending ? "正在保存，请稍候" : undefined}
          >
            关闭面板
          </button>
        </div>
      </div>

      {submitError ? (
        <p role="alert" className="type-caption mb-3 text-danger">
          保存失败：{submitError}
        </p>
      ) : null}

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
            <Label className="mb-1 block">
              进度（0–100）
              <RequiredMark />
            </Label>
            <input
              type="number"
              aria-label="进度百分比"
              className={inputClass}
              value={progress}
              min={0}
              max={100}
              disabled={batchPending || progressLocked}
              onChange={(event) => {
                setProgress(event.target.value);
                clearError("progress");
              }}
            />
            {progressLocked ? (
              <p className="type-caption mt-1 text-default-400">
                已完成/已取消任务进度只读（后端状态机锁定），只能改期。
              </p>
            ) : null}
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
