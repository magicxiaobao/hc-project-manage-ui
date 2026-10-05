/**
 * 甘特图纯逻辑回归测试（P3：p3-gantt）。
 *
 * 覆盖：gantt 响应防御归一（snake_case 日期、畸形条目丢弃）、关键路径归一、
 * 依赖归一、任务树行构建（含汇总行跨度/防环/未排期过滤）、日期几何、
 * batchUpdate 载荷构建（只发变化字段、snake_case、进度钳制、只读跳过）、
 * 按键串行队列（同键串行/异键并发/失败不阻塞后继）、里程碑 Instant 转换、
 * 表单校验（收集全部错误）、更新差量（字段出现即提交）。
 */
import { describe, expect, it } from "vitest";
import {
  batchValuesConfirmed,
  buildBatchUpdateItems,
  buildGanttRows,
  chartWidth,
  clampBarWidth,
  closeSelectedIfCurrent,
  createKeyedSerialQueue,
  dateOnlyToInstant,
  dayNumber,
  diffMilestoneFields,
  dropUnsupportedDraftEntries,
  findUnscheduledTasks,
  instantToDateOnly,
  isProgressLocked,
  isSameTaskDraft,
  isValidDateOnly,
  isoFromDay,
  milestoneStatusLabel,
  milestoneToFormValues,
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
  validateMilestoneForm,
  weekendDays,
  xPercent,
  type CommittedBatch,
  type GanttTask,
  type TaskDraft,
} from "../gantt-live";

function makeTask(overrides: Partial<GanttTask> = {}): GanttTask {
  return {
    id: 1,
    text: "任务",
    startDate: "2026-10-01",
    endDate: "2026-10-05",
    progress: 50,
    status: "DOING",
    priority: "HIGH",
    parent: 0,
    validStatus: 0,
    readonly: false,
    ...overrides,
  };
}

describe("normalizeGanttData", () => {
  it("归一标准响应：snake_case 日期保留，links 提取", () => {
    const result = normalizeGanttData({
      data: [
        {
          id: 11,
          text: "需求分析",
          start_date: "2026-10-01",
          end_date: "2026-10-07",
          progress: 30,
          priority: "HIGH",
          status: "DOING",
          parent: 0,
          validStatus: 0,
          readonly: false,
        },
      ],
      links: [{ id: 5, source: 11, target: 12, type: "0" }],
    });
    expect(result.invalidCount).toBe(0);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]).toMatchObject({
      id: 11,
      text: "需求分析",
      startDate: "2026-10-01",
      endDate: "2026-10-07",
      progress: 30,
    });
    expect(result.links).toEqual([{ id: 5, source: 11, target: 12, type: "0" }]);
  });

  it("非法日期归 null；畸形条目丢弃并计数", () => {
    const result = normalizeGanttData({
      data: [
        { id: 21, text: "A", start_date: "2026-13-99", end_date: null, progress: 10, parent: 0, validStatus: 0 },
        { id: "oops", text: "B" },
        null,
        { id: 22, text: "", start_date: "2026-10-01", end_date: "2026-10-02", parent: 0, validStatus: 1, readonly: true },
      ],
      links: [{ id: 1, source: 21 }],
    });
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks[0].startDate).toBeNull();
    // 空标题回退为 "任务 #id"
    expect(result.tasks[1].text).toBe("任务 #22");
    // validStatus 非 0 → 只读
    expect(result.tasks[1].readonly).toBe(true);
    // 畸形：id 非数字、B(null)、link 缺 target → 3
    expect(result.invalidCount).toBe(3);
    expect(result.links).toHaveLength(0);
  });

  it("非对象/缺键输入归一为空", () => {
    expect(normalizeGanttData(null)).toEqual({ tasks: [], links: [], invalidCount: 0 });
    expect(normalizeGanttData("oops")).toEqual({ tasks: [], links: [], invalidCount: 0 });
    expect(normalizeGanttData({})).toEqual({ tasks: [], links: [], invalidCount: 0 });
  });

  it("进度钳制到 0–100 整数", () => {
    const result = normalizeGanttData({
      data: [{ id: 31, start_date: "2026-10-01", end_date: "2026-10-02", progress: 150.7, parent: 0, validStatus: 0 }],
    });
    expect(result.tasks[0].progress).toBe(100);
  });
});

