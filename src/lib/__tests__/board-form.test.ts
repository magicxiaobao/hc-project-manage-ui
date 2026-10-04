/**
 * 看板表单纯函数回归测试（P3：p3-board-manage）。
 *
 * 覆盖：必填校验（空名拒绝）、长度上限、类型选项约束、
 * 新建/更新载荷构造（可选字段省略口径、id 必传）。
 */
import { describe, expect, it } from "vitest";
import {
  BOARD_TYPES,
  buildBoardCreatePayload,
  buildBoardUpdatePayload,
  editFormFromBoard,
  emptyBoardFormInput,
  isBoardFormDirty,
  validateBoardFormInput,
} from "../board-form";
import type { BoardResponse } from "../api/board-types";

describe("validateBoardFormInput", () => {
  it("空看板名称被拒绝", () => {
    const errors = validateBoardFormInput({ ...emptyBoardFormInput(), boardName: "   " });
    expect(errors.some((e) => e.field === "boardName")).toBe(true);
  });

  it("收集全部错误不首错即停", () => {
    const errors = validateBoardFormInput({
      boardName: "",
      description: "x".repeat(501),
      boardType: "不存在的类型",
      isDefault: false,
    });
    expect(errors.map((e) => e.field).sort()).toEqual(["boardName", "boardType", "description"]);
  });

  it("合法输入零错误", () => {
    const errors = validateBoardFormInput({
      boardName: "Sprint 12 看板",
      description: "交付跟踪",
      boardType: BOARD_TYPES[0],
      isDefault: true,
    });
    expect(errors).toEqual([]);
  });
});

describe("buildBoardCreatePayload", () => {
  it("可选字段为空时省略（后端走默认值）", () => {
    const payload = buildBoardCreatePayload(emptyBoardFormInput(), 7);
    expect(payload).toEqual({ boardName: "", projectId: 7 });
    expect("description" in payload).toBe(false);
    expect("boardType" in payload).toBe(false);
    expect("isDefault" in payload).toBe(false);
  });

  it("名称 trim，isDefault=true 才发送", () => {
    const payload = buildBoardCreatePayload(
      { boardName: "  看板A  ", description: "", boardType: "", isDefault: true },
      7,
    );
    expect(payload.boardName).toBe("看板A");
    expect(payload.isDefault).toBe(true);
  });
});

describe("buildBoardUpdatePayload", () => {
  it("id 必传且为字段级更新", () => {
    const payload = buildBoardUpdatePayload(
      { boardName: "新名", description: "d", boardType: "", isDefault: false },
      42,
    );
    expect(payload.id).toBe(42);
    expect(payload.boardName).toBe("新名");
  });
});

describe("editFormFromBoard / isBoardFormDirty", () => {
  const detail = {
    id: 1,
    boardName: "旧看板",
    description: null,
    boardType: "Scrum看板",
    projectId: 7,
    isDefault: true,
    createdAt: null,
    updatedAt: null,
  } as BoardResponse;

  it("回填 null → 空字符串", () => {
    const form = editFormFromBoard(detail);
    expect(form).toEqual({
      boardName: "旧看板",
      description: "",
      boardType: "Scrum看板",
      isDefault: true,
    });
  });

  it("未改动不脏，改动即脏", () => {
    const form = editFormFromBoard(detail);
    expect(isBoardFormDirty(form, form)).toBe(false);
    expect(isBoardFormDirty({ ...form, boardName: "新" }, form)).toBe(true);
  });
});
