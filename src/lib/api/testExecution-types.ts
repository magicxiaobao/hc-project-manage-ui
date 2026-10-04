/**
 * P2 执行记录（TestExecution）契约类型。
 *
 * 忠实映射 hc-project-manage 后端 TestExecutionController（/testExecution/v1）：
 * - POST /testExecution/v1/{executionId}/start（开始执行，无请求体）
 * - POST /testExecution/v1/{executionId}/complete（完成执行，载荷含 actualResult 等）
 * - POST /testExecution/v1/{executionId}/retry（重试：开新 attempt，请求体为 { reason }，
 *   老前端做 trim）
 * - POST /testExecution/v1/{executionId}/defects（执行中建缺陷→ExecutionDefectResponse；
 *   项目与报告人由服务端可信事实填充，前端不传 projectId/reporterId）
 * - POST /testExecution/v1/{executionId}/defect-links（关联已有缺陷，请求体为 { defectId }）
 */
/**
 * 执行→缺陷结果（忠实于后端 ExecutionDefectResponse）。
 * relation 为追溯域 AlmRelationView 的 JSON 投影（关联关系快照），P3 前只读透传。
 */
export interface ExecutionDefectResponse {
  executionId: number;
  operation: ExecutionDefectOperation;
  defect: ExecutionDefectSummary;
  relation: Record<string, unknown> | null;
  occurredAt: string;
}

/**
 * 完成执行载荷（忠实于后端 CompleteExecutionRequest 全字段）。
 * result 为后端 record 的必填分量（TestExecutionResult，复用 testRun-types 的
 * 四态联合：PASSED/FAILED/BLOCKED/SKIPPED），服务在为空时直接拒绝；其余字段可选。
 * evidence*DocumentId 指向附件域文档 id（P2 不接入附件上传）。
 */
export type { TestExecutionResult } from './testRun-types';
import type { TestExecutionResult } from './testRun-types';

export interface CompleteExecutionPayload {
  /** 执行结果（必填，后端拒绝空值） */
  result: TestExecutionResult;
  actualResult?: string;
  failureMessage?: string;
  executionNotes?: string;
  evidenceScreenshotDocumentId?: number;
  evidenceLogDocumentId?: number;
  overrideReason?: string;
}

/** 重试执行载荷（忠实于后端 RetryExecutionRequest；老前端对 reason 做 trim） */
export interface RetryExecutionPayload {
  reason: string;
}

/**
 * 执行中建缺陷载荷（忠实于后端 CreateDefectFromExecutionRequest）。
 * estimatedFixDate 为 Instant 序列化 ISO 字符串；attachments/tags 为逗号分隔字符串（与老前端一致）。
 */
export interface CreateExecutionDefectPayload {
  title: string;
  description?: string;
  defectType?: string;
  severity?: string;
  priority?: string;
  assigneeId?: number;
  estimatedFixDate?: string;
  reproductionSteps?: string;
  expectedResult?: string;
  actualResult?: string;
  environment?: string;
  attachments?: string;
  tags?: string;
}

/** 关联已有缺陷载荷（忠实于后端 LinkExistingDefectRequest） */
export interface LinkExistingDefectPayload {
  defectId: number;
}

/** 执行→缺陷操作类型（忠实于后端 ExecutionDefectResponse.Operation） */
export type ExecutionDefectOperation = 'CREATED' | 'LINKED' | 'ALREADY_LINKED';

/** 执行→缺陷结果摘要（忠实于后端 ExecutionDefectResponse.DefectSummary） */
export interface ExecutionDefectSummary {
  id: number;
  title: string | null;
  status: string | null;
  severity: string | null;
  assigneeId: number | null;
}