describe("normalizeCriticalPath", () => {
  it("提取 criticalPath id 数组与总工期", () => {
    const result = normalizeCriticalPath({
      criticalPath: [3, 7, 9],
      totalDuration: 42,
      criticalTasks: [{ id: 3 }],
      projectId: 1,
    });
    expect(result).toEqual({ criticalIds: [3, 7, 9], totalDuration: 42 });
  });

  it("畸形输入归一为空", () => {
    expect(normalizeCriticalPath(null)).toEqual({ criticalIds: [], totalDuration: 0 });
    expect(normalizeCriticalPath({ criticalPath: [1, "x", null, 2] })).toEqual({
      criticalIds: [1, 2],
      totalDuration: 0,
    });
  });
});

describe("normalizeTaskDependencies", () => {
  it("提取前置/后置任务引用", () => {
    const result = normalizeTaskDependencies({
      predecessors: [{ id: 1, title: "前置 A" }],
      successors: [{ id: 2, title: "后置 B" }, { id: "x" }],
    });
    expect(result.predecessors).toEqual([{ id: 1, title: "前置 A" }]);
    expect(result.successors).toEqual([{ id: 2, title: "后置 B" }]);
  });

  it("空依赖返回双空数组", () => {
    expect(normalizeTaskDependencies({ predecessors: [], successors: [] })).toEqual({
      predecessors: [],
      successors: [],
    });
  });
});

describe("buildGanttRows", () => {
  it("父子任务成树：父行汇总跨度、子行缩进", () => {
    const rows = buildGanttRows([
      makeTask({ id: 1, text: "父", startDate: null, endDate: null }),
      makeTask({ id: 2, text: "子 A", parent: 1, startDate: "2026-10-01", endDate: "2026-10-03" }),
      makeTask({ id: 3, text: "子 B", parent: 1, startDate: "2026-10-04", endDate: "2026-10-08" }),
    ]);
    expect(rows.map((row) => row.task.id)).toEqual([1, 2, 3]);
    expect(rows[0]).toMatchObject({
      summary: true,
      depth: 0,
      start: "2026-10-01",
      end: "2026-10-08",
      parentId: null,
    });
    expect(rows[1]).toMatchObject({ summary: false, depth: 1, parentId: 1 });
  });

  it("父任务自身有日期时优先用自身日期", () => {
    const rows = buildGanttRows([
      makeTask({ id: 1, text: "父", startDate: "2026-10-01", endDate: "2026-10-10" }),
      makeTask({ id: 2, text: "子", parent: 1, startDate: "2026-10-03", endDate: "2026-10-05" }),
    ]);
    expect(rows[0]).toMatchObject({ start: "2026-10-01", end: "2026-10-10" });
  });

  it("父有自身日期且子跨度更大时仍用自身日期（不被子跨度覆盖）", () => {
    const rows = buildGanttRows([
      makeTask({ id: 1, text: "父", startDate: "2026-10-01", endDate: "2026-10-10" }),
      makeTask({ id: 2, text: "子", parent: 1, startDate: "2026-10-03", endDate: "2026-10-15" }),
    ]);
    expect(rows[0]).toMatchObject({ start: "2026-10-01", end: "2026-10-10" });
    expect(rows[1]).toMatchObject({ start: "2026-10-03", end: "2026-10-15" });
  });

  it("父无日期时仍取子任务跨度汇总", () => {
    const rows = buildGanttRows([
      makeTask({ id: 1, text: "父", startDate: null, endDate: null }),
      makeTask({ id: 2, text: "子", parent: 1, startDate: "2026-10-03", endDate: "2026-10-05" }),
    ]);
    expect(rows[0]).toMatchObject({ start: "2026-10-03", end: "2026-10-05", summary: true });
  });

  it("无日期任务不进图表", () => {
    const tasks = [makeTask({ id: 9, startDate: null, endDate: null })];
    expect(buildGanttRows(tasks)).toHaveLength(0);
    expect(findUnscheduledTasks(tasks)).toHaveLength(1);
  });

  it("父引用成环不死循环", () => {
    const rows = buildGanttRows([
      makeTask({ id: 1, parent: 2, startDate: "2026-10-01", endDate: "2026-10-02" }),
      makeTask({ id: 2, parent: 1, startDate: "2026-10-01", endDate: "2026-10-02" }),
    ]);
    // 互为父子时都不是对方的根子节点，但不应挂起；至少不抛异常
    expect(Array.isArray(rows)).toBe(true);
  });
});

