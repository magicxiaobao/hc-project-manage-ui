/**
 * P2 发布契约类型。
 *
 * 忠实映射 hc-project-manage 后端 ReleaseController（release/v1）+ 相关枚举：
 * - status 七态：DRAFT（草稿）/PENDING_APPROVAL（待审批）/APPROVED（已批准）/
 *   REJECTED（已驳回）/RELEASED（已发布）/FAILED（发布失败）/CANCELLED（已取消）
 * - type 两态：STANDARD（标准发布）/ROLLBACK（回滚发布）
 * - 门禁类型五项：DIRECT_REQUIREMENT_SCOPE（直接需求范围）/
 *   REQUIRED_CASES_PASSED（必测用例通过）/NO_BLOCKING_DEFECT（无阻断缺陷）/
 *   RELEASE_NOTES_COMPLETE（发布说明完整）/ROLLBACK_PLAN_COMPLETE（回滚方案完整）
 * - 状态变更多为 POST 且 id 拼在路径上；previewGates 为 GET
 * - 发布分页查询 bean：projectId/versionId 二选一必填（fail-closed，忠实老前端
 *   ReleasePageRequest 联合；后端 ReleasePageRequest 自身三字段全可选）
 * - 日期：Instant 序列化为 ISO 字符串；统计计数为 Integer|Long，标量可为 null
 * - waive/revoke 门禁豁免、approve/reject/cancel 审批取消均要求 project:admin 权限，
 *   后端 permission check 显式标注，前端不对此做本地门禁（权限路由在 P5 建模）
 */

/** 发布状态（七态） */
export const RELEASE_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'RELEASED',
  'FAILED',
  'CANCELLED',
] as const;
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];

/** 发布状态中文文案（忠实老前端 releaseStatusLabels） */
export const RELEASE_STATUS_LABELS: Record<ReleaseStatus, string> = {
  DRAFT: '草稿',
  PENDING_APPROVAL: '待审批',
  APPROVED: '已批准',
  REJECTED: '已驳回',
  RELEASED: '已发布',
  FAILED: '发布失败',
  CANCELLED: '已取消',
};

/** 发布类型（两态） */
export const RELEASE_TYPES = ['STANDARD', 'ROLLBACK'] as const;
export type ReleaseType = (typeof RELEASE_TYPES)[number];

/** 发布类型中文文案（忠实老前端 releaseTypeLabels） */
export const RELEASE_TYPE_LABELS: Record<ReleaseType, string> = {
  STANDARD: '标准发布',
  ROLLBACK: '回滚发布',
};

/** 发布门禁类型（五项，发布提交时固定裁决） */
export const RELEASE_GATE_TYPES = [
  'DIRECT_REQUIREMENT_SCOPE',
  'REQUIRED_CASES_PASSED',
  'NO_BLOCKING_DEFECT',
  'RELEASE_NOTES_COMPLETE',
  'ROLLBACK_PLAN_COMPLETE',
] as const;
export type ReleaseGateType = (typeof RELEASE_GATE_TYPES)[number];

/** 发布门禁类型中文文案（忠实老前端 gateTypeLabels） */
export const RELEASE_GATE_TYPE_LABELS: Record<ReleaseGateType, string> = {
  DIRECT_REQUIREMENT_SCOPE: '直接需求范围',
  REQUIRED_CASES_PASSED: '必测用例通过',
  NO_BLOCKING_DEFECT: '无阻断缺陷',
  RELEASE_NOTES_COMPLETE: '发布说明完整',
  ROLLBACK_PLAN_COMPLETE: '回滚方案完整',
};

import type { ReleaseEnvironmentCategory } from './releaseEnvironment-types';

/** 测试证据状态（追溯域 VersionTestEvidenceState；发布快照计算口径） */
export const RELEASE_TEST_EVIDENCE_STATES = [
  'AVAILABLE',
  'NO_REQUIRED_CASE',
  'NO_FULL_REGRESSION',
  'STALE_SCOPE',
] as const;
export type ReleaseTestEvidenceState = (typeof RELEASE_TEST_EVIDENCE_STATES)[number];

