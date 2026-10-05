import type {
  AlmObjectKey,
  AlmObjectType,
  AlmRelationType,
  LinkRelationPayload,
} from "./api/trace-types";
import { isObjectKey, isPositiveSafeId } from "./trace-relations";
export interface TraceRelationForm {
  targetType: string;
  targetId: string;
  relationType: string;
}
export type TraceRelationErrors = Partial<Record<keyof TraceRelationForm, string>>;
export interface SelectedRelationCandidate {
  id: number | null;
  title: string | null;
  projectId: number | null;
  objectType: AlmObjectType;
}
export const emptyTraceRelationForm = (): TraceRelationForm => ({
  targetType: "",
  targetId: "",
  relationType: "",
});
const combinations = [
  {
    current: "TASK",
    other: "REQUIREMENT",
    relation: "TASK_IMPLEMENTS_REQUIREMENT",
    currentIsSource: true,
  },
  { current: "TASK", other: "DEFECT", relation: "DEFECT_FOUND_IN_TASK", currentIsSource: false },
  {
    current: "REQUIREMENT",
    other: "TASK",
    relation: "TASK_IMPLEMENTS_REQUIREMENT",
    currentIsSource: false,
  },
  {
    current: "REQUIREMENT",
    other: "TEST_CASE",
    relation: "TEST_CASE_VERIFIES_REQUIREMENT",
    currentIsSource: false,
  },
  {
    current: "REQUIREMENT",
    other: "DEFECT",
    relation: "DEFECT_AFFECTS_REQUIREMENT",
    currentIsSource: false,
  },
] as const;
export const allowedOtherTypes = (current: AlmObjectType) =>
  combinations.filter((c) => c.current === current).map((c) => c.other);
export const allowedRelationTypes = (current: AlmObjectType, other: string): AlmRelationType[] =>
  combinations.filter((c) => c.current === current && c.other === other).map((c) => c.relation);
export function editTraceRelationForm(
  form: TraceRelationForm,
  errors: TraceRelationErrors,
  field: keyof TraceRelationForm,
  value: string,
) {
  const next = { ...form, [field]: value };
  const nextErrors = { ...errors };
  delete nextErrors[field];
  if (field === "targetType") {
    next.targetId = "";
    next.relationType = "";
    delete nextErrors.targetId;
    delete nextErrors.relationType;
  }
  return { form: next, errors: nextErrors };
}
export const traceRelationFormDirty = (form: TraceRelationForm, snapshot: TraceRelationForm) =>
  (["targetType", "targetId", "relationType"] as const).some(
    (field) => form[field] !== snapshot[field],
  );
export function validateTraceRelationForm(
  form: TraceRelationForm,
  current: AlmObjectKey,
  projectId: number,
  selected: SelectedRelationCandidate | null,
): TraceRelationErrors {
  const errors: TraceRelationErrors = {};
  if (!allowedOtherTypes(current.objectType).some((type) => type === form.targetType))
    errors.targetType = "请选择合法的目标对象类型";
  const id = /^\d+$/.test(form.targetId) ? Number(form.targetId) : null;
  if (!isPositiveSafeId(id)) errors.targetId = "请选择有效的目标对象（正安全整数 ID）";
  else if (
    !isObjectKey(current) ||
    !isPositiveSafeId(projectId) ||
    !selected ||
    selected.id !== id ||
    selected.projectId !== projectId ||
    selected.objectType !== form.targetType
  )
    errors.targetId = "请选择已确认属于当前项目的对象";
  if (
    !allowedRelationTypes(current.objectType, form.targetType).some(
      (type) => type === form.relationType,
    )
  )
    errors.relationType = "请选择合法的关系类型";
  return errors;
}
export function buildTraceRelationPayload(
  form: TraceRelationForm,
  current: AlmObjectKey,
): LinkRelationPayload {
  const combo = combinations.find(
    (c) =>
      c.current === current.objectType &&
      c.other === form.targetType &&
      c.relation === form.relationType,
  );
  if (
    !combo ||
    !isObjectKey(current) ||
    !/^\d+$/.test(form.targetId) ||
    !isPositiveSafeId(Number(form.targetId))
  )
    throw new Error("关联方向或对象 ID 无效");
  const other = { objectType: combo.other, objectId: Number(form.targetId) };
  const source = combo.currentIsSource ? current : other;
  const target = combo.currentIsSource ? other : current;
  return {
    sourceType: source.objectType,
    sourceId: source.objectId,
    relationType: combo.relation,
    targetType: target.objectType,
    targetId: target.objectId,
  };
}
export function validateUnlinkReason(reason: string | null | undefined) {
  const normalized = reason?.trim() ?? "";
  const error = !normalized
    ? "请填写解除原因"
    : Array.from(normalized).length > 500
      ? "解除原因不能超过 500 个 Unicode 字符"
      : undefined;
  return { reason: normalized, error };
}