describe("isProgressLocked（后端 Task.isProgressLocked() 口径）", () => {
  it("COMPLETED/CANCELLED 锁定进度，其它状态与空值不锁定", () => {
    expect(isProgressLocked("COMPLETED")).toBe(true);
    expect(isProgressLocked("CANCELLED")).toBe(true);
    expect(isProgressLocked("IN_PROGRESS")).toBe(false);
    expect(isProgressLocked("TODO")).toBe(false);
    expect(isProgressLocked(null)).toBe(false);
    expect(isProgressLocked(undefined)).toBe(false);
  });
});

describe("日期几何", () => {
  it("dayNumber/isoFromDay 往返", () => {
    expect(isoFromDay(dayNumber("2026-10-05"))).toBe("2026-10-05");
    expect(dayNumber("2026-10-06") - dayNumber("2026-10-05")).toBe(1);
  });

  it("isValidDateOnly 拒绝不存在的日期", () => {
    expect(isValidDateOnly("2026-02-30")).toBe(false);
    expect(isValidDateOnly("2026-13-01")).toBe(false);
    expect(isValidDateOnly("2026-10-05")).toBe(true);
    expect(isValidDateOnly("")).toBe(false);
    expect(isValidDateOnly(null)).toBe(false);
  });

  it("ticksFor 周刻度步长 7 天；月刻度按月推进", () => {
    const origin = dayNumber("2026-10-01");
    const weekTicks = ticksFor(origin, origin + 20, "week");
    expect(weekTicks).toEqual([origin, origin + 7, origin + 14]);
    const monthTicks = ticksFor(origin, origin + 70, "month");
    expect(monthTicks.length).toBeGreaterThanOrEqual(2);
    expect(tickLabel(monthTicks[0], "month")).toBe("2026/10");
    expect(tickLabel(origin, "week")).toBe("10/1");
  });

  it("weekendDays 只含周六日", () => {
    // 2026-10-05 是周一（与实现无关，用 UTC 口径断言）
    const days = weekendDays(dayNumber("2026-10-05"), dayNumber("2026-10-11"));
    expect(days).toHaveLength(2);
    for (const day of days) {
      const weekday = new Date(day * 86_400_000).getUTCDay();
      expect([0, 6]).toContain(weekday);
    }
  });

  it("chartWidth 有最小宽度", () => {
    expect(chartWidth(1, "week")).toBe(720);
    expect(chartWidth(100, "day")).toBe(2800);
  });

  it("xPercent 线性映射", () => {
    expect(xPercent(10, 10, 20)).toBe(0);
    expect(xPercent(30, 10, 20)).toBe(100);
    expect(xPercent(20, 10, 20)).toBe(50);
  });
});

describe("buildBatchUpdateItems", () => {
  const originals = new Map([
    [1, makeTask({ id: 1, startDate: "2026-10-01", endDate: "2026-10-05", progress: 20 })],
    [2, makeTask({ id: 2, readonly: true, startDate: "2026-10-01", endDate: "2026-10-05", progress: 20 })],
  ]);

  it("只输出变化字段，wire 名 snake_case", () => {
    const items = buildBatchUpdateItems(
      { 1: { startDate: "2026-10-02", endDate: "2026-10-06", progress: 20 } },
      originals,
    );
    expect(items).toEqual([
      { id: 1, start_date: "2026-10-02", end_date: "2026-10-06" },
    ]);
    // 进度未变化 → 不带 progress 键
    expect(items[0]).not.toHaveProperty("progress");
  });

  it("无变化的任务不进数组；只读任务跳过", () => {
    expect(buildBatchUpdateItems({ 1: { progress: 20 } }, originals)).toEqual([]);
    expect(
      buildBatchUpdateItems({ 2: { startDate: "2026-10-09" } }, originals),
    ).toEqual([]);
    expect(buildBatchUpdateItems({ 999: { progress: 10 } }, originals)).toEqual([]);
  });

  it("进度钳制 0–100；起止反转自动交换", () => {
    const items = buildBatchUpdateItems(
      { 1: { startDate: "2026-10-08", endDate: "2026-10-03", progress: 120 } },
      originals,
    );
    expect(items).toEqual([
      { id: 1, start_date: "2026-10-03", end_date: "2026-10-08", progress: 100 },
    ]);
  });

  it("绝不发送 text/status 字段", () => {
    const items = buildBatchUpdateItems({ 1: { progress: 80 } }, originals);
    expect(items[0]).not.toHaveProperty("text");
    expect(items[0]).not.toHaveProperty("status");
  });
});

