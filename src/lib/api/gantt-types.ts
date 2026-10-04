/**
 * P3 甘特图/里程碑契约类型。
 *
 * 忠实映射 hc-project-manage 后端：
 * - TaskController 甘特能力（task/v1）：GET gantt/{projectId}/
 *   dependencies/{taskId}/criticalPath/{projectId}/floats/{projectId}；
 *   POST batchUpdate
 * - MilestoneController（milestone，无 /v1）：POST /create//update//delete/{id}//page；
 *   GET /{id}/list/{projectId}
 *
 * 关键契约（来自后端源码）：
 * - batchUpdate 请求体为 TaskGanttBatchUpdateRequest{tasks: Item[]}，Item{id, text,
 *   start_date, end_date, progress}（注意：后端 @JsonProperty 为 snake_case，
 *   且 Item 带 @JsonAnySetter rejectUnknown，发 startDate/endDate 会 400）：
 *   整批原子更新标题/计划起止日/进度（0–100），不接受状态字段（进度不驱动状态，
 *   流转须显式调 updateStatus）。start_date/end_date 为 LocalDate，
 *   类型化为 'YYYY-MM-DD' 字符串
 * - gantt/{projectId} 与 criticalPath/{projectId} 返回 Map<String,Object>（实现拼装），
 *   前端按泛型记录接收；floats/{projectId} 返回 Map<number, number>（任务 id→浮动天数）
 * - dependencies/{taskId} 返回 { 前置/后置键: TaskVO[] } 的 Map，前端按
 *   Record<string, TaskGanttTaskSummary[]> 接收（键名由实现决定，渲染层不硬编码）
 * - 里程碑：create 返回 id；update 为"字段出现即提交"（MilestoneUpdateRequest 的
 *   *Submitted 字段被 @Getter/@Setter(AccessLevel.NONE) 隐藏，靠 @JsonSetter 在
 *   字段出现时自动置位，带 @JsonAnySetter rejectUnknown——客户端绝不发送
 *   xxxSubmitted，发送即 400 零写入；见 MilestoneUpdateHttpIntegrationTest），
 *   delete/{id} 为逻辑删（@TableLogic）；status 的 wire 值为小写 key
 *   （MilestoneStatusEnum @JsonValue）
 * - ⚠️ GET /milestone/statistics/{projectId} 为统计域，P3 甘特图内不接线，不建模
 */

/** 甘特图批量更新项（忠实于 TaskGanttBatchUpdateRequest.Item；wire 字段名为 snake_case） */
export interface GanttBatchUpdateItem {
  id: number;
  /** 任务标题（整批原子更新） */
  text?: string;
  /** 'YYYY-MM-DD'；wire 名 start_date */
  start_date?: string;
  /** 'YYYY-MM-DD'；wire 名 end_date */
  end_date?: string;
  /** 0–100；不驱动状态 */
  progress?: number;
}

/** 甘特图批量更新载荷 */
export interface GanttBatchUpdatePayload {
  tasks: GanttBatchUpdateItem[];
}

/** 甘特图数据（GET /task/v1/gantt/{projectId}，后端实现拼装） */
export type GanttData = Record<string, unknown>;

/** 关键路径数据（GET /task/v1/criticalPath/{projectId}，后端实现拼装） */
export type CriticalPathData = Record<string, unknown>;

/** 任务依赖（GET /task/v1/dependencies/{taskId}；键名由后端实现决定） */
export type TaskGanttDependencies = Record<string, unknown[]>;

/** 里程碑状态（wire 值为小写 key，MilestoneStatusEnum @JsonValue；后端严格匹配，不 trim/不忽略大小写） */
export const MILESTONE_STATUSES = [
  'not_started',
  'in_progress',
  'completed',
  'on_hold',
  'canceled',
] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

/** 里程碑创建载荷（忠实于后端 MilestoneCreateRequest；日期为 ISO 字符串） */
export interface MilestoneCreatePayload {
  projectId: number;
  name: string;
  status?: MilestoneStatus | string;
  startDate?: string;
  endDate?: string;
}

/**
 * 里程碑更新载荷（忠实于后端 MilestoneUpdateRequest：
 * "字段出现即提交"——*Submitted 由后端 @JsonSetter 自动置位，客户端只发要改的字段，
 * 绝不发送 xxxSubmitted（发了即 400 零写入））
 */
export interface MilestoneUpdatePayload {
  id: number;
  projectId?: number;
  name?: string;
  status?: MilestoneStatus | string;
  startDate?: string;
  endDate?: string;
}

/** 里程碑查询条件（忠实于后端 MilestoneQueryRequest） */
export interface MilestoneQueryRequest {
  projectId?: number;
  name?: string;
  status?: string;
}

/** 里程碑（忠实于后端 MilestoneResponse；日期为 ISO 字符串） */
export interface MilestoneResponse {
  id: number;
  projectId: number;
  name: string;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  /** 进度百分比 */
  progress?: number | null;
  /** 关联任务完成率 */
  taskCompletionRate?: number | null;
  totalTasks?: number | null;
  completedTasks?: number | null;
}
