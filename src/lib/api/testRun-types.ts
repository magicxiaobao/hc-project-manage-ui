/**
 * P2 测试轮（TestRun）契约类型。
 *
 * 忠实映射 hc-project-manage 后端 TestRunController（/testRun/v1）：
 * - POST /testRun/v1/full-regressions、ad-hoc-runs、targeted-retests（三种建轮）
 * - POST /testRun/v1/{testRunId}/start、complete、cancel（cancel 请求体为 { reason }，老前端做 trim）
 * - GET /testRun/v1/{testRunId}（轮详情，run + cases 稳定顺序）
 * - POST /testRun/v1/findByPage（projectId/versionId 至少一个有效）
 * - GET /testRun/v1/{testRunId}/report（测试报告；report/export 为导出能力，P2 明确排除，不建模）
 * - ⚠️ 老前端 frontend/src/api/testRun.ts 额外混入了 testExecution 能力（startExecution/
 *   completeExecution/retryExecution/createDefect/linkDefect），此处拆分到
 *   src/lib/api/testExecution.ts（/testExecution/v1），与后端 controller 边界对齐。
 * - 时间字段：后端 Instant 序列化为 ISO-8601 字符串，前端用 string。
 */

/** 测试轮状态（TestRunStatus 四态） */
export const TEST_RUN_STATUSES = [
  'CREATED',
  'RUNNING',
  'COMPLETED',
  'CANCELLED',
] as const;
export type TestRunStatus = (typeof TEST_RUN_STATUSES)[number];

/** 测试轮状态中文文案 */
export const TEST_RUN_STATUS_LABELS: Record<TestRunStatus, string> = {
  CREATED: '已创建',
  RUNNING: '执行中',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
};

/** 测试轮类型（TestRunType 三态） */
export const TEST_RUN_TYPES = [
  'FULL_REGRESSION',
  'TARGETED_RETEST',
  'AD_HOC',
] as const;
export type TestRunType = (typeof TEST_RUN_TYPES)[number];

/** 测试轮类型中文文案 */
export const TEST_RUN_TYPE_LABELS: Record<TestRunType, string> = {
  FULL_REGRESSION: '全量回归',
  TARGETED_RETEST: '定向复测',
  AD_HOC: '即席测试',
};

/** 执行状态（TestExecutionStatus 四态） */
export const TEST_EXECUTION_STATUSES = [
  'NOT_STARTED',
  'RUNNING',
  'COMPLETED',
  'CANCELLED',
] as const;
export type TestExecutionStatus = (typeof TEST_EXECUTION_STATUSES)[number];

/** 执行状态中文文案 */
export const TEST_EXECUTION_STATUS_LABELS: Record<TestExecutionStatus, string> = {
  NOT_STARTED: '未开始',
  RUNNING: '执行中',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
};

/** 执行结果（TestExecutionResult 四态） */
export const TEST_EXECUTION_RESULTS = [
  'PASSED',
  'FAILED',
  'BLOCKED',
  'SKIPPED',
] as const;
export type TestExecutionResult = (typeof TEST_EXECUTION_RESULTS)[number];

/** 执行结果中文文案 */
export const TEST_EXECUTION_RESULT_LABELS: Record<TestExecutionResult, string> = {
  PASSED: '通过',
  FAILED: '失败',
  BLOCKED: '阻塞',
  SKIPPED: '跳过',
};

/** 报告证据状态（TestRunReportEvidenceState） */
export const TEST_RUN_REPORT_EVIDENCE_STATES = [
  'OFFICIAL',
  'SUPERSEDED',
  'STALE_SCOPE',
  'NON_OFFICIAL',
] as const;
export type TestRunReportEvidenceState =
  (typeof TEST_RUN_REPORT_EVIDENCE_STATES)[number];

/** 全量回归建轮载荷（忠实于后端 CreateFullRegressionRequest） */
export interface CreateFullRegressionPayload {
  versionId: number;
  runName: string;
  environment?: string;
}

/** 即席建轮的一项选择（忠实于后端 AdHocRunSelection） */
export interface AdHocRunSelection {
  selectionType: 'TEST_SUITE' | 'TEST_CASE';
  id: number;
}

/** 即席建轮载荷（忠实于后端 CreateAdHocRunRequest） */
export interface CreateAdHocRunPayload {
  projectId: number;
  runName: string;
  environment?: string;
  selections: AdHocRunSelection[];
}

