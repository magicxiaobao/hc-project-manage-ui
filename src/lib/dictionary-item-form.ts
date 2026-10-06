import type {
  DictionaryItemCreatePayload,
  DictionaryItemUpdatePayload,
  DictionaryItemResponse,
} from "./api/system-types";
import { requireDictionaryId } from "./dictionary-query";
export interface DictionaryItemFormInput {
  value: string;
  name: string;
  sort: string;
  attributes: string;
  memo: string;
}
export type DictionaryItemFormErrors = Partial<Record<keyof DictionaryItemFormInput, string>>;
export const emptyDictionaryItemForm = (): DictionaryItemFormInput => ({
  value: "",
  name: "",
  sort: "0",
  attributes: "",
  memo: "",
});
export const dictionaryItemFormFromResponse = (
  row: DictionaryItemResponse,
): DictionaryItemFormInput => ({
  value: row.value ?? "",
  name: row.name ?? "",
  sort: row.sort == null ? "" : String(row.sort),
  attributes: row.attributes == null ? "" : JSON.stringify(row.attributes, null, 2),
  memo: row.memo ?? "",
});
export function rebaseDictionaryItemFormOntoRefreshed(
  draft: DictionaryItemFormInput,
  oldBaseline: DictionaryItemFormInput,
  refreshed: DictionaryItemFormInput,
): DictionaryItemFormInput {
  return {
    value: draft.value === oldBaseline.value ? refreshed.value : draft.value,
    name: draft.name === oldBaseline.name ? refreshed.name : draft.name,
    sort: draft.sort === oldBaseline.sort ? refreshed.sort : draft.sort,
    attributes:
      draft.attributes === oldBaseline.attributes ? refreshed.attributes : draft.attributes,
    memo: draft.memo === oldBaseline.memo ? refreshed.memo : draft.memo,
  };
}
export const dictionaryItemFormSnapshot = (form: DictionaryItemFormInput) =>
  JSON.stringify([form.value, form.name, form.sort, form.attributes, form.memo]);
export const needsDictionaryItemValueCheck = (
  form: DictionaryItemFormInput,
  original: DictionaryItemResponse | null,
) => original === null || form.value.trim() !== (original.value ?? "");
export function parseDictionaryItemSort(text: string): number | undefined {
  if (!text.trim()) return undefined;
  if (!/^[+-]?\d+$/.test(text.trim())) throw new Error("请输入完整整数");
  const value = Number(text.trim());
  if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647)
    throw new Error("排序须在 -2147483648 至 2147483647 内");
  return value;
}
export function parseDictionaryItemAttributes(text: string): Record<string, unknown> | undefined {
  if (!text.trim()) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new Error("请输入合法 JSON 对象");
  }
}
export function validateDictionaryItemForm(
  form: DictionaryItemFormInput,
  original: DictionaryItemResponse | null = null,
): DictionaryItemFormErrors {
  const errors: DictionaryItemFormErrors = {};
  if (!form.value.trim()) errors.value = "请输入数据值";
  try {
    if (parseDictionaryItemSort(form.sort) === undefined && original?.sort != null)
      errors.sort = "后端不支持清空排序，请输入整数";
  } catch (error) {
    errors.sort = (error as Error).message;
  }
  try {
    parseDictionaryItemAttributes(form.attributes);
  } catch (error) {
    errors.attributes = (error as Error).message;
  }
  return errors;
}
function editablePayload(form: DictionaryItemFormInput, original: DictionaryItemResponse | null) {
  const sort = parseDictionaryItemSort(form.sort);
  const attributes =
    parseDictionaryItemAttributes(form.attributes) ??
    (original?.attributes != null ? {} : undefined);
  return {
    value: form.value.trim(),
    name: form.name,
    memo: form.memo,
    ...(sort !== undefined ? { sort } : {}),
    ...(attributes !== undefined ? { attributes } : {}),
  };
}
export function buildDictionaryItemCreatePayload(
  dictId: number,
  form: DictionaryItemFormInput,
): DictionaryItemCreatePayload {
  requireDictionaryId(dictId);
  // name must be present, including "": VARCHAR(100) NOT NULL, NOT_NULL insert strategy.
  return { dictId, ...editablePayload(form, null) };
}
export function buildDictionaryItemUpdatePayload(
  id: number,
  form: DictionaryItemFormInput,
  original: DictionaryItemResponse,
): DictionaryItemUpdatePayload {
  requireDictionaryId(id);
  return { id, ...editablePayload(form, original) };
}
