
/**
 * P1 需求契约类型。
 *
 * 忠实映射 hc-project-manage 后端 controller 与老前端（frontend/src/types/requirement.ts）：
 * - 需求类型 JSON identity 为冻结词表 'Epic'|'Story'|'Task'（@JsonValue = value）
 * - 优先级 JSON identity 为 'HIGH'|'MEDIUM'|'LOW'（@JsonValue）
 * - status 为状态机枚举名字符串：DRAFT/REVIEW/APPROVED/IN_DEVELOPMENT/COMPLETED/CANCELLED
 */

/** 需求类型（JSON identity：Epic/Story/Task） */
export const REQUIREMENT_TYPES = ['Epic', 'Story', 'Task'] as const;
export type RequirementType = (typeof REQUIREMENT_TYPES)[number];

/** 需求优先级（JSON identity：HIGH/MEDIUM/LOW） */
export const REQUIREMENT_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type RequirementPriority = (typeof REQUIREMENT_PRIORITIES)[number];

/** 需求状态（状态机枚举名） */
export const REQUIREMENT_STATUSES = [
  'DRAFT',
  'REVIEW',
  'APPROVED',
  'IN_DEVELOPMENT',
  'COMPLETED',
  'CANCELLED',
] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

/** 通用选项（types/priorities/statuses 返回 { value, label }） */
export interface RequirementOption {
  value: string;
  label: string;
}

/** 需求查询条件（忠实于后端 RequirementQueryRequest） */
export interface RequirementQueryRequest {
  title?: string;
  requirementType?: RequirementType;
  priority?: RequirementPriority;
  status?: RequirementStatus;
  projectId?: number;
  parentId?: number;
  assigneeId?: number;
}

/** 需求（忠实于后端 RequirementResponse + 老前端 RequirementResponse） */
export interface RequirementResponse {
  id: number;
  title: string;
  description: string | null;
  requirementType: RequirementType;
  priority: RequirementPriority;
  status: RequirementStatus;
  statusLabel: string | null;
  storyPoints: number | null;
  projectId: number | null;
  parentId: number | null;
  assigneeId: number | null;
  estimatedStartDate: string | null;
  estimatedEndDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  createdAt: number | null;
  updatedAt: number | null;
}

/** 创建需求载荷（忠实于后端 RequirementCreateRequest：日期为 LocalDate → 'yyyy-MM-dd'） */
export interface RequirementCreatePayload {
  title: string;
  description: string;
  requirementType: RequirementType;
  priority: RequirementPriority;
  storyPoints?: number | null;
  projectId: number;
  parentId?: number | null;
  assigneeId?: number | null;
  estimatedStartDate?: string | null;
  estimatedEndDate?: string | null;
  actualStartDate?: string | null;
  actualEndDate?: string | null;
}

/** 更新需求载荷（忠实于后端 RequirementUpdateRequest：带 id，无 actual* 字段） */
export interface RequirementUpdatePayload {
  id: number;
  title: string;
  description: string;
  requirementType: RequirementType;
  priority: RequirementPriority;
  storyPoints?: number | null;
  projectId: number;
  parentId?: number | null;
  assigneeId?: number | null;
  estimatedStartDate?: string | null;
  estimatedEndDate?: string | null;
}

/** 状态流转请求（忠实于后端 RequirementStatusTransitionRequest） */
export interface RequirementTransitionPayload {
  requirementId: number;
  toStatus: string;
  reason?: string;
  comment?: string;
  assigneeId?: number;
  actualStartDate?: string | null;
  actualEndDate?: string | null;
}

/** 单条流转记录（忠实于后端 RequirementStatusTransitionResponse） */
export interface RequirementTransitionRecord {
  id: number;
  requirementId: number;
  fromStatus: string;
  toStatus: string;
  transitionReason: string | null;
  transitionComment: string | null;
  operatorId: number | null;
  transitionTime: string;
  isAutoTransition: boolean;
  triggerCondition: string | null;
}

/** 流转历史聚合（忠实于后端 RequirementStatusTransitionHistoryResponse） */
export interface RequirementTransitionHistory {
  requirementId: number;
  currentStatus: string | null;
  transitions: RequirementTransitionRecord[];
  total: number;
  allowedTransitions: string[];
}

/** 追溯对象键 */
export interface AlmObjectKey {
  objectType: string;
  objectId: number;
}

/** 追溯节点摘要（忠实于后端 TraceNodeSummary 的 JSON 视图） */
export interface TraceNodeSummary {
  objectType: string;
  objectId: number;
  displayName: string;
  status: string | null;
  assigneeId: number | null;
  runId: number | null;
  runType: string | null;
  direct: boolean;
  path: AlmObjectKey[];
}

/** 追溯边 */
export interface TraceEdgeResponse {
  sourceObject: AlmObjectKey;
  relationType: string;
  targetObject: AlmObjectKey;
  direct: boolean;
}

/** 追溯分桶 { total, list, truncated } */
export interface TraceBucket<T> {
  total: number;
  list: T[];
  truncated: boolean;
}

/** 需求追溯图（忠实于后端 RequirementTraceResponse） */
export interface RequirementTrace {
  requirement: TraceNodeSummary;
  tasks: TraceBucket<TraceNodeSummary>;
  testCases: TraceBucket<TraceNodeSummary>;
  testRuns: TraceBucket<TraceNodeSummary>;
  testExecutions: TraceBucket<TraceNodeSummary>;
  defects: TraceBucket<TraceNodeSummary>;
  versions: TraceBucket<TraceNodeSummary>;
  edges: TraceEdgeResponse[];
  generatedAt: string;
}

/** 需求影响图（忠实于后端 RequirementImpactResponse） */
export interface RequirementImpact {
  root: TraceNodeSummary;
  nodes: TraceNodeSummary[];
  edges: TraceEdgeResponse[];
  totalNodes: number;
  truncated: boolean;
  generatedAt: string;
}

/** 矩阵契约统一由 trace-types 定义。 */
export type { RequirementMatrixRow, RequirementMatrixQuery } from './trace-types';

/** 追溯历史事件（忠实于后端 TraceHistoryResponse 的 JSON 视图） */
export interface TraceHistoryEvent {
  eventId: number;
  eventType: string;
  action: string;
  actorType: string | null;
  actorId: number | null;
  actorName: string | null;
  actorSource: string | null;
  relationSource: string | null;
  requestId: string | null;
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  occurredAt: string;
}

/** 追溯历史查询条件 */
export interface TraceHistoryQuery {
  action?: string;
  actorType?: string;
}

/** 评论（忠实于后端 CommentView） */
export interface CommentView {
  id: number;
  content: string;
  targetType: string;
  targetId: number;
  parentId: number | null;
  creatorId: number;
  createdAt: number | null;
  updatedAt: number | null;
}

/** 评论创建载荷 */
export interface CommentCreatePayload {
  content: string;
  parentId?: number | null;
}

/** 评论更新载荷 */
export interface CommentUpdatePayload {
  id: number;
  content: string;
}
