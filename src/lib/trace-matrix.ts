import type {
  RequirementMatrixQuery,
  RequirementMatrixRow,
  TraceNodeSummary,
} from "./api/trace-types";
import type { PageResult } from "./api/types";

export const MATRIX_PAGE_SIZE = 20;
export const MATRIX_STATUS_FIELDS = [
  "requirementStatus",
  "taskStatus",
  "testCaseStatus",
  "defectStatus",
] as const;
export type MatrixFilters = Partial<
  Pick<RequirementMatrixQuery, (typeof MATRIX_STATUS_FIELDS)[number]>
>;

export function normalizeMatrixParams(
  params: {
    page?: number;
    pageSize?: number;
    projectId?: number | null;
    bean?: Partial<RequirementMatrixQuery>;
  } = {},
) {
  const bean: RequirementMatrixQuery = { projectId: params.projectId ?? 0 };
  for (const field of MATRIX_STATUS_FIELDS) {
    const value = params.bean?.[field];
    if (value) bean[field] = value;
  }
  if (params.bean?.requirementId !== undefined) bean.requirementId = params.bean.requirementId;
  if (params.bean?.versionStatus) bean.versionStatus = params.bean.versionStatus;
  return { page: params.page ?? 1, pageSize: MATRIX_PAGE_SIZE, bean };
}

export function matrixTotalPages(total: number) {
  return Math.max(1, Math.ceil(total / MATRIX_PAGE_SIZE));
}

/** 仅生成展示投影，响应和服务端需求总数保持不变。 */
export function matrixColumnNodes(nodes: TraceNodeSummary[], status?: string) {
  return status ? nodes.filter((node) => node.status === status) : nodes;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
const positiveId = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const nullableString = (value: unknown) => value == null || typeof value === "string";

function node(value: unknown, type: string): boolean {
  if (
    !record(value) ||
    value.objectType !== type ||
    !positiveId(value.objectId) ||
    !nullableString(value.displayName) ||
    !nullableString(value.status) ||
    value.direct !== true ||
    value.runId != null ||
    value.runType != null ||
    !Array.isArray(value.path) ||
    !value.path.length
  )
    return false;
  if (
    !value.path.every(
      (key) => record(key) && typeof key.objectType === "string" && positiveId(key.objectId),
    )
  )
    return false;
  const last = value.path[value.path.length - 1];
  return last.objectType === type && last.objectId === value.objectId;
}

/** 非法成功响应必须走错误态，不能把 null 数组等降级为未覆盖。 */
export function assertMatrixPage(
  value: unknown,
): asserts value is PageResult<RequirementMatrixRow> {
  const invalid = () => {
    throw new Error("响应契约错误：需求追溯矩阵数据不完整");
  };
  if (
    !record(value) ||
    !Array.isArray(value.list) ||
    !count(value.total) ||
    !positiveId(value.pageNumber) ||
    value.pageSize !== MATRIX_PAGE_SIZE
  )
    return invalid();
  for (const row of value.list) {
    if (!record(row) || !node(row.requirement, "REQUIREMENT")) return invalid();
    for (const [field, type] of [
      ["taskSummaries", "TASK"],
      ["testCaseSummaries", "TEST_CASE"],
      ["defectSummaries", "DEFECT"],
    ]) {
      const nodes = row[field];
      if (!Array.isArray(nodes) || !nodes.every((item) => node(item, type))) return invalid();
    }
    const bucket = row.versionEvidence;
    if (
      !record(bucket) ||
      !Array.isArray(bucket.items) ||
      !count(bucket.total) ||
      bucket.total < bucket.items.length ||
      bucket.truncated !== bucket.total > bucket.items.length
    )
      return invalid();
    for (const item of bucket.items) {
      if (
        !record(item) ||
        !positiveId(item.versionId) ||
        !nullableString(item.versionName) ||
        !nullableString(item.versionStatus) ||
        !["AVAILABLE", "NO_REQUIRED_CASE", "NO_FULL_REGRESSION", "STALE_SCOPE"].includes(
          String(item.testEvidenceState),
        ) ||
        !Array.isArray(item.latestExecutionSummaries) ||
        (item.evidenceRunId != null && !positiveId(item.evidenceRunId))
      )
        return invalid();
      if (
        item.testEvidenceState !== "AVAILABLE" &&
        (item.evidenceRunId != null || item.latestExecutionSummaries.length)
      )
        return invalid();
      for (const attempt of item.latestExecutionSummaries) {
        if (
          !record(attempt) ||
          !positiveId(attempt.runCaseId) ||
          !positiveId(attempt.testCaseId) ||
          !positiveId(attempt.executionId) ||
          !positiveId(attempt.attemptNo) ||
          !["NOT_STARTED", "RUNNING", "COMPLETED", "CANCELLED"].includes(String(attempt.status)) ||
          !["PASSED", "FAILED", "BLOCKED", "SKIPPED"].includes(String(attempt.result))
        )
          return invalid();
      }
    }
  }
}
