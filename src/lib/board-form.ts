/**
 * 看板表单模型（P3：p3-board-manage 看板列表管理）。
 *
 * 纯函数：表单输入 ↔ API 载荷的转换 + 字段级校验。
 * - boardName 必填（后端 Board 实体要求非空，空名会创建出无名看板）；
 * - 校验收集全部错误，不首错即停；
 * - 看板类型取老前端 BoardTypeSelector 的枚举口径（Scrum看板/Kanban看板/
 *   自定义看板/Bug看板/测试看板），后端为自由字符串，前端只做选项约束。
 */
import type {
  BoardCreatePayload,
  BoardResponse,
  BoardUpdatePayload,
} from "./api/board-types";

/** 看板类型选项（忠实老前端 BoardTypeSelector.vue） */
export const BOARD_TYPES = [
  "Scrum看板",
  "Kanban看板",
  "自定义看板",
  "Bug看板",
  "测试看板",
] as const;

export type BoardTypeOption = (typeof BOARD_TYPES)[number];

export const MAX_BOARD_NAME_LENGTH = 100;
export const MAX_BOARD_DESCRIPTION_LENGTH = 500;

export interface BoardFormInput {
  boardName: string;
  description: string;
  /** 看板类型；空字符串表示未选择（后端按 null 处理走默认值） */
  boardType: string;
  isDefault: boolean;
}

export function emptyBoardFormInput(): BoardFormInput {
  return { boardName: "", description: "", boardType: "", isDefault: false };
}

export function editFormFromBoard(detail: BoardResponse): BoardFormInput {
  return {
    boardName: detail.boardName ?? "",
    description: detail.description ?? "",
    boardType: detail.boardType ?? "",
    isDefault: detail.isDefault === true,
  };
}

export interface BoardFormFieldError {
  field: "boardName" | "description" | "boardType";
  message: string;
}

/**
 * 字段级校验：收集全部错误返回（不首错即停）。
 * 调用方把错误挂到对应字段下方（FieldError），编辑该字段时清除其错误。
 */
export function validateBoardFormInput(input: BoardFormInput): BoardFormFieldError[] {
  const errors: BoardFormFieldError[] = [];
  const name = input.boardName.trim();
  if (!name) {
    errors.push({ field: "boardName", message: "请填写看板名称" });
  } else if (name.length > MAX_BOARD_NAME_LENGTH) {
    errors.push({
      field: "boardName",
      message: `看板名称不能超过 ${MAX_BOARD_NAME_LENGTH} 个字符`,
    });
  }
  if (input.description.trim().length > MAX_BOARD_DESCRIPTION_LENGTH) {
    errors.push({
      field: "description",
      message: `描述不能超过 ${MAX_BOARD_DESCRIPTION_LENGTH} 个字符`,
    });
  }
  if (input.boardType && !BOARD_TYPES.includes(input.boardType as BoardTypeOption)) {
    errors.push({ field: "boardType", message: "看板类型不在可选范围内" });
  }
  return errors;
}

/** 新建载荷：projectId 由调用方（项目上下文）传入 */
export function buildBoardCreatePayload(
  input: BoardFormInput,
  projectId: number,
): BoardCreatePayload {
  const payload: BoardCreatePayload = {
    boardName: input.boardName.trim(),
    projectId,
  };
  const description = input.description.trim();
  if (description) payload.description = description;
  if (input.boardType) payload.boardType = input.boardType;
  if (input.isDefault) payload.isDefault = true;
  return payload;
}

/** 更新载荷：字段级更新，id 必传 */
export function buildBoardUpdatePayload(
  input: BoardFormInput,
  id: number,
): BoardUpdatePayload {
  return {
    id,
    boardName: input.boardName.trim(),
    description: input.description.trim(),
    boardType: input.boardType || undefined,
    isDefault: input.isDefault,
  };
}

/**
 * 计算表单是否变脏：当前输入 vs 初始输入逐字段比较。
 * 传给 useUnsavedChangesGuard 做 dirty check。
 */
export function isBoardFormDirty(current: BoardFormInput, initial: BoardFormInput): boolean {
  return (
    current.boardName !== initial.boardName ||
    current.description !== initial.description ||
    current.boardType !== initial.boardType ||
    current.isDefault !== initial.isDefault
  );
}
