/**
 * 冲刺表单模型（P3：p3-sprint-list 冲刺列表与生命周期管理）。
 *
 * 纯函数：表单输入 ↔ API 载荷的转换 + 字段级校验 + 状态展示/流转守卫。
 * - 状态枚举忠实后端 SprintStatusEnum（PLANNING/ACTIVE/COMPLETED/CANCELLED），
 *   中文标签忠实后端 label 与老前端 SPRINT_STATUS_LABEL_MAP
 *   （规划中/进行中/已完成/已取消）；老前端 statusLabel 字段同样保留回退。
 * - 前端状态机拦截忠实后端 Sprint.java 的 canStart/canComplete/canCancel：
 *   开始仅 PLANNING（后端另要求计划起止日齐全且项目无其它活跃冲刺，
 *   不齐时后端报业务码）；完成仅 ACTIVE；取消仅 PLANNING/ACTIVE
 *   （后端按 canTransitionTo(CANCELLED) 转换表：PLANNING/ACTIVE→CANCELLED）。
 * - 日期：表单用 YYYY-MM-DD（HTML date 输入），发后端拼成
 *   'YYYY-MM-DDTHH:mm:ss'（后端 LocalDateTime，老前端同口径）。
 * - 数字字段（capacity/teamSize/scrumMasterId/productOwnerId）后端为
 *   Integer/Long：限定 0..2147483647（Integer 上限；超限前端 FieldError，
 *   沿用 p3-board-kanban r8-R7 经验）。
 * - 校验收集全部错误（不首错即停），调用方挂 FieldError、编辑即清除。
 */
import type {
  SprintCreatePayload,
  SprintResponse,
  SprintUpdatePayload,
} from "./api/sprint-types";

/** 冲刺状态（忠实后端 SprintStatusEnum 枚举名） */
export const SPRINT_STATUSES = ["PLANNING", "ACTIVE", "COMPLETED", "CANCELLED"] as const;
export type SprintStatus = (typeof SPRINT_STATUSES)[number];

/** 冲刺状态中文标签（忠实后端 SprintStatusEnum label / 老前端 SPRINT_STATUS_LABEL_MAP） */
export const SPRINT_STATUS_LABELS: Record<SprintStatus, string> = {
  PLANNING: "规划中",
  ACTIVE: "进行中",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

export function isSprintStatus(value: string | null | undefined): value is SprintStatus {
  return (
    value === "PLANNING" ||
    value === "ACTIVE" ||
    value === "COMPLETED" ||
    value === "CANCELLED"
  );
}

/** 状态展示标签：优先用后端返回的 statusLabel，其次本地映射，最后原文回退 */
export function sprintStatusLabel(
  status: string | null | undefined,
  statusLabel?: string | null,
): string {
  if (statusLabel) return statusLabel;
  if (isSprintStatus(status)) return SPRINT_STATUS_LABELS[status];
  return status ?? "";
}

/** 前端流转拦截（忠实后端 Sprint.canStart）：仅"规划中"展示"开始" */
export const canStartSprint = (status: string | null | undefined): boolean =>
  status === "PLANNING";
/** 前端流转拦截（忠实后端 Sprint.canComplete）：仅"进行中"展示"完成" */
export const canCompleteSprint = (status: string | null | undefined): boolean =>
  status === "ACTIVE";
/** 前端流转拦截（忠实后端 Sprint.canCancel 的转换表）：规划中/进行中展示"取消" */
export const canCancelSprint = (status: string | null | undefined): boolean =>
  status === "PLANNING" || status === "ACTIVE";

export const MAX_SPRINT_NAME_LENGTH = 100;
export const MAX_SPRINT_GOAL_LENGTH = 500;
const MAX_INTEGER = 2147483647;

export interface SprintFormInput {
  sprintName: string;
  sprintGoal: string;
  /** YYYY-MM-DD（HTML date 输入值） */
  plannedStartDate: string;
  /** YYYY-MM-DD（HTML date 输入值） */
  plannedEndDate: string;
  /** 数字字段以字符串承载（Input 值为 string），空串=未填 */
  capacity: string;
  scrumMasterId: string;
  productOwnerId: string;
  teamSize: string;
}

export function emptySprintFormInput(): SprintFormInput {
  return {
    sprintName: "",
    sprintGoal: "",
    plannedStartDate: "",
    plannedEndDate: "",
    capacity: "",
    scrumMasterId: "",
    productOwnerId: "",
    teamSize: "",
  };
}

/** 后端 LocalDateTime 字符串 → date 输入值（YYYY-MM-DD） */
export function localDateTimeToDay(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  return trimmed.length >= 10 ? trimmed.slice(0, 10) : "";
}

/** date 输入值（YYYY-MM-DD）→ 后端 LocalDateTime 字符串 */
export function dayToLocalDateTime(value: string): string {
  return `${value}T00:00:00`;
}

export function editFormFromSprint(detail: SprintResponse): SprintFormInput {
  return {
    sprintName: detail.sprintName ?? "",
    sprintGoal: detail.sprintGoal ?? "",
    plannedStartDate: localDateTimeToDay(detail.plannedStartDate),
    plannedEndDate: localDateTimeToDay(detail.plannedEndDate),
    capacity: detail.capacity == null ? "" : String(detail.capacity),
    scrumMasterId: detail.scrumMasterId == null ? "" : String(detail.scrumMasterId),
    productOwnerId: detail.productOwnerId == null ? "" : String(detail.productOwnerId),
    teamSize: detail.teamSize == null ? "" : String(detail.teamSize),
  };
}

export interface SprintFormFieldError {
  field:
    | "sprintName"
    | "sprintGoal"
    | "plannedStartDate"
    | "plannedEndDate"
    | "capacity"
    | "scrumMasterId"
    | "productOwnerId"
    | "teamSize";
  message: string;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateIntegerField(
  raw: string,
  field: SprintFormFieldError["field"],
  label: string,
  errors: SprintFormFieldError[],
): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) {
    errors.push({ field, message: `${label}必须是正整数` });
    return null;
  }
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value > MAX_INTEGER) {
    errors.push({ field, message: `${label}不能超过 ${MAX_INTEGER}` });
    return null;
  }
  return value;
}

