/**
 * 看板列表单纯函数回归测试（P3：p3-board-kanban）。
 *
 * 覆盖：列名称必填与长度上限、描述上限、映射状态枚举约束、
 * WIP 上限非负整数约束、颜色十六进制约束；
 * 新建/更新载荷构造（boardId/id 口径、可选字段省略口径、trim）。
 */
import { describe, expect, it } from "vitest";
import {
  buildBoardColumnCreatePayload,
  buildBoardColumnUpdatePayload,
  editFormFromColumn,
  emptyBoardColumnFormInput,
  validateBoardColumnFormInput,
} from "../board-column-form";

describe("validateBoardColumnFormInput", () => {
  it("空列名称被拒绝", () => {
    const errors = validateBoardColumnFormInput({
      ...emptyBoardColumnFormInput(),
      columnName: "   ",
    });
    expect(errors.some((e) => e.field === "columnName")).toBe(true);
  });

  it("收集全部错误不首错即停", () => {
    const errors = validateBoardColumnFormInput({
      columnName: "",
      description: "x".repeat(501),
      taskStatus: "不存在的状态",
      wipLimit: "-1",
      color: "red",
    });
    expect(errors.map((e) => e.field).sort()).toEqual([
      "color",
      "columnName",
      "description",
      "taskStatus",
      "wipLimit",
    ]);
  });

  it("合法输入零错误（含全部可选字段）", () => {
    const errors = validateBoardColumnFormInput({
      columnName: "待开发",
      description: "需求池",
      taskStatus: "TODO",
      wipLimit: "5",
      color: "#3B82F6",
    });
    expect(errors).toEqual([]);
  });

  it("WIP 上限：0 视为不限制通过；小数与负数拒绝", () => {
    expect(
      validateBoardColumnFormInput({
        ...emptyBoardColumnFormInput(),
        columnName: "列",
        wipLimit: "0",
      }),
    ).toEqual([]);
    const bad = validateBoardColumnFormInput({
      ...emptyBoardColumnFormInput(),
      columnName: "列",
      wipLimit: "2.5",
    });
    expect(bad.some((e) => e.field === "wipLimit")).toBe(true);
  });

  it("列名称超 100 字符被拒绝", () => {
    const errors = validateBoardColumnFormInput({
      ...emptyBoardColumnFormInput(),
      columnName: "列".repeat(101),
    });
    expect(errors.some((e) => e.field === "columnName")).toBe(true);
  });
});

describe("buildBoardColumnCreatePayload", () => {
  it("必填字段 trim 后下发，boardId 由调用方传入", () => {
    const payload = buildBoardColumnCreatePayload(
      { ...emptyBoardColumnFormInput(), columnName: "  待开发  " },
      71,
    );
    expect(payload).toEqual({ boardId: 71, columnName: "待开发" });
  });

  it("可选字段有值才下发；wipLimit 0 视为不限制省略", () => {
    const payload = buildBoardColumnCreatePayload(
      {
        columnName: "开发中",
        description: " 进行中任务 ",
        taskStatus: "IN_PROGRESS",
        wipLimit: "0",
        color: "#22C55E",
      },
      71,
    );
    expect(payload).toEqual({
      boardId: 71,
      columnName: "开发中",
      description: "进行中任务",
      taskStatus: "IN_PROGRESS",
      color: "#22C55E",
    });
    expect("wipLimit" in payload).toBe(false);
  });
});

describe("buildBoardColumnUpdatePayload", () => {
  it("id 必传；boardId 不下发（归属字段更新不改）", () => {
    const payload = buildBoardColumnUpdatePayload(
      { ...emptyBoardColumnFormInput(), columnName: "已完成" },
      51,
    );
    expect(payload.id).toBe(51);
    expect("boardId" in payload).toBe(false);
    expect(payload.columnName).toBe("已完成");
  });
});

describe("editFormFromColumn", () => {
  it("回填后端字段；wipLimit 0/null 回填为空（不限制）", () => {
    expect(
      editFormFromColumn({
        columnName: "列",
        description: "d",
        taskStatus: "TODO",
        wipLimit: 0,
        color: "#000000",
      }),
    ).toMatchObject({ columnName: "列", taskStatus: "TODO", wipLimit: "", color: "#000000" });
  });
});
