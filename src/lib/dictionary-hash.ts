import type { DictionaryResponse } from "./api/system-types";
export function dictionaryHashBatch(
  records: readonly DictionaryResponse[],
): Record<string, string> {
  return Object.fromEntries(
    records
      .filter((row) => row.validStatus === 1 && row.code?.trim() && row.hashCode?.trim())
      .map((row) => [row.code!, row.hashCode!]),
  );
}
export function dictionaryHashResultLabel(results: Record<string, boolean>, code: string) {
  return Object.hasOwn(results, code) && typeof results[code] === "boolean"
    ? results[code]
      ? "匹配"
      : "不匹配"
    : "未返回校验结果";
}
export const dictionaryHashSessionMatches = (
  submitted: string,
  current: string,
  session: number,
  currentSession: number,
) => submitted === current && session === currentSession;
