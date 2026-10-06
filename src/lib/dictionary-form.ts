import type {
  DictionaryCreatePayload,
  DictionaryUpdatePayload,
  DictionaryResponse,
} from "./api/system-types";
import { requireDictionaryId } from "./dictionary-query";
export interface DictionaryFormInput {
  code: string;
  title: string;
  valueType: string;
  memo: string;
}
export type DictionaryFormErrors = Partial<Record<keyof DictionaryFormInput, string>>;
export const DICTIONARY_VALUE_TYPES = [
  { id: "1", label: "数字" },
  { id: "2", label: "字符串" },
  { id: "3", label: "布尔值" },
];
export const emptyDictionaryForm = (): DictionaryFormInput => ({
  code: "",
  title: "",
  valueType: "2",
  memo: "",
});
export const dictionaryFormFromResponse = (row: DictionaryResponse): DictionaryFormInput => ({
  code: row.code ?? "",
  title: row.title ?? "",
  valueType: typeof row.valueType === "number" ? String(row.valueType) : "",
  memo: row.memo ?? "",
});
export function rebaseDictionaryFormOntoRefreshed(
  draft: DictionaryFormInput,
  oldBaseline: DictionaryFormInput,
  refreshed: DictionaryFormInput,
): DictionaryFormInput {
  return {
    code: draft.code === oldBaseline.code ? refreshed.code : draft.code,
    title: draft.title === oldBaseline.title ? refreshed.title : draft.title,
    valueType: draft.valueType === oldBaseline.valueType ? refreshed.valueType : draft.valueType,
    memo: draft.memo === oldBaseline.memo ? refreshed.memo : draft.memo,
  };
}
export const dictionaryFormSnapshot = (form: DictionaryFormInput, create = true) =>
  JSON.stringify([...(create ? [form.code] : []), form.title, form.valueType, form.memo]);
export function validateDictionaryForm(
  form: DictionaryFormInput,
  create = true,
): DictionaryFormErrors {
  const errors: DictionaryFormErrors = {};
  if (create && !form.code.trim()) errors.code = "请输入编码";
  if (!form.title.trim()) errors.title = "请输入名称";
  if (!["1", "2", "3"].includes(form.valueType)) errors.valueType = "请选择数据类型";
  return errors;
}
export function buildDictionaryCreatePayload(form: DictionaryFormInput): DictionaryCreatePayload {
  return {
    code: form.code.trim(),
    title: form.title.trim(),
    valueType: Number(form.valueType),
    ...(form.memo ? { memo: form.memo } : {}),
  };
}
export function buildDictionaryUpdatePayload(
  id: number,
  form: DictionaryFormInput,
): DictionaryUpdatePayload {
  requireDictionaryId(id);
  return { id, title: form.title.trim(), valueType: Number(form.valueType), memo: form.memo };
}