describe("partitionConfirmedBatches（r26-2 按批确认 / r27-1 值确认）", () => {
  const batch = (
    taskId: number,
    startDate: string,
    extra: Partial<CommittedBatch> = {},
  ): CommittedBatch => ({
    version: 100,
    items: [{ id: taskId, start_date: startDate }],
    snapshot: { [taskId]: { startDate } },
    ...extra,
  });
  // 权威数据：任务 1 已落到 2026-10-11（A 批的写入），任务 2 仍是旧值
  const authoritative = (overrides: Record<number, Partial<GanttTask>> = {}) => {
    const map = new Map<number, GanttTask>();
    map.set(1, makeTask({ id: 1, startDate: "2026-10-11", endDate: "2026-10-15" }));
    map.set(2, makeTask({ id: 2, startDate: "2026-10-01", endDate: "2026-10-05" }));
    for (const [idKey, patch] of Object.entries(overrides)) {
      const id = Number(idKey);
      const task = map.get(id);
      if (task) map.set(id, { ...task, ...patch });
    }
    return map;
  };

  it("r27-1 回归：过期重取（不含后提交写入）不确认在途批次", () => {
    // A 批（任务 1 → 10-11）已成功；B 批（任务 2 → 10-12）在途；
    // 某次重取返回了 10-11 但不含 B 的写入——只能确认 A，不能动 B。
    const batchA = batch(1, "2026-10-11");
    const batchB = batch(2, "2026-10-12");
    const { confirmed, remaining } = partitionConfirmedBatches(
      [batchA, batchB],
      authoritative(),
    );
    expect(confirmed).toEqual([batchA]);
    expect(remaining).toEqual([batchB]);
  });

  it("权威数据包含写入后才确认（版本计数器不再作为依据）", () => {
    const batchB = batch(2, "2026-10-12");
    // 权威数据尚未包含 B 的写入 → 不确认（旧规则只看版本会误确认）
    expect(
      partitionConfirmedBatches([batchB], authoritative()).confirmed,
    ).toEqual([]);
    // 后续重取包含了 B 的写入 → 确认
    const withB = authoritative({ 2: { startDate: "2026-10-12" } });
    expect(
      partitionConfirmedBatches([batchB], withB).confirmed,
    ).toEqual([batchB]);
  });

  it("空日志返回双空数组", () => {
    expect(partitionConfirmedBatches([], authoritative())).toEqual({
      confirmed: [],
      remaining: [],
    });
  });
});

