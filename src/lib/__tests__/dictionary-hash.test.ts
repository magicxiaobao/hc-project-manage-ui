import { it, expect } from "vitest";
import type { DictionaryResponse } from "../api/system-types";
import {
  dictionaryHashBatch,
  dictionaryHashResultLabel,
  dictionaryHashSessionMatches,
} from "../dictionary-hash";
it("仅当前页数字有效且 code/hash 非空入批次，不生成 hash", () => {
  const records = [
    { code: "a", hashCode: "h", validStatus: 1 },
    { code: "b", hashCode: "h", validStatus: 0 },
    { code: "c", hashCode: "h", validStatus: "1" },
    { code: "d", hashCode: "", validStatus: 1 },
  ] as DictionaryResponse[];
  expect(dictionaryHashBatch(records)).toEqual({ a: "h" });
  expect(dictionaryHashBatch([])).toEqual({});
});
it("false、缺失、true 分别显示；页或会话变化拒绝旧结果", () => {
  expect(dictionaryHashResultLabel({ a: true }, "a")).toBe("匹配");
  expect(dictionaryHashResultLabel({ a: false }, "a")).toBe("不匹配");
  expect(dictionaryHashResultLabel({}, "a")).toBe("未返回校验结果");
  expect(dictionaryHashResultLabel({}, "__proto__")).toBe("未返回校验结果");
  expect(dictionaryHashSessionMatches("p1", "p2", 1, 1)).toBe(false);
  expect(dictionaryHashSessionMatches("p1", "p1", 1, 2)).toBe(false);
  expect(dictionaryHashSessionMatches("p1", "p1", 1, 1)).toBe(true);
});
