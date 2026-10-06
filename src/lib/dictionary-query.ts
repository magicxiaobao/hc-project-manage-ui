import type { DictionaryQuery } from "./api/system-types";
export const isDictionaryId = (id: unknown): id is number =>
  typeof id === "number" && Number.isSafeInteger(id) && id > 0;
export function requireDictionaryId(id: unknown): asserts id is number {
  if (!isDictionaryId(id)) throw new Error("字典或字典项 ID 无效");
}
export interface DictionaryListParams {
  page: number;
  pageSize: number;
  bean: DictionaryQuery;
}
export function dictionaryListParams(
  page = 1,
  pageSize = 10,
  filters: { code?: string; title?: string } = {},
): DictionaryListParams {
  const code = filters.code?.trim();
  const title = filters.title?.trim();
  return { page, pageSize, bean: { ...(code ? { code } : {}), ...(title ? { title } : {}) } };
}
export const searchDictionaries = (filters: { code?: string; title?: string }, pageSize = 10) =>
  dictionaryListParams(1, pageSize, filters);
export const dictionaryStatusLabel = (status: unknown) =>
  status === 1 ? "有效" : status === 0 ? "无效" : "未知状态";
export const dictionaryStatusAction = (status: unknown) =>
  status === 1 ? "invalid" : status === 0 ? "valid" : null;
export const dictionaryValueTypeLabel = (type: unknown) =>
  type === 1 ? "数字" : type === 2 ? "字符串" : type === 3 ? "布尔值" : "未知类型";