describe("r28 草稿/提交回归", () => {
  it("新读取释放被 D2 覆盖的 A，后续只改右缘不会回写 D1；过期读取不释放 B", () => {
    const baseline = { 1: { startDate: "2026-10-01", endDate: "2026-10-05" } };
    const batchA: CommittedBatch = {
      version: 10, baseline,
      items: [{ id: 1, start_date: "2026-10-02", end_date: "2026-10-06" }],
      snapshot: { 1: { startDate: "2026-10-02", endDate: "2026-10-06" } },
    };
    const d2 = new Map([[1, makeTask({ startDate: "2026-10-03", endDate: "2026-10-07" })]]);
    // 开始于 A 成功前的响应，即使字段变了也不构成覆盖确认。
    expect(partitionConfirmedBatches([batchA], d2, 9).remaining).toEqual([batchA]);
    // 新读取仍是 D0，也不能证明发送字段已推进。
    expect(partitionConfirmedBatches([batchA], new Map([[1, makeTask()]]), 11).remaining).toEqual([batchA]);
    const { confirmed, remaining } = partitionConfirmedBatches([batchA], d2, 11);
    expect(confirmed).toEqual([batchA]);
    // 面板只改 start：end 回到提交前值，仍应服从本次新读取的权威结果。
    const panelD2 = new Map([[1, makeTask({ startDate: "2026-10-03" })]]);
    expect(partitionConfirmedBatches([batchA], panelD2, 11).confirmed).toEqual([batchA]);
    const draft = { ...batchA.snapshot };
    for (const batch of confirmed) {
      for (const [id, change] of Object.entries(batch.snapshot)) {
        if (isSameTaskDraft(draft[Number(id)], change)) delete draft[Number(id)];
      }
    }
    const log = pruneDeadBatches(remaining, draft);
    expect(draft).toEqual({});
    expect(log).toEqual([]);
    expect(buildBatchUpdateItems({ 1: { endDate: "2026-10-08" } }, overlayCommittedBaseline(d2, {}))).toEqual([
      { id: 1, start_date: "2026-10-03", end_date: "2026-10-08" },
    ]);
    const batchB: CommittedBatch = { ...batchA, version: 12, snapshot: { 1: { startDate: "2026-10-04" } }, items: [{ id: 1, start_date: "2026-10-04" }] };
    // 读取于 B 成功前发起，且值不同于 B 基线：仍然不可释放 B（r27-1）。
    expect(partitionConfirmedBatches([batchB], d2, 11).remaining).toEqual([batchB]);
  });

  it("中断拖动/提交失败删除无支撑字段，保留成功值；下一次提交不静默重放", () => {
    const saved: CommittedBatch = {
      version: 10, items: [{ id: 1, progress: 80 }], snapshot: { 1: { progress: 80 } },
    };
    const interrupted = { 1: { startDate: "2026-10-03", endDate: "2026-10-07", progress: 80 } };
    const dates = [{ id: 1, start_date: "2026-10-03", end_date: "2026-10-07" }];
    // 取消与失败共用回滚：日期条目是本次新建，成功进度仍需覆盖旧缓存。
    const canceled = restoreDraftAfterFailure(interrupted, interrupted, dates, [saved]);
    expect(canceled).toEqual(saved.snapshot);
    expect(restoreDraftAfterFailure(interrupted, interrupted, dates, [])).toEqual({ 1: { progress: 80 } });
    const failed = { 1: { startDate: "2026-10-03", endDate: "2026-10-07" } };
    expect(restoreDraftAfterFailure(failed, failed, dates, [])).toEqual({});
    const originals = new Map([[1, makeTask()], [2, makeTask({ id: 2 })]]);
    const nextDraft = { ...restoreDraftAfterFailure(failed, failed, dates, []), 2: { progress: 90 } };
    expect(buildBatchUpdateItems(nextDraft, originals)).toEqual([{ id: 2, progress: 90 }]);
    const committedBaseline = overlayCommittedBaseline(originals, saved.snapshot);
    expect(buildBatchUpdateItems({ ...canceled, 2: { progress: 90 } }, committedBaseline)).toEqual([{ id: 2, progress: 90 }]);
  });
});

describe("batchValuesConfirmed（r27-1：值确认）", () => {
  const batchOf = (items: CommittedBatch["items"]): CommittedBatch => ({
    version: 100,
    items,
    snapshot: {},
  });
  const authoritative = () => {
    const map = new Map<number, GanttTask>();
    map.set(1, makeTask({ id: 1, startDate: "2026-10-11", endDate: "2026-10-15", progress: 60 }));
    return map;
  };

  it("全部发送字段落地才算确认", () => {
    expect(
      batchValuesConfirmed(
        batchOf([{ id: 1, start_date: "2026-10-11", progress: 60 }]),
        authoritative(),
      ),
    ).toBe(true);
    expect(
      batchValuesConfirmed(
        batchOf([{ id: 1, start_date: "2026-10-11", progress: 61 }]),
        authoritative(),
      ),
    ).toBe(false);
    expect(
      batchValuesConfirmed(
        batchOf([{ id: 1, end_date: "2026-10-16" }]),
        authoritative(),
      ),
    ).toBe(false);
  });

  it("权威数据中已不存在的任务视为确认（无可遮蔽内容）", () => {
    expect(
      batchValuesConfirmed(
        batchOf([{ id: 999, start_date: "2026-10-11" }]),
        authoritative(),
      ),
    ).toBe(true);
  });

  it("多任务批次需全部落地", () => {
    const map = authoritative();
    map.set(2, makeTask({ id: 2, startDate: "2026-10-12", endDate: "2026-10-16", progress: 0 }));
    expect(
      batchValuesConfirmed(
        batchOf([
          { id: 1, start_date: "2026-10-11" },
          { id: 2, start_date: "2026-10-12" },
        ]),
        map,
      ),
    ).toBe(true);
    expect(
      batchValuesConfirmed(
        batchOf([
          { id: 1, start_date: "2026-10-11" },
          { id: 2, start_date: "2026-10-13" },
        ]),
        map,
      ),
    ).toBe(false);
  });
});

