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
  moveCardInColumns,
  parseBoardColumnsWithTasks,
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
