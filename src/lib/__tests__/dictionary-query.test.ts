import { it, expect } from "vitest";
import {
  dictionaryListParams,
  searchDictionaries,
  dictionaryStatusLabel,
  dictionaryStatusAction,
  isDictionaryId,
} from "../dictionary-query";
it("筛选包装/重置第一页/翻页保留条件", () => {
  expect(searchDictionaries({ code: " a ", title: " b " }, 20)).toEqual({
    page: 1,
    pageSize: 20,
    bean: { code: "a", title: "b" },
  });
  expect(dictionaryListParams(2, 20, { code: "a" })).toEqual({
    page: 2,
    pageSize: 20,
    bean: { code: "a" },
  });
  expect(dictionaryListParams()).toEqual(searchDictionaries({ code: " ", title: "" }));
  expect(Object.keys(dictionaryListParams())).toEqual(["page", "pageSize", "bean"]);
});
it.each([null, undefined, 3, "VALID", "1", "0"])("状态 %s 不推断启停", (s) => {
  expect(dictionaryStatusLabel(s)).toBe("未知状态");
  expect(dictionaryStatusAction(s)).toBeNull();
});
it("仅数字状态与安全正整数", () => {
  expect(dictionaryStatusLabel(1)).toBe("有效");
  expect(dictionaryStatusAction(1)).toBe("invalid");
  expect(dictionaryStatusLabel(0)).toBe("无效");
  expect(dictionaryStatusAction(0)).toBe("valid");
  for (const v of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "1"])
    expect(isDictionaryId(v)).toBe(false);
  expect(isDictionaryId(1)).toBe(true);
});
