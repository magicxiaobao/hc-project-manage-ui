/**
 * P3 追溯契约类型。
 *
 * 忠实映射 hc-project-manage 后端：
 * - RequirementTraceController（requirement/v1/trace）：GET {requirementId}/
 *   {requirementId}/impact；POST matrix/findByPage
 * - TraceabilityRelationController（/traceability/v1/relations，注意前导斜杠，
 *   RequestMapping 值为 "/traceability/v1/relations"）：POST /link//unlink/
 *   /relink//batch-query（后端已就绪、老前端零接线）
 *
 * 关键契约（来自后端源码）：
 * - RequirementMatrixRow（record）：{ requirement: TraceNodeSummary,
 *   taskSummaries/testCaseSummaries/defectSummaries: TraceNodeSummary[],
 *   versionEvidence: VersionEvidenceBucket }
 * - TraceNodeSummary（record）：{ objectType, objectId, displayName, status,
 *   assigneeId?, runId?, runType?, direct, path: AlmObjectKey[] }
 *   （executionNode 当且仅当 runId+runType 非空）
 * - RequirementMatrixQuery：{ projectId, requirementId?, requirementStatus?,
 *   taskStatus?, testCaseStatus?, defectStatus?, versionStatus? }
 *   （versionStatus 为 VersionStatus 枚举，P3 查询面不建模，用 string 透传）
 * - LinkRelationRequest（record）：{ sourceType, sourceId, relationType,
 *   targetType, targetId }——项目、Actor、source/status 由服务端确定，前端不传
 * - UnlinkRelationRequest = link + reason（必填，页面需收集）
 * - BatchRelationQueryRequest（record）：{ objects: AlmObjectKey[], direction?,
 *   relationTypes?: Set<->数组, activeOnly }；objects 非空（后端校验）
 * - ⚠️ POST requirement/v1/trace/{requirementId}/export 为 xlsx 导出，
 *   P3 明确排除，不建模
 */

/** ALM 对象类型（后端 AlmObjectType 枚举名） */
export const ALM_OBJECT_TYPES = [
  'REQUIREMENT',
  'TASK',
  'TEST_CASE',
  'TEST_RUN',
  'TEST_EXECUTION',
  'DEFECT',
  'VERSION',
] as const;
export type AlmObjectType = (typeof ALM_OBJECT_TYPES)[number];

/** ALM 关系类型（后端 AlmRelationType 枚举名） */
export const ALM_RELATION_TYPES = [
  'TASK_IMPLEMENTS_REQUIREMENT',
  'TEST_CASE_VERIFIES_REQUIREMENT',
  'DEFECT_AFFECTS_REQUIREMENT',
  'DEFECT_FOUND_IN_TASK',
  'TEST_EXECUTION_DISCOVERS_DEFECT',
  'TEST_RUN_VALIDATES_VERSION',
  'VERSION_CONTAINS_REQUIREMENT',
  'VERSION_CONTAINS_TASK',
  'VERSION_CONTAINS_DEFECT',
] as const;
export type AlmRelationType = (typeof ALM_RELATION_TYPES)[number];

/** 关系查询方向 */
export type AlmRelationDirection = 'OUTGOING' | 'INCOMING' | 'BOTH';

/** ALM 对象键 */
export interface AlmObjectKey {
  objectType: AlmObjectType;
  objectId: number;
}

/** ALM 图节点摘要（忠实于后端 TraceNodeSummary record） */
export interface TraceNodeSummary {
  objectType: AlmObjectType;
  objectId: number;
  displayName?: string | null;
  status?: string | null;
  assigneeId?: number | null;
  runId?: number | null;
  runType?: string | null;
  direct: boolean;
  path: AlmObjectKey[];
}

/** 版本证据桶（后端 VersionEvidenceBucket；实现拼装，P3 只做只读渲染） */
export type VersionEvidenceBucket = Record<string, unknown>;

/** 追溯矩阵行（忠实于后端 RequirementMatrixRow record） */
export interface RequirementMatrixRow {
  requirement: TraceNodeSummary;
  taskSummaries: TraceNodeSummary[];
  testCaseSummaries: TraceNodeSummary[];
  defectSummaries: TraceNodeSummary[];
  versionEvidence: VersionEvidenceBucket;
}

/** 追溯矩阵查询（忠实于后端 RequirementMatrixQuery；projectId 必填） */
export interface RequirementMatrixQuery {
  projectId: number;
  requirementId?: number;
  requirementStatus?: string;
  taskStatus?: string;
  testCaseStatus?: string;
  defectStatus?: string;
  versionStatus?: string;
}

/** 人工关系创建载荷（忠实于后端 LinkRelationRequest record） */
export interface LinkRelationPayload {
  sourceType: AlmObjectType;
  sourceId: number;
  relationType: AlmRelationType;
  targetType: AlmObjectType;
  targetId: number;
}

/** 人工关系解除载荷（忠实于后端 UnlinkRelationRequest record；reason 必填） */
export interface UnlinkRelationPayload extends LinkRelationPayload {
  reason: string;
}

/** 批量关系双向查询载荷（忠实于后端 BatchRelationQueryRequest；objects 非空） */
export interface BatchRelationQueryPayload {
  objects: AlmObjectKey[];
  direction?: AlmRelationDirection;
  relationTypes?: AlmRelationType[];
  activeOnly?: boolean;
}

/** 关系（后端 AlmRelationResponse；实现拼装字段，P3 只做只读渲染） */
export type AlmRelation = Record<string, unknown>;

/** 批量关系查询结果（后端 BatchRelationResponse；实现拼装） */
export type BatchRelationResult = Record<string, unknown>;

/** 需求追溯详情（GET requirement/v1/trace/{requirementId}，实现拼装） */
export type RequirementTrace = Record<string, unknown>;

/** 需求影响范围（GET requirement/v1/trace/{requirementId}/impact，实现拼装） */
export type RequirementImpact = Record<string, unknown>;