describe("pruneDeadBatches（r27-1：死批次裁剪）", () => {
  const batchOf = (snapshot: Record<number, TaskDraft>): CommittedBatch => ({
    version: 100,
    items: [],
    snapshot,
  });

  it("快照条目全部被覆盖/消失的批次被裁掉", () => {
    const dead = batchOf({ 1: { startDate: "2026-10-11" } });
    const live = batchOf({ 2: { startDate: "2026-10-12" } });
    const draft: Record<number, TaskDraft> = {
      1: { startDate: "2026-10-13" }, // 被更新的拖拽覆盖
      2: { startDate: "2026-10-12" }, // 仍等于快照
    };
    expect(pruneDeadBatches([dead, live], draft)).toEqual([live]);
  });

  it("空快照的批次被裁掉（无可释放条目）", () => {
    expect(pruneDeadBatches([batchOf({})], { 1: { progress: 10 } })).toEqual([]);
  });
});

describe("dropUnsupportedDraftEntries（r27-2：无差量污染清理）", () => {
  const originals = () => {
    const map = new Map<number, GanttTask>();
    map.set(1, makeTask({ id: 1, startDate: "2026-10-01", endDate: "2026-10-05" }));
    return map;
  };
  const logOf = (snapshot: Record<number, TaskDraft>): CommittedBatch[] => [
    { version: 100, items: [{ id: 2, progress: 80 }], snapshot },
  ];

  it("删除无日志支撑的同值条目，保留已提交未释放的值", () => {
    const draft: Record<number, TaskDraft> = {
      // 任务 1：原地单击留下的同值污染（无日志支撑）→ 删除
      1: { startDate: "2026-10-01", endDate: "2026-10-05" },
      // 任务 2：已提交未释放（在日志快照中）→ 保留
      2: { progress: 80 },
    };
    const cleaned = dropUnsupportedDraftEntries(
      draft,
      logOf({ 2: { progress: 80 } }),
      originals(),
    );
    expect(cleaned).toEqual({ 2: { progress: 80 } });
    // 返回新对象，原对象不动
    expect(draft[1]).toBeDefined();
  });

  it("无可清理条目时返回原对象（引用不变）", () => {
    const draft: Record<number, TaskDraft> = { 2: { progress: 80 } };
    expect(
      dropUnsupportedDraftEntries(draft, logOf({ 2: { progress: 80 } }), originals()),
    ).toBe(draft);
  });

  it("有差量但暂无日志支撑的条目不删除（防御）", () => {
    const draft: Record<number, TaskDraft> = {
      1: { startDate: "2026-10-03", endDate: "2026-10-05" },
    };
    expect(dropUnsupportedDraftEntries(draft, [], originals())).toBe(draft);
  });
});

describe("restoreDraftAfterFailure（r28：失败字段回滚）", () => {
  const failedItems = [{ id: 2, start_date: "2026-10-12" }];
  it("r27-3 回归：在途期间已释放的条目不被复活", () => {
    const snapshot = { 1: { startDate: "2026-10-11" }, 2: { startDate: "2026-10-12" } };
    const restored = restoreDraftAfterFailure(snapshot, { 2: snapshot[2] }, failedItems, []);
    expect(restored).toEqual({});
  });

  it("失败批次自身缺失的条目不补回", () => {
    expect(restoreDraftAfterFailure({ 2: { startDate: "2026-10-12" } }, {}, failedItems, [])).toEqual({});
  });

  it("提交后新增的条目与同任务新字段值保留", () => {
    const snapshot = { 2: { startDate: "2026-10-12" } };
    const currentDraft = { 2: { startDate: "2026-10-13" }, 3: { progress: 90 } };
    expect(restoreDraftAfterFailure(snapshot, currentDraft, failedItems, [])).toEqual(currentDraft);
  });

  it("未释放的成功条目保留，失败任务恢复剩余成功快照", () => {
    const snapshot = { 1: { startDate: "2026-10-11" }, 2: { startDate: "2026-10-12", progress: 80 } };
    const log: CommittedBatch[] = [{
      version: 100, items: [{ id: 2, start_date: "2026-10-10" }],
      snapshot: { 2: { startDate: "2026-10-10" } },
    }];
    expect(restoreDraftAfterFailure(snapshot, snapshot, failedItems, log)).toEqual({
      1: snapshot[1], 2: { startDate: "2026-10-10", progress: 80 },
    });
  });
});

describe("isSameTaskDraft（r26-2：释放时相等判定）", () => {
  it("三字段全等才算相同", () => {
    expect(
      isSameTaskDraft(
        { startDate: "2026-10-03", endDate: "2026-10-07", progress: 50 },
        { startDate: "2026-10-03", endDate: "2026-10-07", progress: 50 },
      ),
    ).toBe(true);
    expect(
      isSameTaskDraft(
        { startDate: "2026-10-03" },
        { startDate: "2026-10-04" },
      ),
    ).toBe(false);
    // 缺字段 vs undefined 视为相同（都是"未设置"）
    expect(isSameTaskDraft({}, { progress: undefined })).toBe(true);
    expect(isSameTaskDraft({ progress: 50 }, {})).toBe(false);
  });
});

