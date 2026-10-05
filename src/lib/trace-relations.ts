import {
  ALM_OBJECT_TYPES,
  ALM_RELATION_TYPES,
  type AlmObjectKey,
  type AlmObjectType,
  type AlmRelation,
  type AlmRelationType,
  type BatchRelationQueryPayload,
  type BatchRelationResult,
  type LinkRelationPayload,
} from "./api/trace-types";
import { ApiBusinessError, HttpResponseError } from "./api/client";
import { toUserMessage } from "./query/error";
import { isPositiveSafeId } from "./task-dependencies-live";
export { isPositiveSafeId };

export const OBJECT_LABELS: Record<AlmObjectType, string> = {
  TASK: "任务",
  REQUIREMENT: "需求",
  DEFECT: "缺陷",
  TEST_CASE: "测试用例",
  TEST_RUN: "测试运行",
  TEST_EXECUTION: "测试执行",
  VERSION: "版本",
};
export const RELATION_LABELS: Record<AlmRelationType, string> = {
  TASK_IMPLEMENTS_REQUIREMENT: "任务实现需求",
  TEST_CASE_VERIFIES_REQUIREMENT: "用例验证需求",
  DEFECT_AFFECTS_REQUIREMENT: "缺陷影响需求",
  DEFECT_FOUND_IN_TASK: "缺陷发现于任务",
  TEST_EXECUTION_DISCOVERS_DEFECT: "测试执行发现缺陷",
  TEST_RUN_VALIDATES_VERSION: "测试运行验证版本",
  VERSION_CONTAINS_REQUIREMENT: "版本包含需求",
  VERSION_CONTAINS_TASK: "版本包含任务",
  VERSION_CONTAINS_DEFECT: "版本包含缺陷",
};
export const MANUAL_RELATION_TYPES: readonly AlmRelationType[] = [
  "TASK_IMPLEMENTS_REQUIREMENT",
  "TEST_CASE_VERIFIES_REQUIREMENT",
  "DEFECT_AFFECTS_REQUIREMENT",
  "DEFECT_FOUND_IN_TASK",
];
export const canUnlinkRelation = (row: AlmRelation) =>
  row.status === "ACTIVE" && MANUAL_RELATION_TYPES.includes(row.relationType);
export const objectKey = (object: AlmObjectKey) => `${object.objectType}:${object.objectId}`;
export const sameObject = (a: AlmObjectKey, b: AlmObjectKey) => objectKey(a) === objectKey(b);
export function objectLabel(object: AlmObjectKey, title?: string | null) {
  return `${OBJECT_LABELS[object.objectType]} #${object.objectId}${typeof title === "string" && title.trim() ? ` ${title}` : ""}`;
}
export function relationPayload(row: AlmRelation): LinkRelationPayload {
  return {
    sourceType: row.sourceObject.objectType,
    sourceId: row.sourceObject.objectId,
    relationType: row.relationType,
    targetType: row.targetObject.objectType,
    targetId: row.targetObject.objectId,
  };
}
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
export function isObjectKey(value: unknown): value is AlmObjectKey {
  return (
    record(value) &&
    ALM_OBJECT_TYPES.includes(value.objectType as AlmObjectType) &&
    isPositiveSafeId(value.objectId)
  );
}
function contractError(): never {
  throw new Error("响应契约错误：关联对象分组或关系字段无效");
}
/** 只校验列表/操作消费的主体；不为待联调的 Actor/Instant 增加非空或格式断言。 */
export function assertRelation(value: unknown): asserts value is AlmRelation {
  if (
    !record(value) ||
    !isPositiveSafeId(value.id) ||
    !isPositiveSafeId(value.projectId) ||
    !isObjectKey(value.sourceObject) ||
    !isObjectKey(value.targetObject) ||
    !ALM_RELATION_TYPES.includes(value.relationType as AlmRelationType) ||
    !["ACTIVE", "INACTIVE"].includes(value.status as string) ||
    !["BUSINESS_ACTION", "MANUAL"].includes(value.relationSource as string)
  )
    contractError();
}
export function assertBatchRelations(value: unknown): asserts value is BatchRelationResult {
  if (!record(value) || !Array.isArray(value.items)) contractError();
  const groups = new Set<string>();
  for (const item of value.items) {
    if (
      !record(item) ||
      !isObjectKey(item.object) ||
      !Array.isArray(item.outgoing) ||
      !Array.isArray(item.incoming)
    )
      contractError();
    const key = objectKey(item.object);
    if (groups.has(key)) contractError();
    groups.add(key);
    for (const direction of ["outgoing", "incoming"] as const) {
      const rows = item[direction];
      if (!Array.isArray(rows)) contractError();
      for (const row of rows) {
        assertRelation(row);
        if (
          !sameObject(direction === "outgoing" ? row.sourceObject : row.targetObject, item.object)
        )
          contractError();
      }
    }
  }
}
export function relationsForObject(value: unknown, object: AlmObjectKey) {
  assertBatchRelations(value);
  const item = value.items.find((item) => sameObject(item.object, object));
  if (!item) contractError();
  const seen = new Set<number>();
  const unique = (rows: AlmRelation[]) =>
    rows.filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
  return { outgoing: unique(item.outgoing), incoming: unique(item.incoming) };
}
export function normalizeRelationQuery(
  objects: readonly AlmObjectKey[],
  relationTypes: readonly AlmRelationType[] = [],
): BatchRelationQueryPayload {
  const byKey = new Map(objects.map((object) => [objectKey(object), { ...object }]));
  return {
    objects: [...byKey.values()].sort(
      (a, b) => a.objectType.localeCompare(b.objectType) || a.objectId - b.objectId,
    ),
    direction: "BOTH",
    relationTypes: [...new Set(relationTypes)].sort(),
    activeOnly: true,
  };
}
export function validRelationQuery(
  projectId: unknown,
  objects: readonly AlmObjectKey[],
  verified: boolean,
) {
  return (
    verified &&
    isPositiveSafeId(projectId) &&
    objects.length > 0 &&
    objects.length <= 200 &&
    objects.every(isObjectKey)
  );
}
/** 无明确业务拒绝信号的写入失败须先权威重查，禁止盲目重复解除。 */
export function isUncertainRelationWrite(error: unknown) {
  if (error instanceof ApiBusinessError || error instanceof HttpResponseError)
    return error.httpStatus >= 500;
  return true;
}
export function relationWriteMessage(error: unknown) {
  if (error instanceof ApiBusinessError && error.code === 10018)
    return `${toUserMessage(error)}。该关系已失活，不能重新创建，此页面不提供恢复入口。`;
  if (error instanceof ApiBusinessError && error.code === 10019)
    return `${toUserMessage(error)}。关系可能已变更，请先重查关联。`;
  return `${toUserMessage(error)}${isUncertainRelationWrite(error) ? "。写入结果尚不确定，请先重查关联再决定是否重试。" : ""}`;
}