/** 定向复测建轮载荷（忠实于后端 CreateTargetedRetestRequest） */
export interface CreateTargetedRetestPayload {
  sourceRunId: number;
  sourceRunCaseIds: number[];
  runName: string;
  environment?: string;
}

/** 取消测试轮载荷（忠实于后端 CancelTestRunRequest；老前端对 reason 做 trim） */
export interface CancelTestRunPayload {
  reason: string;
}

/**
 * 测试轮查询条件（忠实于后端 TestRunQuery）。
 * 后端 findByPage 显式校验 "projectId/versionId 至少一个有效"（ParamSetIllegal），
 * 因此两者均为可选但至少传其一。
 */
export interface TestRunQueryRequest {
  projectId?: number;
  versionId?: number;
  runType?: TestRunType;
  status?: TestRunStatus;
  createdTimeFrom?: string;
  createdTimeTo?: string;
}

/** 测试轮（忠实于后端 TestRunResponse；标量可为 null，Jackson 透出惯例） */
export interface TestRunResponse {
  id: number;
  projectId: number | null;
  runName: string | null;
  runType: TestRunType | null;
  status: TestRunStatus | null;
  environment: string | null;
  sourceRunId: number | null;
  versionId: number | null;
  scopeFingerprint: string | null;
  requiredCaseCount: number | null;
  startedBy: number | null;
  startedAt: string | null;
  completedBy: number | null;
  completedAt: string | null;
  cancelledBy: number | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** 测试轮详情（忠实于后端 TestRunDetailResponse：run + cases） */
export interface TestRunDetailResponse {
  run: TestRunResponse;
  cases: TestRunCaseDetailResponse[];
}

/** 用例快照（忠实于后端 TestRunCaseDetailResponse.Snapshot：建轮时冻结的业务内容） */
export interface TestRunCaseSnapshot {
  caseNumber: string | null;
  title: string | null;
  description: string | null;
  testType: string | null;
  priority: string | null;
  preconditions: string | null;
  testSteps: string | null;
  expectedResult: string | null;
  testData: string | null;
  environmentRequirements: string | null;
  estimatedDuration: number | null;
  tags: string | null;
}

/** 缺陷实时摘要（忠实于后端 TestRunCaseDetailResponse.DefectSummary） */
export interface TestRunDefectSummary {
  defectId: number;
  title: string | null;
  liveStatus: string | null;
  severity: string | null;
}

/** 轮内用例详情（忠实于后端 TestRunCaseDetailResponse） */
export interface TestRunCaseDetailResponse {
  runCaseId: number;
  testCaseId: number | null;
  displayOrder: number | null;
  snapshot: TestRunCaseSnapshot | null;
  latestAttempt: TestExecutionResponse | null;
  attempts: TestExecutionResponse[];
  defects: TestRunDefectSummary[];
}

/** 执行记录（忠实于后端 TestExecutionResponse；标量可为 null） */
export interface TestExecutionResponse {
  id: number;
  runCaseId: number;
  attemptNo: number | null;
  status: TestExecutionStatus | null;
  result: TestExecutionResult | null;
  actualResult: string | null;
  failureMessage: string | null;
  executionNotes: string | null;
  evidenceScreenshotAttached: boolean | null;
  evidenceLogAttached: boolean | null;
  executedBy: number | null;
  completedBy: number | null;
  actualStartTime: string | null;
  actualEndTime: string | null;
  duration: number | null;
  cancelledBy: number | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** 报告结果计数（忠实于后端 TestRunResultCounts） */
export interface TestRunResultCounts {
  passed: number | null;
  failed: number | null;
  blocked: number | null;
  skipped: number | null;
}

/** 报告聚合摘要（忠实于后端 TestRunReportSummary；rate 为 0～1 小数） */
export interface TestRunReportSummary {
  runCaseCount: number | null;
  executedCaseCount: number | null;
  durationSeconds: number | null;
  executionCoverage: number | null;
  passRate: number | null;
  versionEvidenceState: TestRunReportEvidenceState | null;
}

/** 测试报告（忠实于后端 TestRunReportResponse） */
export interface TestRunReportResponse {
  run: TestRunResponse;
  summary: TestRunReportSummary;
  resultCounts: TestRunResultCounts;
  cases: TestRunCaseDetailResponse[];
  defects: TestRunDefectSummary[];
  generatedAt: string;
}
