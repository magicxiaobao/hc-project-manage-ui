import { describe, it, expect } from "vitest";
import type { DictionaryItemResponse } from "../api/system-types";
import {
  emptyDictionaryItemForm,
  validateDictionaryItemForm,
  parseDictionaryItemSort,
  parseDictionaryItemAttributes,
  needsDictionaryItemValueCheck,
  buildDictionaryItemCreatePayload,
  buildDictionaryItemUpdatePayload,
  dictionaryItemFormSnapshot,
  dictionaryItemFormFromResponse,
} from "../dictionary-item-form";
const original: DictionaryItemResponse = {
  id: 9,
  dictId: 1,
  value: "v",
  sort: 0,
  attributes: { a: 1 },
  dictCode: null,
  name: null,
  memo: null,
  validStatus: 1,
  creator: null,
  updater: null,
  createdAt: null,
  updatedAt: null,
};
describe("字典项边界与载荷", () => {
  it("全部错误收集", () =>
    expect(
      Object.keys(
        validateDictionaryItemForm({ ...emptyDictionaryItemForm(), sort: "1.1", attributes: "[]" }),
      ),
    ).toEqual(["value", "sort", "attributes"]));
  it.each(["-2147483648", "2147483647", "+0", " -1 "])("完整整数 %s", (text) =>
    expect(parseDictionaryItemSort(text)).toBe(Number(text)),
  );
  it.each(["-2147483649", "2147483648", "1.2", "1x", "NaN", "Infinity", "1e2"])("拒绝 %s", (text) =>
    expect(() => parseDictionaryItemSort(text)).toThrow(),
  );
  it.each(["[]", "null", "true", "1", '"a"', "{"])("拒绝非对象 JSON %s", (text) =>
    expect(() => parseDictionaryItemAttributes(text)).toThrow("请输入合法 JSON 对象"),
  );
  it("合法嵌套对象与空对象", () => {
    expect(parseDictionaryItemAttributes('{"a":{"b":[1,true,null]}}')).toEqual({
      a: { b: [1, true, null] },
    });
    expect(parseDictionaryItemAttributes("{}")).toEqual({});
  });
  it("name 始终发送空串，value 始终 String，dictId 唯一范围独立", () => {
    const form = { ...emptyDictionaryItemForm(), value: " true " };
    expect(buildDictionaryItemCreatePayload(1, form)).toEqual({
      dictId: 1,
      value: "true",
      name: "",
      sort: 0,
      memo: "",
    });
    expect(buildDictionaryItemCreatePayload(2, form).dictId).toBe(2);
    expect(needsDictionaryItemValueCheck({ ...form, value: " v " }, original)).toBe(false);
    expect(needsDictionaryItemValueCheck(form, original)).toBe(true);
    expect(needsDictionaryItemValueCheck(form, null)).toBe(true);
  });
  it("编辑清空属性发对象，已有排序禁止清空；空排序新增可省略", () => {
    const form = { ...emptyDictionaryItemForm(), value: "v", sort: "", attributes: "" };
    expect(validateDictionaryItemForm(form, original).sort).toBe("后端不支持清空排序，请输入整数");
    expect(buildDictionaryItemCreatePayload(1, form)).not.toHaveProperty("sort");
    const update = buildDictionaryItemUpdatePayload(9, { ...form, sort: "0" }, original);
    expect(update).toEqual({ id: 9, value: "v", name: "", memo: "", sort: 0, attributes: {} });
    for (const key of ["dictId", "dictCode", "creator", "updater", "hashCode", "validStatus"])
      expect(update).not.toHaveProperty(key);
    expect(
      buildDictionaryItemUpdatePayload(9, form, { ...original, sort: null, attributes: null }),
    ).not.toHaveProperty("attributes");
  });
  it("JSON 排版/空格参与 dirty 快照", () => {
    const base = dictionaryItemFormFromResponse(original);
    expect(dictionaryItemFormSnapshot({ ...base, attributes: '{"a":1}' })).not.toBe(
      dictionaryItemFormSnapshot(base),
    );
    expect(dictionaryItemFormSnapshot({ ...base, value: "v " })).not.toBe(
      dictionaryItemFormSnapshot(base),
    );
    expect(dictionaryItemFormSnapshot({ ...base })).toBe(dictionaryItemFormSnapshot(base));
  });
});

it("旧记录含空格时提交 trim 后值实际改变，必须重新检查唯一性", () => {
  expect(
    needsDictionaryItemValueCheck(
      { ...emptyDictionaryItemForm(), value: " v " },
      { ...original, value: " v " },
    ),
  ).toBe(true);
});
