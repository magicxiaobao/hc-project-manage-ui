/**
 * 任务看板纯逻辑回归测试（P3：p3-board-kanban）。
 *
 * 覆盖：columnsWithTasks 解析（后端 BoardColumnServiceImpl 拼装口径）；
 * 卡片跨列移动的纯变换（乐观更新用；同列不动作；缺失卡片/列无动作）；
 * 流转文本需求判定（后端 TaskWorkflowService.dispatch 的 requireText 口径）；
 * 流转上下文构造（COMPLETED→deliverables，其余→reason）。
 */
import { describe, expect, it } from "vitest";
import {
  buildCardTransitionContext,
  cardTransitionNeedsText,
  confirmAuthoritativeRefresh,
  decideBoardUnlock,
  moveCardInColumns,
  parseBoardColumnsWithTasks,
  restoreColumnOrder,
  transitionTextMaxLength,
  validateTransitionText,
  type KanbanBoardColumn,
} from "../board-kanban";

function makeColumn(
  id: number,
  taskStatus: KanbanBoardColumn["taskStatus"],
  taskIds: number[],
): KanbanBoardColumn {
  return {
    id,
    columnName: `列${id}`,
    type: null,
    color: null,
    wipLimit: null,
    taskStatus,
    sortOrder: id,
    tasks: taskIds.map((taskId) => ({
      id: taskId,
      title: `任务${taskId}`,
      description: null,
      priority: null,
      storyPoints: null,
      status: taskStatus ?? "TODO",
      estimatedEndDate: null,
      assigneeId: null,
    })),
  };
}

describe("parseBoardColumnsWithTasks", () => {
  it("按后端拼装口径映射列字段与卡片字段", () => {
    const columns = parseBoardColumnsWithTasks([
      {
        id: 11,
        columnName: "待开发",
        type: "normal",
        color: "#3B82F6",
        wipLimit: 5,
        taskStatus: "TODO",
        sortOrder: 1,
        tasks: [
          {
            id: 101,
            title: "登录页",
            description: "desc",
            priority: "HIGH",
            storyPoints: 3,
            status: "TODO",
            estimatedEndDate: "2026-10-10",
            assigneeId: 7,
          },
        ],
      },
    ]);
    expect(columns).toHaveLength(1);
    const column = columns[0];
    expect(column.id).toBe(11);
    expect(column.columnName).toBe("待开发");
    expect(column.color).toBe("#3B82F6");
    expect(column.wipLimit).toBe(5);
    expect(column.taskStatus).toBe("TODO");
    expect(column.tasks).toHaveLength(1);
    expect(column.tasks[0]).toMatchObject({
      id: 101,
      title: "登录页",
      status: "TODO",
      assigneeId: 7,
    });
  });

  it("丢弃缺 id 的列与缺 id/status 的卡片，保留其余", () => {
    const columns = parseBoardColumnsWithTasks([
      { columnName: "无 id 列" },
      {
        id: 12,
        columnName: "开发中",
        taskStatus: "IN_PROGRESS",
        tasks: [
          { id: 201, title: "好卡", status: "IN_PROGRESS" },
          { title: "缺 id", status: "IN_PROGRESS" },
          { id: 202, title: "缺 status" },
          null,
        ],
      },
    ]);
    expect(columns).toHaveLength(1);
    expect(columns[0].tasks.map((task) => task.id)).toEqual([201]);
  });

  it("无 taskStatus 的列 tasks 解析为空（后端即返回空数组）", () => {
    const columns = parseBoardColumnsWithTasks([
      { id: 13, columnName: "归档", taskStatus: null },
    ]);
    expect(columns[0].taskStatus).toBeNull();
    expect(columns[0].tasks).toEqual([]);
  });
});