describe("createKeyedSerialQueue", () => {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it("同键任务按提交顺序串行执行", async () => {
    const queue = createKeyedSerialQueue();
    const order: number[] = [];
    const job = (n: number, ms: number) =>
      queue.run(1, async () => {
        await sleep(ms);
        order.push(n);
        return n;
      });
    const results = await Promise.all([job(1, 30), job(2, 10), job(3, 0)]);
    expect(order).toEqual([1, 2, 3]);
    expect(results).toEqual([1, 2, 3]);
    expect(queue.pending()).toBe(0);
  });

  it("不同键互不等待", async () => {
    const queue = createKeyedSerialQueue();
    const started: number[] = [];
    const p1 = queue.run(1, async () => {
      started.push(1);
      await sleep(30);
    });
    const p2 = queue.run(2, async () => {
      started.push(2);
    });
    expect(queue.pending()).toBe(2);
    await Promise.all([p1, p2]);
    expect(started).toEqual([1, 2]);
    expect(queue.pending()).toBe(0);
  });

  it("前一个失败不阻塞后继", async () => {
    const queue = createKeyedSerialQueue();
    const order: string[] = [];
    const failing = queue
      .run(1, async () => {
        order.push("fail-start");
        throw new Error("boom");
      })
      .catch(() => {
        order.push("fail-caught");
      });
    const ok = queue.run(1, async () => {
      order.push("ok");
    });
    await Promise.all([failing, ok]);
    expect(order).toEqual(["fail-start", "fail-caught", "ok"]);
  });
});

describe("里程碑日期转换", () => {
  it("dateOnlyToInstant 补零时", () => {
    expect(dateOnlyToInstant("2026-10-05")).toBe("2026-10-05T00:00:00Z");
  });

  it("instantToDateOnly 取日期部分；非法归空", () => {
    expect(instantToDateOnly("2026-10-05T00:00:00Z")).toBe("2026-10-05");
    expect(instantToDateOnly("2026-10-05")).toBe("2026-10-05");
    expect(instantToDateOnly(null)).toBe("");
    expect(instantToDateOnly("not-a-date")).toBe("");
  });

  it("状态标签", () => {
    expect(milestoneStatusLabel("not_started")).toBe("未开始");
    expect(milestoneStatusLabel("completed")).toBe("已完成");
    expect(milestoneStatusLabel("unknown")).toBe("unknown");
  });
});

