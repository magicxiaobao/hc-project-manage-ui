import type { AlmRelation, BatchRelationResult } from "../../api/trace-types";

/** 源码字段 fixture；null 时间/Actor 不代表实测非空性或 Instant wire 格式。 */
export const relationFixture = (overrides: Partial<AlmRelation> = {}): AlmRelation => ({
  id: 91,
  projectId: 7,
  sourceObject: { objectType: "TASK", objectId: 201 },
  relationType: "TASK_IMPLEMENTS_REQUIREMENT",
  targetObject: { objectType: "REQUIREMENT", objectId: 101 },
  status: "ACTIVE",
  relationSource: "MANUAL",
  createdBy: null,
  createdAt: null,
  updatedBy: null,
  updatedAt: null,
  inactiveReason: null,
  ...overrides,
});
export function batchRelationFixture(relation = relationFixture()): BatchRelationResult {
  return {
    items: [
      { object: relation.targetObject, outgoing: [], incoming: [relation] },
      { object: relation.sourceObject, outgoing: [relation], incoming: [] },
    ],
  };
}