describe("moveCardInColumns", () => {
  it("跨列移动：源列移除、目标列末尾追加，不改卡片 status", () => {
    const columns = [makeColumn(1, "TODO", [101, 102]), makeColumn(2, "IN_PROGRESS", [201])];
    const next = moveCardInColumns(columns, 101, 1, 2);
    expect(next[0].tasks.map((task) => task.id)).toEqual([102]);
    expect(next[1].tasks.map((task) => task.id)).toEqual([201, 101]);
    // 乐观更新不写 status：status 由后端 updateStatus 成功后的 refetch 更新
    expect(next[1].tasks[1].status).toBe("TODO");
    // 原数组不受影响（不可变更新）
    expect(columns[0].tasks.map((task) => task.id)).toEqual([101, 102]);
  });

  it("同列移动返回原数组（后端无列内排序语义，调用方不发请求）", () => {
    const columns = [makeColumn(1, "TODO", [101, 102])];
    expect(moveCardInColumns(columns, 101, 1, 1)).toBe(columns);
  });

  it("卡片或目标列不存在时返回原数组（无动作）", () => {
    const columns = [makeColumn(1, "TODO", [101])];
    expect(moveCardInColumns(columns, 999, 1, 1)).toBe(columns);
    expect(moveCardInColumns(columns, 101, 1, 999)).toBe(columns);
    // 源列 id 不存在：不按 cardId 猜源列，直接无动作
    expect(moveCardInColumns(columns, 101, 999, 1)).toBe(columns);
  });

  it("r8 R6：同状态多列下同一卡片 id 重复——从实际源列移除，不动其它列", () => {
    // 两列同映射 TODO，后端按状态聚合使任务 101 同时出现在两列
    const columns = [
      makeColumn(1, "TODO", [101]),
      makeColumn(2, "TODO", [101]),
      makeColumn(3, "IN_PROGRESS", []),
    ];
    const next = moveCardInColumns(columns, 101, 2, 3);
    // 第二列的 101 被移除，第一列的 101 保留
    expect(next[0].tasks.map((task) => task.id)).toEqual([101]);
    expect(next[1].tasks.map((task) => task.id)).toEqual([]);
    expect(next[2].tasks.map((task) => task.id)).toEqual([101]);
  });
});

describe("cardTransitionNeedsText", () => {
  it("暂停/取消/完成目标需要流转文本（后端 requireText）", () => {
    expect(cardTransitionNeedsText("IN_PROGRESS", "PAUSED")).toBe(true);
    expect(cardTransitionNeedsText("IN_PROGRESS", "CANCELLED")).toBe(true);
    expect(cardTransitionNeedsText("IN_PROGRESS", "COMPLETED")).toBe(true);
  });

  it("COMPLETED→IN_PROGRESS 重新打开需要原因", () => {
    expect(cardTransitionNeedsText("COMPLETED", "IN_PROGRESS")).toBe(true);
  });

  it("开始/恢复等不需要流转文本", () => {
    expect(cardTransitionNeedsText("TODO", "IN_PROGRESS")).toBe(false);
    expect(cardTransitionNeedsText("PAUSED", "IN_PROGRESS")).toBe(false);
    expect(cardTransitionNeedsText("TODO", "CANCELLED")).toBe(true);
  });
});

describe("buildCardTransitionContext", () => {
  it("完成目标填 deliverables", () => {
    expect(buildCardTransitionContext("COMPLETED", " 已上线 ")).toEqual({
      deliverables: "已上线",
    });
  });

  it("暂停/取消/重开填 reason", () => {
    expect(buildCardTransitionContext("PAUSED", " 需求变更 ")).toEqual({
      reason: "需求变更",
    });
    expect(buildCardTransitionContext("CANCELLED", "x")).toEqual({ reason: "x" });
  });
});

describe("validateTransitionText", () => {
  it("空白文本被拒绝", () => {
    expect(validateTransitionText("   ", 500)).not.toBeNull();
  });

  it("非空文本通过", () => {
    expect(validateTransitionText("原因", 500)).toBeNull();
  });

  it("pi r7 F4：按目标状态区分上限——reason 500 / deliverables 1000", () => {
    expect(transitionTextMaxLength("PAUSED")).toBe(500);
    expect(transitionTextMaxLength("CANCELLED")).toBe(500);
    expect(transitionTextMaxLength("COMPLETED")).toBe(1000);
    // 501 字 reason 被拦截（旧逻辑 maxLength=1000 会放行直达后端 400）
    expect(validateTransitionText("原".repeat(501), 500)).not.toBeNull();
    expect(validateTransitionText("原".repeat(500), 500)).toBeNull();
    // deliverables 1000 字通过
    expect(validateTransitionText("交".repeat(1000), 1000)).toBeNull();
    expect(validateTransitionText("交".repeat(1001), 1000)).not.toBeNull();
  });
});

describe("parseBoardColumnsWithTasks 防御", () => {
  it("r7 F8：非数组输入兜底返回空数组（不抛错）", () => {
    expect(parseBoardColumnsWithTasks(null)).toEqual([]);
    expect(parseBoardColumnsWithTasks(undefined)).toEqual([]);
    expect(parseBoardColumnsWithTasks({})).toEqual([]);
    expect(parseBoardColumnsWithTasks("oops")).toEqual([]);
  });
});

