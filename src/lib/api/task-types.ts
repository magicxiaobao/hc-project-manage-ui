/**
 * P1 任务契约类型。
 *
 * 忠实映射 hc-project-manage 后端 controller 与老前端（frontend/src/types/task.ts）：
 * - 优先级 JSON identity 为 'HIGH'|'MEDIUM'|'LOW'（PriorityEnum @JsonValue，三档冻结）
 * - status 为状态机枚举名字符串：TODO/IN_PROGRESS/PAUSED/COMPLETED/CANCELLED
 *   （TaskStatusEnum @JsonValue = value，拓扑唯一权威在状态机）
 * - actualStartDate / actualEndDate 为秒级时间戳；计划日期 LocalDate → 'yyyy-MM-dd'
 * - 评论载荷复用 requirement-types 的 Comment* 类型（targetType = TASK）
 */

/** 任务优先级（JSON identity：HIGH/MEDIUM/LOW） */
export const TASK_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** 任务状态（状态机枚举名） */
export const TASK_STATUSES = [
  'TODO',
  'IN_PROGRESS',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** 任务查询条件（忠实于后端 TaskQueryRequest） */
export interface TaskQueryRequest {
  title?: string;
  taskType?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  projectId?: number;
  sprintId?: number;
  assigneeId?: number;
  reporterId?: number;
}

/** 任务（忠实于后端 TaskResponse） */
export interface TaskResponse {
  id: number;
  title: string;
  description: string | null;
  taskType: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  statusLabel: string | null;
  storyPoints: number | null;
  projectId: number | null;
  sprintId: number | null;
  assigneeId: number | null;
  reporterId: number | null;
  estimatedStartDate: string | null;
  estimatedEndDate: string | null;
  /** 实际开始时间（秒级时间戳） */
  actualStartDate: number | null;
  /** 实际结束时间（秒级时间戳） */
  actualEndDate: number | null;
  estimatedHours: number | null;
  actualHours: number | null;
  /** 进度百分比（0–100），持久化值 */
  progress: number | null;
  tags: string | null;
  createdAt: number | null;
  updatedAt: number | null;
}

/** 创建任务载荷（忠实于后端 TaskCreateRequest：日期为 'yyyy-MM-dd'） */
export interface TaskCreatePayload {
  title: string;
  description?: string | null;
  taskType?: string | null;
  priority?: TaskPriority | null;
  storyPoints?: number | null;
  projectId: number;
  parentId?: number | null;
  /** 创建时原子建立多对多需求关系，最多 200 条 */
  implementsRequirementIds?: number[] | null;
  sprintId?: number | null;
  assigneeId?: number | null;
  reporterId?: number | null;
  estimatedStartDate?: string | null;
  estimatedEndDate?: string | null;
  estimatedHours?: number | null;
  tags?: string | null;
}

/**
 * 更新任务载荷（忠实于后端 TaskUpdateRequest：字段级局部更新）。
 * 未提交的字段不变，显式 null 表示清空；可清空的仅：描述、故事点、父任务、
 * 冲刺、计划日、预估工时、标签（标题/优先级/类型/报告人不可清空）。
 */
export interface TaskUpdatePayload {
  id: number;
  projectId?: number;
  title?: string;
  description?: string | null;
  taskType?: string;
  priority?: TaskPriority;
  storyPoints?: number | null;
  parentId?: number | null;
  sprintId?: number | null;
  reporterId?: number;
  estimatedStartDate?: string | null;
  estimatedEndDate?: string | null;
  estimatedHours?: number | null;
  tags?: string | null;
}

/**
 * 任务状态流转请求（忠实于后端 TaskTransitionRequest）。
 * 目标状态为 TaskStatus 枚举名；暂停/取消/重开需 reason，完成需 deliverables 或说明。
 */
export interface TaskTransitionPayload {
  taskId: number;
  status: TaskStatus;
  reason?: string;
  /** 交付物或完成说明（完成必填；缺省时取 reason） */
  deliverables?: string;
  /** 开始未分配任务时的执行人 */
  assigneeId?: number;
  qualityApproved?: boolean;
}

/**
 * 任务改派请求（忠实于后端 TaskAssignRequest：reason 必填）。
 * 执行人变化走状态机改派工作流，reason 同事务落库。
 */
export interface TaskAssignPayload {
  taskId: number;
  assigneeId: number;
  reason: string;
}