/** ALM 对象类型（发布范围快照节点/边，忠实追溯域 AlmObjectType） */
export type ReleaseAlmObjectType =
  | 'REQUIREMENT'
  | 'TASK'
  | 'TEST_CASE'
  | 'TEST_RUN'
  | 'TEST_EXECUTION'
  | 'DEFECT'
  | 'VERSION';

/** ALM 关系类型（发布范围快照边，忠实追溯域 AlmRelationType） */
export type ReleaseAlmRelationType =
  | 'TASK_IMPLEMENTS_REQUIREMENT'
  | 'TEST_CASE_VERIFIES_REQUIREMENT'
  | 'DEFECT_AFFECTS_REQUIREMENT'
  | 'DEFECT_FOUND_IN_TASK'
  | 'TEST_EXECUTION_DISCOVERS_DEFECT'
  | 'TEST_RUN_VALIDATES_VERSION'
  | 'VERSION_CONTAINS_REQUIREMENT'
  | 'VERSION_CONTAINS_TASK'
  | 'VERSION_CONTAINS_DEFECT';

/** 发布范围节点角色（忠实后端 ReleaseScopeNodeRole） */
export type ReleaseScopeNodeRole =
  | 'VERSION_ROOT'
  | 'DIRECT_REQUIREMENT'
  | 'DIRECT_TASK'
  | 'DERIVED_TASK'
  | 'REQUIRED_TEST_CASE'
  | 'EVIDENCE_TEST_CASE'
  | 'EVIDENCE_TEST_RUN'
  | 'EVIDENCE_TEST_EXECUTION'
  | 'DIRECT_DEFECT'
  | 'REACHABLE_DEFECT';

/** 范围快照执行状态（忠实追溯域 VersionScopeExecutionStatus） */
export type ReleaseScopeExecutionStatus = 'NOT_STARTED' | 'RUNNING' | 'COMPLETED' | 'CANCELLED';

/** 范围快照执行结果（忠实追溯域 VersionScopeExecutionResult） */
export type ReleaseScopeExecutionResult = 'PASSED' | 'FAILED' | 'BLOCKED' | 'SKIPPED';

/** 发布就绪缺陷状态（忠实后端 ReleaseReadinessDefectStatus） */
export type ReleaseReadinessDefectStatus =
  | 'NEW'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'PENDING_VERIFICATION'
  | 'RESOLVED'
  | 'CLOSED'
  | 'REOPEN'
  | 'REJECTED'
  | 'VERIFIED'
  | 'TESTING';

/** 发布就绪缺陷严重度（忠实后端 ReleaseReadinessDefectSeverity） */
export type ReleaseReadinessDefectSeverity =
  | 'BLOCKER'
  | 'CRITICAL'
  | 'MAJOR'
  | 'NORMAL'
  | 'MINOR'
  | 'TRIVIAL';

/** 发布响应（忠实于后端 ReleaseResponse record；标量可为 null；时间均为 Instant ISO 字符串） */
export interface ReleaseResponse {
  id: number;
  projectId: number;
  versionId: number;
  environmentId: number;
  releaseType: ReleaseType;
  rollbackOfReleaseId: number | null;
  copySourceReleaseId: number | null;
  sequenceNo: number;
  status: ReleaseStatus;
  releaseNotes: string | null;
  changelog: string | null;
  rollbackPlan: string | null;
  knownIssues: string | null;
  forceUpdate: boolean | null;
  compatibility: string | null;
  dependencies: string | null;
  environmentCategory: ReleaseEnvironmentCategory;
  environmentApprovalRequired: boolean;
  draftOwnerId: number | null;
  proposerId: number | null;
  testEvidenceState: ReleaseTestEvidenceState | null;
  evidenceRunId: number | null;
  scopeFingerprint: string | null;
  requiredCaseCount: number | null;
  executedCaseCount: number | null;
  passedCaseCount: number | null;
  failedCaseCount: number | null;
  blockedCaseCount: number | null;
  skippedCaseCount: number | null;
  snapshotCalculatedAt: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  releasedAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
}