/**
 * 字段级校验：收集全部错误返回（不首错即停）。
 * - 冲刺名称必填（后端 Sprint 实体要求非空）；
 * - 结束日期不早于开始日期；
 * - capacity/teamSize/scrumMasterId/productOwnerId 为正整数且不超 Java Integer 上限。
 */
export function validateSprintFormInput(input: SprintFormInput): SprintFormFieldError[] {
  const errors: SprintFormFieldError[] = [];
  const name = input.sprintName.trim();
  if (!name) {
    errors.push({ field: "sprintName", message: "请填写冲刺名称" });
  } else if (name.length > MAX_SPRINT_NAME_LENGTH) {
    errors.push({
      field: "sprintName",
      message: `冲刺名称不能超过 ${MAX_SPRINT_NAME_LENGTH} 个字符`,
    });
  }
  if (input.sprintGoal.trim().length > MAX_SPRINT_GOAL_LENGTH) {
    errors.push({
      field: "sprintGoal",
      message: `冲刺目标不能超过 ${MAX_SPRINT_GOAL_LENGTH} 个字符`,
    });
  }
  const start = input.plannedStartDate.trim();
  const end = input.plannedEndDate.trim();
  if (start && !DAY_RE.test(start)) {
    errors.push({ field: "plannedStartDate", message: "计划开始日期格式不正确" });
  }
  if (end && !DAY_RE.test(end)) {
    errors.push({ field: "plannedEndDate", message: "计划结束日期格式不正确" });
  }
  if (DAY_RE.test(start) && DAY_RE.test(end) && end < start) {
    errors.push({ field: "plannedEndDate", message: "计划结束日期不能早于开始日期" });
  }
  validateIntegerField(input.capacity, "capacity", "容量（人天）", errors);
  validateIntegerField(input.scrumMasterId, "scrumMasterId", "Scrum Master 用户 ID", errors);
  validateIntegerField(input.productOwnerId, "productOwnerId", "产品负责人用户 ID", errors);
  validateIntegerField(input.teamSize, "teamSize", "团队规模", errors);
  return errors;
}

function parseOptionalInteger(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : undefined;
}

/** 新建载荷：projectId 由调用方（项目上下文）传入 */
export function buildSprintCreatePayload(
  input: SprintFormInput,
  projectId: number,
): SprintCreatePayload {
  const payload: SprintCreatePayload = {
    sprintName: input.sprintName.trim(),
    projectId,
  };
  const goal = input.sprintGoal.trim();
  if (goal) payload.sprintGoal = goal;
  const start = input.plannedStartDate.trim();
  if (start) payload.plannedStartDate = dayToLocalDateTime(start);
  const end = input.plannedEndDate.trim();
  if (end) payload.plannedEndDate = dayToLocalDateTime(end);
  const capacity = parseOptionalInteger(input.capacity);
  if (capacity !== undefined) payload.capacity = capacity;
  const scrumMasterId = parseOptionalInteger(input.scrumMasterId);
  if (scrumMasterId !== undefined) payload.scrumMasterId = scrumMasterId;
  const productOwnerId = parseOptionalInteger(input.productOwnerId);
  if (productOwnerId !== undefined) payload.productOwnerId = productOwnerId;
  const teamSize = parseOptionalInteger(input.teamSize);
  if (teamSize !== undefined) payload.teamSize = teamSize;
  return payload;
}

/** 更新载荷：字段级更新，id 必传（projectId 不随更新发送，后端按 id 定位） */
export function buildSprintUpdatePayload(
  input: SprintFormInput,
  id: number,
): SprintUpdatePayload {
  const { projectId: _omitted, ...rest } = buildSprintCreatePayload(input, 0);
  void _omitted;
  return { ...rest, id };
}

/**
 * 完成率（故事点）：忠实老前端 getCompletionRate
 * （completedStoryPoints / totalStoryPoints；总数为 0/空时 0%）。
 */
export function sprintCompletionRate(detail: SprintResponse): number {
  const total = detail.totalStoryPoints ?? 0;
  if (!total || total <= 0) return 0;
  return Math.round(((detail.completedStoryPoints ?? 0) / total) * 100);
}

/** 计划时间展示：两个日期都齐才展示区间，否则 "-"（忠实老前端 getDuration） */
export function sprintDurationText(detail: SprintResponse): string {
  if (detail.plannedStartDate && detail.plannedEndDate) {
    return `${localDateTimeToDay(detail.plannedStartDate)} ~ ${localDateTimeToDay(detail.plannedEndDate)}`;
  }
  return "-";
}
