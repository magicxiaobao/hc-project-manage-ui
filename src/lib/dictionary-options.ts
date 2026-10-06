import type { DictionaryResponse } from "./api/system-types";
export function dictionaryOptions(records: readonly DictionaryResponse[]) {
  return records
    .filter(
      (row) => row.validStatus === 1 && typeof row.code === "string" && row.code.trim() !== "",
    )
    .map((row) => ({ id: row.code!, label: row.title?.trim() ? row.title : row.code! }));
}
/** code is the selection key; the source keeps the Long id and type/hash metadata. */
export const dictionaryRecordsByCode = (records: readonly DictionaryResponse[]) =>
  new Map(
    records
      .filter((row) => row.validStatus === 1 && row.code?.trim())
      .map((row) => [row.code!, row]),
  );