describe("validateMilestoneForm", () => {
  it("合法表单无错误", () => {
    expect(
      validateMilestoneForm({
        name: "M1",
        status: "in_progress",
        startDate: "2026-10-01",
        endDate: "2026-10-10",
      }),
    ).toEqual([]);
  });

  it("收集全部错误，不首错即停", () => {
    const errors = validateMilestoneForm({
      name: "  ",
      status: "bogus",
      startDate: "2026-10-10",
      endDate: "2026-10-01",
    });
    const fields = errors.map((error) => error.field).sort();
    expect(fields).toEqual(["endDate", "name", "status"]);
    expect(errors.find((error) => error.field === "name")?.message).toContain("不能为空");
  });

  it("日期可选：空日期不报错", () => {
    expect(
      validateMilestoneForm({ name: "M", status: "not_started", startDate: "", endDate: "" }),
    ).toEqual([]);
  });

  it("非法日期格式按字段报错", () => {
    const errors = validateMilestoneForm({
      name: "M",
      status: "not_started",
      startDate: "2026-02-30",
      endDate: "",
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe("startDate");
  });
});

describe("diffMilestoneFields", () => {
  const initial = {
    name: "M1",
    status: "not_started",
    startDate: "2026-10-01",
    endDate: "2026-10-10",
  };

  it("无变化返回 null（调用方不发请求）", () => {
    expect(diffMilestoneFields(7, { ...initial }, initial)).toBeNull();
    // 名称首尾空格差异视为无变化
    expect(
      diffMilestoneFields(7, { ...initial, name: "  M1  " }, initial),
    ).toBeNull();
  });

  it("只返回变化字段；日期转 Instant", () => {
    expect(
      diffMilestoneFields(7, { ...initial, name: "M1 改", status: "in_progress" }, initial),
    ).toEqual({ id: 7, name: "M1 改", status: "in_progress" });
    expect(
      diffMilestoneFields(7, { ...initial, startDate: "2026-10-03" }, initial),
    ).toEqual({ id: 7, startDate: "2026-10-03T00:00:00Z" });
  });

  it("日期清空用显式 null（字段出现即提交）", () => {
    expect(
      diffMilestoneFields(7, { ...initial, endDate: "" }, initial),
    ).toEqual({ id: 7, endDate: null });
  });

  it("绝不带 xxxSubmitted 字段", () => {
    const diff = diffMilestoneFields(7, { ...initial, name: "X" }, initial);
    expect(Object.keys(diff ?? {}).some((key) => key.endsWith("Submitted"))).toBe(false);
  });
});

describe("milestoneToFormValues / sortMilestones", () => {
  it("Instant 转表单日期", () => {
    expect(
      milestoneToFormValues({
        name: "M",
        status: "completed",
        startDate: "2026-10-01T00:00:00Z",
        endDate: null,
      }),
    ).toEqual({ name: "M", status: "completed", startDate: "2026-10-01", endDate: "" });
  });

  it("按结束日期排序，无日期沉底", () => {
    const sorted = sortMilestones([
      { startDate: null, endDate: null },
      { startDate: null, endDate: "2026-10-10T00:00:00Z" },
      { startDate: "2026-09-01T00:00:00Z", endDate: null },
    ]);
    // 排序键：结束日期优先，无结束日期用开始日期，全无沉底
    expect(
      sorted.map((item) => item.endDate ?? item.startDate ?? null),
    ).toEqual(["2026-09-01T00:00:00Z", "2026-10-10T00:00:00Z", null]);
  });
});

describe("r25-1 overlayCommittedBaseline", () => {
  it("已提交值叠加到权威基线：窗口内 diff 按已提交值判定", () => {
    const originals = new Map<number, GanttTask>([
      [1, makeTask({ id: 1, startDate: "2026-10-01", endDate: "2026-10-05" })],
    ]);
    const baseline = overlayCommittedBaseline(originals, {
      1: { startDate: "2026-10-02", endDate: "2026-10-06" },
    });
    const task = baseline.get(1);
    expect(task?.startDate).toBe("2026-10-02");
    expect(task?.endDate).toBe("2026-10-06");
    // 原 Map 不被改动
    expect(originals.get(1)?.startDate).toBe("2026-10-01");
  });

  it("无已提交值时直接返回原 Map（同一引用）", () => {
    const originals = new Map<number, GanttTask>([[1, makeTask({ id: 1 })]]);
    expect(overlayCommittedBaseline(originals, {})).toBe(originals);
  });

  it("未知任务 id 的已提交值被忽略", () => {
    const originals = new Map<number, GanttTask>([[1, makeTask({ id: 1 })]]);
    const baseline = overlayCommittedBaseline(originals, { 999: { progress: 80 } });
    expect(baseline.has(999)).toBe(false);
    expect(baseline.get(1)?.progress).toBe(50);
  });
});

describe("r25-3 clampBarWidth", () => {
  it("正常条宽不受影响", () => {
    expect(clampBarWidth(10, 20)).toBe(10);
  });

  it("过窄条宽拉到最小 1.5%", () => {
    expect(clampBarWidth(0.5, 50)).toBe(1.5);
  });

  it("末端任务右端不超过 100%（100 天范围末日单日任务）", () => {
    // 起点 99%、自然宽度 1%：旧逻辑得 1.5% → 右端 100.5% 越界
    const width = clampBarWidth(1, 99);
    expect(width).toBe(1);
    expect(99 + width).toBeLessThanOrEqual(100);
  });

  it("极端贴边时宽度可被压缩到接近 0 也不越界", () => {
    const width = clampBarWidth(1.5, 99.9);
    expect(99.9 + width).toBeLessThanOrEqual(100);
    expect(width).toBeGreaterThanOrEqual(0);
  });
});

describe("r25-4 closeSelectedIfCurrent", () => {
  it("当前选中的就是保存任务 → 关闭", () => {
    expect(closeSelectedIfCurrent(7, 7)).toBeNull();
  });

  it("已选中新任务 → 保留新面板", () => {
    expect(closeSelectedIfCurrent(9, 7)).toBe(9);
  });

  it("当前无选中 → 保持 null", () => {
    expect(closeSelectedIfCurrent(null, 7)).toBeNull();
  });
});
