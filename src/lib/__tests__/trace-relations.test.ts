import { describe, expect, it } from "vitest";
import {
  assertBatchRelations,
  canUnlinkRelation,
  normalizeRelationQuery,
  objectLabel,
  relationPayload,
  relationsForObject,
} from "../trace-relations";
import {
  allowedOtherTypes,
  buildTraceRelationPayload,
  editTraceRelationForm,
  emptyTraceRelationForm,
  traceRelationFormDirty,
  validateTraceRelationForm,
  validateUnlinkReason,
} from "../trace-relation-form";
import { relationFixture, batchRelationFixture } from "./fixtures/trace-relations";
import type { AlmObjectType } from "../api/trace-types";

const row = relationFixture();
describe("双向分组消费", () => {
  it("按对象键而非下标匹配，同边双向可查且保留原方向", () => {
    const batch = batchRelationFixture();
    batch.items.push({ object: { objectType: "TASK", objectId: 202 }, outgoing: [], incoming: [] });
    expect(relationsForObject(batch, row.sourceObject)).toEqual({ outgoing: [row], incoming: [] });
    expect(relationsForObject(batch, row.targetObject)).toEqual({ outgoing: [], incoming: [row] });
    expect(relationsForObject(batch, { objectType: "TASK", objectId: 202 })).toEqual({
      outgoing: [],
      incoming: [],
    });
    expect(relationPayload(relationsForObject(batch, row.targetObject).incoming[0])).toEqual({
      sourceType: "TASK",
      sourceId: 201,
      relationType: "TASK_IMPLEMENTS_REQUIREMENT",
      targetType: "REQUIREMENT",
      targetId: 101,
    });
  });
  it("同一分组重复边去重，不把不同类型的同 ID 对象混淆", () => {
    const batch = batchRelationFixture();
    batch.items[1].outgoing.push(row);
    batch.items.push({
      object: { objectType: "DEFECT", objectId: 201 },
      outgoing: [],
      incoming: [],
    });
    expect(relationsForObject(batch, row.sourceObject).outgoing).toHaveLength(1);
    expect(relationsForObject(batch, { objectType: "DEFECT", objectId: 201 }).outgoing).toEqual([]);
  });
  it.each([
    null,
    [],
    { items: null },
    { items: [row] },
    { items: [{ object: row.sourceObject, outgoing: null, incoming: [] }] },
    { items: [{ object: row.sourceObject, outgoing: [], incoming: [row] }] },
    { items: [{ object: row.sourceObject, outgoing: [{}], incoming: [] }] },
  ])("畸形分组或错误方向报错 %j", (value) =>
    expect(() => assertBatchRelations(value)).toThrow("契约错误"),
  );
  it("缺失请求对象分组、重复对象分组不能成为空态", () => {
    expect(() => relationsForObject({ items: [] }, row.sourceObject)).toThrow("契约错误");
    const batch = batchRelationFixture();
    batch.items.push(batch.items[0]);
    expect(() => assertBatchRelations(batch)).toThrow("契约错误");
  });
  it("标题缺失保留类型与 ID；额外枚举和非白名单只读；来源不限制白名单解除", () => {
    expect(objectLabel(row.sourceObject, null)).toBe("任务 #201");
    expect(objectLabel({ objectType: "TEST_EXECUTION", objectId: 3 })).toBe("测试执行 #3");
    expect(canUnlinkRelation(relationFixture({ relationSource: "BUSINESS_ACTION" }))).toBe(true);
    const readOnly = relationFixture({
      sourceObject: { objectType: "VERSION", objectId: 4 },
      relationType: "VERSION_CONTAINS_TASK",
      targetObject: row.sourceObject,
      relationSource: "BUSINESS_ACTION",
    });
    expect(
      relationsForObject(batchRelationFixture(readOnly), readOnly.targetObject).incoming,
    ).toEqual([readOnly]);
    expect(canUnlinkRelation(readOnly)).toBe(false);
    expect(canUnlinkRelation(relationFixture({ status: "INACTIVE" }))).toBe(false);
  });
  it("参数去重排序，显式 BOTH/activeOnly=true，保留空类型数组", () => {
    expect(
      normalizeRelationQuery(
        [row.sourceObject, row.targetObject, row.sourceObject],
        ["DEFECT_FOUND_IN_TASK", "TASK_IMPLEMENTS_REQUIREMENT", "DEFECT_FOUND_IN_TASK"],
      ),
    ).toEqual({
      objects: [row.targetObject, row.sourceObject],
      direction: "BOTH",
      relationTypes: ["DEFECT_FOUND_IN_TASK", "TASK_IMPLEMENTS_REQUIREMENT"],
      activeOnly: true,
    });
    expect(normalizeRelationQuery([row.sourceObject]).relationTypes).toEqual([]);
  });
});
describe("表单方向、校验及会话快照", () => {
  it.each([
    ["TASK", "REQUIREMENT", "TASK_IMPLEMENTS_REQUIREMENT", "TASK", 1, "REQUIREMENT", 2],
    ["TASK", "DEFECT", "DEFECT_FOUND_IN_TASK", "DEFECT", 2, "TASK", 1],
    ["REQUIREMENT", "TASK", "TASK_IMPLEMENTS_REQUIREMENT", "TASK", 2, "REQUIREMENT", 1],
    [
      "REQUIREMENT",
      "TEST_CASE",
      "TEST_CASE_VERIFIES_REQUIREMENT",
      "TEST_CASE",
      2,
      "REQUIREMENT",
      1,
    ],
    ["REQUIREMENT", "DEFECT", "DEFECT_AFFECTS_REQUIREMENT", "DEFECT", 2, "REQUIREMENT", 1],
  ] as const)(
    "%s 选择 %s 的五元组方向",
    (current, other, relation, sourceType, sourceId, targetType, targetId) => {
      const form = { targetType: other, targetId: "2", relationType: relation };
      const object = { objectType: current, objectId: 1 };
      expect(
        validateTraceRelationForm(form, object, 7, {
          id: 2,
          objectType: other,
          title: "对象",
          projectId: 7,
        }),
      ).toEqual({});
      expect(buildTraceRelationPayload(form, object)).toEqual({
        sourceType,
        sourceId,
        relationType: relation,
        targetType,
        targetId,
      });
    },
  );
  it("不开放非法组合；一次收集三字段错误", () => {
    expect(allowedOtherTypes("TASK")).toEqual(["REQUIREMENT", "DEFECT"]);
    expect(allowedOtherTypes("REQUIREMENT")).toEqual(["TASK", "TEST_CASE", "DEFECT"]);
    expect(
      Object.keys(validateTraceRelationForm(emptyTraceRelationForm(), row.sourceObject, 7, null)),
    ).toEqual(["targetType", "targetId", "relationType"]);
    expect(() =>
      buildTraceRelationPayload(
        { targetType: "TEST_CASE", targetId: "2", relationType: "TEST_CASE_VERIFIES_REQUIREMENT" },
        row.sourceObject,
      ),
    ).toThrow("方向");
  });
  it.each([0, -1, Number.MAX_SAFE_INTEGER + 1, NaN])("非法当前对象 ID %s 被拦截", (id) => {
    const form = { targetType: "REQUIREMENT", targetId: "2", relationType: row.relationType };
    expect(
      validateTraceRelationForm(form, { ...row.sourceObject, objectId: id }, 7, {
        id: 2,
        objectType: "REQUIREMENT",
        title: null,
        projectId: 7,
      }).targetId,
    ).toBeTruthy();
  });
  it.each([
    { id: 2, projectId: 8, objectType: "REQUIREMENT" },
    { id: 3, projectId: 7, objectType: "REQUIREMENT" },
    { id: 2, projectId: 7, objectType: "TASK" },
    { id: 2, projectId: null, objectType: "REQUIREMENT" },
  ])("候选 ID/类型/项目必须匹配 %j", (candidate) => {
    expect(
      validateTraceRelationForm(
        { targetType: "REQUIREMENT", targetId: "2", relationType: row.relationType },
        row.sourceObject,
        7,
        { ...candidate, objectType: candidate.objectType as AlmObjectType, title: null },
      ).targetId,
    ).toBeTruthy();
  });
  it("类型变化清空选择及旧关系；编辑只清有关字段错误", () => {
    const errors = { targetType: "类型", targetId: "对象", relationType: "关系" };
    const form = { targetType: "REQUIREMENT", targetId: "2", relationType: row.relationType };
    expect(editTraceRelationForm(form, errors, "targetType", "DEFECT")).toEqual({
      form: { targetType: "DEFECT", targetId: "", relationType: "" },
      errors: {},
    });
    expect(editTraceRelationForm(form, errors, "targetId", "3").errors).toEqual({
      targetType: "类型",
      relationType: "关系",
    });
  });
  it("改变后改回快照变 clean", () => {
    const snapshot = emptyTraceRelationForm();
    const changed = editTraceRelationForm(snapshot, {}, "targetType", "REQUIREMENT").form;
    expect(traceRelationFormDirty(changed, snapshot)).toBe(true);
    expect(
      traceRelationFormDirty(editTraceRelationForm(changed, {}, "targetType", "").form, snapshot),
    ).toBe(false);
  });
});
describe("解除原因", () => {
  it.each([null, undefined, "", "   \n\t"])("空原因 %j 不通过", (reason) =>
    expect(validateUnlinkReason(reason).error).toBe("请填写解除原因"),
  );
  it("trim 后提交原因", () =>
    expect(validateUnlinkReason("  误关联 \n")).toEqual({ reason: "误关联", error: undefined }));
  it.each(["中", "😀"])("500/501 个 %s 按 code points 校验", (character) => {
    expect(validateUnlinkReason(character.repeat(500)).error).toBeUndefined();
    expect(validateUnlinkReason(character.repeat(501)).error).toContain("500");
  });
});
