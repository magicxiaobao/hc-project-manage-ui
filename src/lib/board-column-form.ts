/**
 * 看板列表单模型（P3：p3-board-kanban 列新增/编辑）。
 *
 * 纯函数：表单输入 ↔ API 载荷的转换 + 字段级校验。
 * - 字段口径忠实于后端 BoardColumnCreateRequest：
 *   boardId/columnName/description/taskStatus/sortOrder/wipLimit/wipEnabled/
 *   color/isSystem/columnType/isVisible/columnConfig。
 * - columnName 必填（无名列无法在看板上展示）；
 * - taskStatus 可选（空=不映射任务状态；后端 taskStatus 为 null 时该列 tasks 为空）；
 *   选中时必须在任务状态机枚举内（否则后端 ofValue 解析失败、该列永远无卡片）；
 * - wipLimit 可选，填则必须为非负整数（0 视为无限制，与后端列头展示 count/limit 对齐）；
 * - color 可选，填则必须为 #RRGGBB 十六进制（列头色点渲染用）；
 * - 校验收集全部错误，不首错即停。
 */
import type {
  BoardColumnCreatePayload,
  BoardColumnResponse,
  BoardColumnUpdatePayload,
} from "./api/board-types";
import { TASK_STATUSES, type TaskStatus } from "./api/task-types";

export const MAX_COLUMN_NAME_LENGTH = 100;
export const MAX_COLUMN_DESCRIPTION_LENGTH = 500;

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export interface BoardColumnFormInput {
  columnName: string;
  description: string;
  /**
   * 映射的任务状态（枚举名）；空字符串表示不映射（后端 taskStatus=null，
   * 该列不聚合任务）。
   */
  taskStatus: string;
  /** WIP 上限输入（字符串）；空字符串表示不限制 */
  wipLimit: string;
  /** 十六进制颜色；空字符串表示不设置 */
  color: string;
}

export function emptyBoardColumnFormInput(): BoardColumnFormInput {
  return { columnName: "", description: "", taskStatus: "", wipLimit: "", color: "" };
}

export function editFormFromColumn(
  detail: Pick<
    BoardColumnResponse,
    "columnName" | "description" | "taskStatus" | "wipLimit" | "color"
  >,
): BoardColumnFormInput {
  return {
    columnName: detail.columnName ?? "",
    description: detail.description ?? "",
    taskStatus: detail.taskStatus ?? "",
    wipLimit:
      detail.wipLimit != null && detail.wipLimit > 0 ? String(detail.wipLimit) : "",
    color: detail.color ?? "",
  };
}

export interface BoardColumnFormFieldError {
  field: "columnName" | "description" | "taskStatus" | "wipLimit" | "color";
  message: string;
}

/**
 * 字段级校验：收集全部错误返回（不首错即停）。
 * 调用方把错误挂到对应字段下方（FieldError），编辑该字段时清除其错误。
 */
export function validateBoardColumnFormInput(
  input: BoardColumnFormInput,
): BoardColumnFormFieldError[] {
  const errors: BoardColumnFormFieldError[] = [];
  const name = input.columnName.trim();
  if (!name) {
    errors.push({ field: "columnName", message: "请填写列名称" });
  } else if (name.length > MAX_COLUMN_NAME_LENGTH) {
    errors.push({
      field: "columnName",
      message: `列名称不能超过 ${MAX_COLUMN_NAME_LENGTH} 个字符`,
    });
  }
  if (input.description.trim().length > MAX_COLUMN_DESCRIPTION_LENGTH) {
    errors.push({
      field: "description",
      message: `描述不能超过 ${MAX_COLUMN_DESCRIPTION_LENGTH} 个字符`,
    });
  }
  const taskStatus = input.taskStatus.trim();
  if (taskStatus && !(TASK_STATUSES as readonly string[]).includes(taskStatus)) {
    errors.push({ field: "taskStatus", message: "映射状态不在任务状态机枚举内" });
  }
  const wipLimit = input.wipLimit.trim();
  if (wipLimit) {
    const parsed = Number(wipLimit);
    if (!Number.isInteger(parsed) || parsed < 0) {
      errors.push({ field: "wipLimit", message: "WIP 上限必须是非负整数" });
    }
  }
  const color = input.color.trim();
  if (color && !HEX_COLOR_PATTERN.test(color)) {
    errors.push({ field: "color", message: "颜色必须是 #RRGGBB 格式的十六进制" });
  }
  return errors;
}

function normalizeWipLimit(input: string): number | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  // 0 视为无限制（与列头展示 count 口径对齐），不随载荷下发
  return parsed > 0 ? parsed : undefined;
}

/** 新建载荷：boardId 由调用方（看板上下文）传入 */
export function buildBoardColumnCreatePayload(
  input: BoardColumnFormInput,
  boardId: number,
): BoardColumnCreatePayload {
  const payload: BoardColumnCreatePayload = {
    boardId,
    columnName: input.columnName.trim(),
  };
  const description = input.description.trim();
  if (description) payload.description = description;
  const taskStatus = input.taskStatus.trim();
  if (taskStatus) payload.taskStatus = taskStatus as TaskStatus;
  const wipLimit = normalizeWipLimit(input.wipLimit);
  if (wipLimit != null) payload.wipLimit = wipLimit;
  const color = input.color.trim();
  if (color) payload.color = color;
  return payload;
}

/** 更新载荷：字段级更新，id 必传（后端 updateBoardColumn 按字段缺失跳过；boardId 为归属字段，更新不下发） */
export function buildBoardColumnUpdatePayload(
  input: BoardColumnFormInput,
  id: number,
): BoardColumnUpdatePayload {
  const payload: BoardColumnUpdatePayload = { id };
  const description = input.description.trim();
  if (description) payload.description = description;
  payload.columnName = input.columnName.trim();
  const taskStatus = input.taskStatus.trim();
  if (taskStatus) payload.taskStatus = taskStatus as TaskStatus;
  const wipLimitRaw = input.wipLimit.trim();
  // 编辑时空值 = 取消上限：必须明确下发 wipLimit: 0。
  // 后端 updateById 按 NOT_NULL 策略跳过 null 字段，省略会静默保留旧上限；
  // 0 落库后 BoardColumn.isWipLimited()（wipLimit>0）为 false，
  // 与列头"不限制"口径一致。
  // taskStatus/color/description：后端 create/update 均不落库（见 P3 后端备忘 F2），
  // 此处不臆造"清空"语义——有值照常下发（留待后端补齐），空值省略。
  payload.wipLimit = wipLimitRaw === "" ? 0 : Number(wipLimitRaw);
  const color = input.color.trim();
  if (color) payload.color = color;
  return payload;
}