describe("confirmAuthoritativeRefresh", () => {
  const base = {
    status: "success" as const,
    dataUpdateCount: 7,
    updateCountBefore: 6,
    seq: 3,
    currentSeq: 3,
  };

  it("r9 P2-4 + r10 P2-3：代次未推进 + success + 成功计数推进 → 确认权威成功", () => {
    expect(confirmAuthoritativeRefresh(base)).toBe(true);
  });

  it("r9 P2-4 ①：刷新开始前的乐观写入不能冒充权威成功（成功计数未推进）", () => {
    // 列排序失败恢复路径：setQueryData(previous) 与刷新开始同 tick，
    // 被取消的 refetch 不产生 success dispatch → 计数不推进 → false
    expect(
      confirmAuthoritativeRefresh({ ...base, dataUpdateCount: 6, updateCountBefore: 6 }),
    ).toBe(false);
  });

  it("r9 P2-4 ①：期间有乐观写入推进代次 → 不计成功", () => {
    expect(confirmAuthoritativeRefresh({ ...base, currentSeq: 4 })).toBe(false);
  });

  it("r9 P2-4：被取代的代次（旧 seq）不计成功", () => {
    expect(confirmAuthoritativeRefresh({ ...base, seq: 2, currentSeq: 3 })).toBe(false);
  });

  it("r9 P2-4：查询非 success 不计成功", () => {
    expect(confirmAuthoritativeRefresh({ ...base, status: "error" })).toBe(false);
    expect(confirmAuthoritativeRefresh({ ...base, status: "pending" })).toBe(false);
  });
});

describe("restoreColumnOrder", () => {
  it("r9 P2-5：只恢复列顺序，各列卡片原样保留（不覆盖并发操作成果）", () => {
    // 快照：列顺序 [1,2]，列 2 含卡片 201（流转前）
    const snapshot = [makeColumn(1, "TODO", []), makeColumn(2, "TODO", [201])];
    // 当前：用户拖拽后顺序 [2,1]；期间卡片 201 已流转成功（权威 GET 落定，
    // 卡片已不在列 2——此处用卡片 202 在列 1 模拟"当前卡片状态更新"）
    const current = [makeColumn(2, "TODO", []), makeColumn(1, "TODO", [202])];
    const restored = restoreColumnOrder(current, snapshot);
    // 顺序回到快照 [1,2]，但卡片取当前值：列 1 含 202、列 2 为空
    expect(restored.map((c) => c.id)).toEqual([1, 2]);
    expect(restored[0].tasks.map((t) => t.id)).toEqual([202]);
    expect(restored[1].tasks.map((t) => t.id)).toEqual([]);
  });

  it("r9 P2-5：快照中没有的新列追加到末尾", () => {
    const snapshot = [makeColumn(1, "TODO", [])];
    const current = [makeColumn(2, "TODO", [201]), makeColumn(1, "TODO", [])];
    const restored = restoreColumnOrder(current, snapshot);
    expect(restored.map((c) => c.id)).toEqual([1, 2]);
  });

  it("r10 P2-4：排序在途被删除的列不复活（快照中的幽灵列被过滤）", () => {
    // 快照：排序前顺序 [1,2]，列 2 含卡片 201
    const snapshot = [makeColumn(1, "TODO", []), makeColumn(2, "TODO", [201])];
    // 当前：列 2 已被删除（DELETE 成功且 GET 已落定），列 1 含卡片 202
    const current = [makeColumn(1, "TODO", [202])];
    const restored = restoreColumnOrder(current, snapshot);
    // 已删除的列 2 不再出现；存活列 1 取当前值（含当前卡片 202，
    // 不复活快照里的旧卡片 201）
    expect(restored.map((c) => c.id)).toEqual([1]);
    expect(restored[0].tasks.map((t) => t.id)).toEqual([202]);
  });
});