/** 发布门禁裁决（忠实于后端 ReleaseGateDecision record；previewGates 返回数组） */
export interface ReleaseGateDecision {
  gateType: ReleaseGateType;
  passed: boolean;
  waived: boolean;
  waiverActorId: number | null;
  waiverReason: string | null;
  evaluatedAt: string;
}

/** 门禁裁决结果（详情页 gateResults；忠实后端 GateResultResponse） */
export interface ReleaseGateResultResponse {
  gateType: ReleaseGateType;
  passed: boolean;
  waived: boolean;
  waiverActorId: number | null;
  waiverReason: string | null;
  waivedAt: string | null;
}

/** 门禁豁免记录（详情页 waivers；忠实后端 GateWaiverResponse） */
export interface ReleaseGateWaiverResponse {
  gateType: ReleaseGateType;
  reason: string;
  actorId: number;
}

/** 审批决策（详情页 approval；忠实后端 ApprovalResponse） */
export interface ReleaseApprovalResponse {
  decision: ReleaseStatus;
  approverId: number;
  reason: string;
  decidedAt: string;
}

/** 构建产物证据（详情页 artifact；忠实后端 ArtifactEvidenceResponse） */
export interface ReleaseArtifactEvidenceResponse {
  buildNumber: string | null;
  artifactLocation: string | null;
  fileSize: number | null;
  fileHash: string | null;
  resultNotes: string | null;
  trustLevel: 'MANUAL_REFERENCE';
  recordedBy: number;
  recordedAt: string;
}

/** 范围快照节点（详情页 scopeNodes；忠实后端 ScopeNodeResponse） */
export interface ReleaseScopeNodeResponse {
  projectId: number;
  objectType: ReleaseAlmObjectType;
  objectId: number;
  role: ReleaseScopeNodeRole;
}

/** 范围快照关系（详情页 scopeRelations；忠实后端 ScopeRelationResponse） */
export interface ReleaseScopeRelationResponse {
  projectId: number;
  sourceType: ReleaseAlmObjectType;
  sourceId: number;
  relationType: ReleaseAlmRelationType;
  targetType: ReleaseAlmObjectType;
  targetId: number;
}

/** 测试证据（详情页 testAttempts；忠实后端 TestEvidenceResponse） */
export interface ReleaseTestEvidenceResponse {
  projectId: number;
  testCaseId: number;
  runCaseId: number;
  evidenceRunId: number;
  testExecutionId: number;
  attemptNo: number;
  executionStatus: ReleaseScopeExecutionStatus;
  result: ReleaseScopeExecutionResult;
}

/** 缺陷证据（详情页 defects；忠实后端 DefectEvidenceResponse） */
export interface ReleaseDefectEvidenceResponse {
  projectId: number;
  defectId: number;
  status: ReleaseReadinessDefectStatus;
  severity: ReleaseReadinessDefectSeverity;
}

/** 发布详情（忠实于后端 ReleaseDetailResponse；P2 后续切片用发布详情全生命周期时消费） */
export interface ReleaseDetailResponse {
  release: ReleaseResponse;
  scopeNodes: ReleaseScopeNodeResponse[];
  scopeRelations: ReleaseScopeRelationResponse[];
  testAttempts: ReleaseTestEvidenceResponse[];
  defects: ReleaseDefectEvidenceResponse[];
  gateResults: ReleaseGateResultResponse[];
  waivers: ReleaseGateWaiverResponse[];
  approval: ReleaseApprovalResponse | null;
  artifact: ReleaseArtifactEvidenceResponse | null;
}

