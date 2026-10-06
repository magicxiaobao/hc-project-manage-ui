import { describe, it, expect } from "vitest";
import {
  emptyDictionaryForm,
  validateDictionaryForm,
  buildDictionaryCreatePayload,
  buildDictionaryUpdatePayload,
  dictionaryFormSnapshot,
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
