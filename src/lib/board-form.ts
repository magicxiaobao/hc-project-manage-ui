/**
 * 看板表单模型（P3：p3-board-manage 看板列表管理）。
 *
 * 纯函数：表单输入 ↔ API 载荷的转换 + 字段级校验。
 * - boardName 必填（后端 Board 实体要求非空，空名会创建出无名看板）；
 * - 校验收集全部错误，不首错即停；
 * - 看板类型取老前端 BoardTypeSelector 的枚举口径（Scrum看板/Kanban看板/
 *   自定义看板/Bug看板/测试看板），后端为自由字符串，前端只做选项约束；
 *   编辑时不提供"不指定"选项（后端 update 按 Optional.ofNullable().ifPresent
 *   跳过 null/缺失字段，无置空语义，选"不指定"会误导用户以为已清除）。
 * - isPublic/wipEnabled 走表单复选框（后端 Board 实体默认 isPublic=true、
 *   wipEnabled=false，表单初始值与后端默认值对齐）。
 * - isDefault 不属于表单：后端 create/update 不清除项目内其它默认看板，
 *   只有 setDefaultBoard 会；表单里直接勾选会产生多个默认看板。
 *   改走行操作的"设为默认"（POST /board/v1/setDefault/{id}）。
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
  /**
   * 看板类型；空字符串表示未选择（新建时后端按 null 走默认值"Kanban看板"；
   * 编辑时空串省略，后端按字段缺失跳过、保留旧值——后端无置空语义，
   * 因此表单不提供"不指定"选项）。
   */
  boardType: string;
  /** 是否公开看板（后端默认 true） */
  isPublic: boolean;
  /** 是否启用 WIP 限制（后端默认 false，仅开关，限额在看板列层配置） */
  wipEnabled: boolean;
}

export function emptyBoardFormInput(): BoardFormInput {
  return { boardName: "", description: "", boardType: "", isPublic: true, wipEnabled: false };
}

export function editFormFromBoard(detail: BoardResponse): BoardFormInput {
  return {
    boardName: detail.boardName ?? "",
    description: detail.description ?? "",
    boardType: detail.boardType ?? "",
    // 回填走后端实体默认值口径（Board.init：isPublic=true、wipEnabled=false），
    // 实体初始化后两字段恒非空，?? 仅防御历史脏数据
    isPublic: detail.isPublic ?? true,
    wipEnabled: detail.wipEnabled ?? false,
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
    isPublic: input.isPublic,
    wipEnabled: input.wipEnabled,
  };
  const description = input.description.trim();
  if (description) payload.description = description;
  if (input.boardType) payload.boardType = input.boardType;
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
    // 空串省略：后端按 Optional.ofNullable().ifPresent 跳过，保留旧值
    boardType: input.boardType || undefined,
    isPublic: input.isPublic,
    wipEnabled: input.wipEnabled,
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
    current.isPublic !== initial.isPublic ||
    current.wipEnabled !== initial.wipEnabled
  );
}