/** 创建发布草稿载荷（忠实于后端 ReleaseCreateRequest） */
export interface ReleaseCreatePayload {
  versionId: number;
  environmentId: number;
  idempotencyKey: string;
  releaseNotes?: string;
  changelog?: string;
  rollbackPlan?: string;
  knownIssues?: string;
  forceUpdate?: boolean;
  compatibility?: string;
  dependencies?: string;
}

/**
 * 更新发布草稿载荷（忠实于后端 ReleaseDraftService.updateDraft →
 * ReleaseRepository.updateDraft：整包覆盖语义，绝非"字段级更新"）。
 * 省略的字段会被写成 null（releaseNotes/changelog/rollbackPlan/knownIssues/
 * compatibility/dependencies），forceUpdate 省略则回退为 false
 * （后端 Boolean.TRUE.equals）。想保留现有值必须把该字段的现值一起送出；
 * 想清空则显式省略该字段。
 */
export interface ReleaseDraftUpdatePayload
  extends Omit<ReleaseCreatePayload, 'versionId' | 'environmentId' | 'idempotencyKey'> {
  id: number;
  adminReason?: string;
}

/**
 * 发布分页查询条件（fail-closed：projectId/versionId 二选一必填，忠实老前端
 * ReleasePageRequest 联合口径；environmentId 可选）。
 */
export type ReleasePageQuery =
  | { projectId: number; versionId?: number; environmentId?: number }
  | { projectId?: never; versionId: number; environmentId?: number };

/** 门禁豁免/撤销豁免载荷（忠实于后端 ReleaseWaiverRequest） */
export interface ReleaseWaiverPayload {
  gateType: ReleaseGateType;
  reason: string;
}

/** 审批/驳回/取消载荷（忠实于后端 ReleaseReasonRequest） */
export interface ReleaseReasonPayload {
  reason: string;
}

/**
 * 记录发布成功载荷（忠实于后端 ReleaseResultService.validateReleased）：
 * - buildNumber/artifactLocation/fileHash 均必填且非空白（后端 trimToNull 后判空）；
 * - fileSize 可选，但若传则必须 ≥0（负数直接 ReleaseEvidenceInvalid）；
 * - resultNotes 可选（附言）。
 */
export interface ReleaseSuccessPayload {
  buildNumber: string;
  artifactLocation: string;
  fileSize?: number;
  fileHash: string;
  resultNotes?: string;
}

/**
 * 记录发布失败载荷（忠实于后端 ReleaseResultService.validateFailed）：
 * - resultNotes 必填（非空）；
 * - 证据完整性约束：三件套（buildNumber/artifactLocation/fileHash）齐全
 *   （fileSize 可选，若传须 ≥0），或四项（buildNumber/artifactLocation/
 *   fileHash/fileSize）全空——半套（只给其中几个）直接抛 ReleaseEvidenceInvalid。
 *   全空 = 无制品证据；三件套齐全 = 附制品证据；
 * - fileSize 若传则必须 ≥0。
 */
export type ReleaseFailurePayload = { resultNotes: string } & (
  | {
      /** 无制品证据分支：四个证据字段必须全空（给任何一个都不合法） */
      buildNumber?: never;
      artifactLocation?: never;
      fileSize?: never;
      fileHash?: never;
    }
  | {
      /** 有制品证据分支：三件套必填非空；fileSize 可选，若传须 ≥0 */
      buildNumber: string;
      artifactLocation: string;
      fileSize?: number;
      fileHash: string;
    }
);

/** 复制/回滚为草稿载荷（忠实于后端 ReleaseCloneRequest） */
export interface ReleaseClonePayload {
  idempotencyKey: string;
}

/** 删除草稿载荷（忠实于后端 ReleaseAdminReasonRequest；body 本身可选） */
export interface ReleaseDeleteDraftPayload {
  adminReason: string;
}
