/**
 * P3 冲刺契约类型。
 *
 * 忠实映射 hc-project-manage 后端 SprintController（sprint/v1）：
 * - POST createSprint/updateSprint/valid/{id}/invalid/{id}/findByPage/
 *   project/{projectId}/findByPage/start/{id}/complete/{id}/cancel/{id}/
 *   retrospective/{sprintId}
 * - GET findById/{id}/active/project/{projectId}/burndownChart/{id}/
 *   retrospective/{sprintId}
 * - 完成冲刺请求体 SprintCompleteRequest{disposition, targetSprintId}：
 *   disposition 为 SprintCompletionDisposition（BACKEND 返回"未完成任务去向必填"
 *   校验；枚举值 BACKLOG | TARGET_SPRINT），TARGET_SPRINT 时 targetSprintId 必填
 * - ⚠️ GET burndown/{sprintId} 与 statistics/{sprintId} 为 Controller TODO 空壳
 *   （直接返回 Map.of()），P3 明确排除不接线；燃尽图走 burndownChart/{id}
 *   （后端真实实现，返回 {dates, values, dailyHours} 的 Object）
 * - 回顾：GET 返回字符串（冲刺不存在时业务码异常）；POST 请求体为
 *   { retrospective: string }（后端读 body.get("retrospective")）
 * - create/update 返回 Long id；start/complete/cancel 返回成功消息字符串
 * - 日期后端为 LocalDateTime，老前端收发 'YYYY-MM-DDTHH:mm:ss' 字符串，此处类型化为 string
 */

/** 未完成任务去向（完成冲刺时必填） */
export const SPRINT_COMPLETION_DISPOSITIONS = ['BACKLOG', 'TARGET_SPRINT'] as const;
export type SprintCompletionDisposition =
  (typeof SPRINT_COMPLETION_DISPOSITIONS)[number];

/** 完成冲刺请求体（忠实于后端 SprintCompleteRequest） */
export interface SprintCompletePayload {
  disposition: SprintCompletionDisposition;
  /** disposition=TARGET_SPRINT 时必填：同项目规划中冲刺 id */
  targetSprintId?: number;
}

/** 冲刺创建载荷（忠实于后端 SprintCreateRequest） */
export interface SprintCreatePayload {
  sprintName: string;
  sprintGoal?: string;
  description?: string;
  projectId: number;
  sprintNumber?: string;
  /** 'YYYY-MM-DDTHH:mm:ss' */
  plannedStartDate?: string;
  /** 'YYYY-MM-DDTHH:mm:ss' */
  plannedEndDate?: string;
  capacity?: number;
  scrumMasterId?: number;
  productOwnerId?: number;
  teamSize?: number;
  retrospectiveSummary?: string;
  demoSummary?: string;
  autoStart?: boolean;
  autoComplete?: boolean;
  durationDays?: number;
}

/** 冲刺更新载荷（忠实于后端 SprintUpdateRequest；含 id） */
export interface SprintUpdatePayload extends Partial<SprintCreatePayload> {
  id: number;
}

/** 冲刺查询条件（忠实于后端 SprintQueryRequest） */
export interface SprintQueryRequest {
  sprintName?: string;
  status?: string;
  projectId?: number;
  sprintNumber?: string;
  scrumMasterId?: number;
  productOwnerId?: number;
}

/** 冲刺（忠实于后端 SprintResponse；日期为 'YYYY-MM-DDTHH:mm:ss' 字符串） */
export interface SprintResponse {
  id: number;
  sprintName: string;
  sprintGoal?: string | null;
  description?: string | null;
  status: string;
  statusLabel?: string | null;
  projectId: number;
  sprintNumber?: string | null;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  actualStartDate?: string | null;
  actualEndDate?: string | null;
  capacity?: number | null;
  completedStoryPoints?: number | null;
  totalStoryPoints?: number | null;
  scrumMasterId?: number | null;
  productOwnerId?: number | null;
  teamSize?: number | null;
  retrospectiveSummary?: string | null;
  demoSummary?: string | null;
  autoStart?: boolean | null;
  autoComplete?: boolean | null;
  durationDays?: number | null;
}

/**
 * 燃尽图数据（忠实于 GET /sprint/v1/burndownChart/{id} 的后端真实实现；
 * Controller 返回 Result<Object>，后端 Service 返回 {dates, values, dailyHours}：
 * dates 为日期串数组，values 为剩余故事点折线，dailyHours 为每日工时柱）
 */
export interface SprintBurndownData {
  dates: string[];
  values: number[];
  dailyHours: number[];
}
