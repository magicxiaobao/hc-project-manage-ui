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
  buildBatchUpdateItems,
  buildGanttRows,
  chartWidth,
  createKeyedSerialQueue,
  dateOnlyToInstant,
  dayNumber,
  diffMilestoneFields,
  findUnscheduledTasks,
  instantToDateOnly,
  isValidDateOnly,
  isoFromDay,
  milestoneStatusLabel,
  milestoneToFormValues,
  normalizeCriticalPath,
  normalizeGanttData,
  normalizeTaskDependencies,
  sortMilestones,
  tickLabel,
  ticksFor,
  validateMilestoneForm,
  weekendDays,
  xPercent,
  type GanttTask,
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
