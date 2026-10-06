import { it, expect } from "vitest";
import type { DictionaryResponse } from "../api/system-types";
import { dictionaryOptions, dictionaryRecordsByCode } from "../dictionary-options";
it("数字有效状态/非空 code 映射，缺 title 回退 code，保留来源元数据", () => {
  const records = [
    { id: 9, code: "a", title: "", validStatus: 1, valueType: 2, hashCode: "h" },
    { code: "b", title: "B", validStatus: 1 },
    { code: "", validStatus: 1 },
    { code: " ", validStatus: 1 },
    { code: "c", validStatus: 0 },
    { code: "d", validStatus: "1" },
  ] as DictionaryResponse[];
  expect(dictionaryOptions([])).toEqual([]);
  expect(dictionaryOptions(records)).toEqual([
    { id: "a", label: "a" },
    { id: "b", label: "B" },
  ]);
  expect(dictionaryRecordsByCode(records).get("a")).toBe(records[0]);
  expect(dictionaryRecordsByCode(records).get("a")).toMatchObject({
    id: 9,
    valueType: 2,
    hashCode: "h",
  });
});