describe("decideBoardUnlock（r12 P1-1：暂停→另一入口重试→重连成功）", () => {
  // 时序复刻（代次 S=6，成功计数 C=10）：
  // 1. 卡片流转 POST 成功后 authoritativeBoardRefresh 取号 S=6，GET 离线暂停；
  //    effect 在拉取开始时记录快照 {startSeq:6, countAtStart:10}；paused 后保留；
  // 2. toast 重试入口再次 authoritativeBoardRefresh：代次推到 S+1=7，取消旧的
  //    paused fetch 并起新拉取（仍暂停）；协调器把快照代次同步为 7
  //    （task-board-live.tsx r12 修复点；markOptimisticWrite 的推进不同步）；
  // 3. 重连：GET 真正成功，dataUpdateCount 10→11，status=success；
  //    effect 判定必须为 unlock（→ unlockAwaitingCards：卡片解锁 + 信号递增）。
  function replayFixedTimeline() {
    let currentSeq = 6;
    let snapshot: { startSeq: number; countAtStart: number } | null = {
      startSeq: 6,
      countAtStart: 10,
    };
    // 步骤 2：另一入口重试——代次推进 + 快照代次同步（组件内行为）
    currentSeq = 7;
    if (snapshot != null) snapshot = { ...snapshot, startSeq: currentSeq };
    // 步骤 3：重连成功后的判定
    return decideBoardUnlock({
      isFetching: false,
      fetchStatus: "idle",
      status: "success",
      dataUpdateCount: 11,
      snapshot,
      currentSeq,
    });
  }

  it("快照跟随被取代的拉取：重连成功后解锁（卡片解锁 + 弹窗信号可递增）", () => {
    expect(replayFixedTimeline()).toBe("unlock");
  });

  it("旧行为对照：快照代次停留 S 不跟随 → 拒绝解锁（锁死复现）", () => {
    // 同一时序，但快照代次仍为 6（修复前：effect 仅在快照为 null 时重捕，
    // 重试不更新快照）→ currentSeq(7) !== startSeq(6) → settle，快照被丢弃，
    // awaitingRefresh/refreshSucceededSignal 再无解锁机会
    const decision = decideBoardUnlock({
      isFetching: false,
      fetchStatus: "idle",
      status: "success",
      dataUpdateCount: 11,
      snapshot: { startSeq: 6, countAtStart: 10 },
      currentSeq: 7,
    });
    expect(decision).toBe("settle");
  });

  it("r11 P1-1 不回退：paused 不是完成——保留快照、不解锁", () => {
    // GET 因离线暂停时：isFetching=false、fetchStatus=paused、缓存仍 success、
    // 计数未推进——必须 keep-snapshot，不能误判解锁也不能丢快照
    expect(
      decideBoardUnlock({
        isFetching: false,
        fetchStatus: "paused",
        status: "success",
        dataUpdateCount: 10,
        snapshot: { startSeq: 6, countAtStart: 10 },
        currentSeq: 6,
      }),
    ).toBe("keep-snapshot");
  });

  it("乐观写入守卫不放松：拉取期间有乐观写入推进代次 → 仍拒绝解锁", () => {
    // 重试（快照已跟随到 7）后用户又拖了列 → markOptimisticWrite 把代次推到 8
    // （刻意不同步快照）；重连成功也不能解锁（保守，避免本地写入冒充权威）
    expect(
      decideBoardUnlock({
        isFetching: false,
        fetchStatus: "idle",
        status: "success",
        dataUpdateCount: 11,
        snapshot: { startSeq: 7, countAtStart: 10 },
        currentSeq: 8,
      }),
    ).toBe("settle");
  });

  it("拉取中保留快照继续观察", () => {
    expect(
      decideBoardUnlock({
        isFetching: true,
        fetchStatus: "fetching",
        status: "pending",
        dataUpdateCount: 10,
        snapshot: { startSeq: 7, countAtStart: 10 },
        currentSeq: 7,
      }),
    ).toBe("keep-snapshot");
  });

  it("成功计数未推进（非真实 success dispatch）→ 不解锁", () => {
    expect(
      decideBoardUnlock({
        isFetching: false,
        fetchStatus: "idle",
        status: "success",
        dataUpdateCount: 10,
        snapshot: { startSeq: 7, countAtStart: 10 },
        currentSeq: 7,
      }),
    ).toBe("settle");
  });

  it("查询非 success → 不解锁", () => {
    const base = {
      isFetching: false,
      fetchStatus: "idle" as const,
      dataUpdateCount: 11,
      snapshot: { startSeq: 7, countAtStart: 10 },
      currentSeq: 7,
    };
    expect(decideBoardUnlock({ ...base, status: "error" })).toBe("settle");
    expect(decideBoardUnlock({ ...base, status: "pending" })).toBe("settle");
  });

  it("无快照时不动作", () => {
    expect(
      decideBoardUnlock({
        isFetching: false,
        fetchStatus: "idle",
        status: "success",
        dataUpdateCount: 11,
        snapshot: null,
        currentSeq: 7,
      }),
    ).toBe("settle");
  });
});
