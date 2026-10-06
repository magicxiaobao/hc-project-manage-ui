import { describe, it, expect } from "vitest";
import {
  emptyDictionaryForm,
  validateDictionaryForm,
  buildDictionaryCreatePayload,
  buildDictionaryUpdatePayload,
  dictionaryFormSnapshot,
  rebaseDictionaryFormOntoRefreshed,
  type DictionaryFormInput,
} from "../dictionary-form";
describe("字典表单契约", () => {
  it("同时收集全部必填错误", () =>
    expect(
      Object.keys(validateDictionaryForm({ ...emptyDictionaryForm(), valueType: "" })),
    ).toEqual(["code", "title", "valueType"]));
  it.each(["1", "2", "3"])("合法类型 %s 转为数字", (valueType) => {
    const form = { code: " c ", title: " t ", valueType, memo: "" };
    expect(validateDictionaryForm(form)).toEqual({});
    expect(buildDictionaryCreatePayload(form)).toEqual({
      code: "c",
      title: "t",
      valueType: Number(valueType),
    });
    expect(buildDictionaryUpdatePayload(1, form)).toEqual({
      id: 1,
      title: "t",
      valueType: Number(valueType),
      memo: "",
    });
  });
  it.each(["", "0", "4", "2.0", "NaN"])("未知类型 %s 不默认为字符串", (valueType) =>
    expect(validateDictionaryForm({ ...emptyDictionaryForm(), valueType }).valueType).toBeTruthy(),
  );
  it("不引入编码正则/长度；快照含空格且还原 clean", () => {
    const base = { ...emptyDictionaryForm(), code: "a / 中文", title: "t" };
    expect(validateDictionaryForm(base)).toEqual({});
    expect(dictionaryFormSnapshot({ ...base, memo: " " })).not.toBe(dictionaryFormSnapshot(base));
    expect(dictionaryFormSnapshot({ ...base, memo: "" })).toBe(dictionaryFormSnapshot(base));
    expect(dictionaryFormSnapshot({ ...base, code: "changed" }, false)).toBe(
      dictionaryFormSnapshot(base, false),
    );
    expect(
      buildDictionaryUpdatePayload(1, { ...base, hashCode: "x", validStatus: 0 } as typeof base),
    ).not.toHaveProperty("hashCode");
  });
});

describe("字典草稿三路对账", () => {
  const baseline = { code: "code", title: "title", valueType: "2", memo: "memo" };
  const refreshed = { code: "new code", title: "new title", valueType: "1", memo: "new memo" };
  it.each<keyof DictionaryFormInput>(["code", "title", "valueType", "memo"])(
    "保留已编辑的 %s，其余字段取最新值",
    (field) => {
      const draft = { ...baseline, [field]: "draft" };
      expect(rebaseDictionaryFormOntoRefreshed(draft, baseline, refreshed)).toEqual({
        ...refreshed,
        [field]: "draft",
      });
      expect(draft).toEqual({ ...baseline, [field]: "draft" });
      expect(baseline).toEqual({ code: "code", title: "title", valueType: "2", memo: "memo" });
    },
  );
  it("全未改取最新值，全已改保留草稿", () => {
    expect(rebaseDictionaryFormOntoRefreshed({ ...baseline }, baseline, refreshed)).toEqual(
      refreshed,
    );
    const draft = { code: "draft code", title: "draft title", valueType: "3", memo: "draft memo" };
    expect(rebaseDictionaryFormOntoRefreshed(draft, baseline, refreshed)).toEqual(draft);
  });
  it("清空和空格按原始字符串比较，未改空串可接收最新值", () => {
    expect(
      rebaseDictionaryFormOntoRefreshed(
        { code: "", title: " title ", valueType: "", memo: "" },
        { ...baseline, memo: "" },
        refreshed,
      ),
    ).toEqual({ code: "", title: " title ", valueType: "", memo: "new memo" });
  });
});
