import { expect, it } from "vitest";
import * as Q from "../system-config-query";
it.each([
  ["string", "STRING", "字符串"],
  ["number", "INTEGER", "数字（整数）"],
  ["boolean", "BOOLEAN", "布尔"],
  ["json", "JSON", "JSON"],
])("%s 双向映射与显示", (ui, wire, label) => {
  expect(Q.configTypeToWire(ui)).toBe(wire);
  expect(Q.configTypeFromWire(wire.toLowerCase())).toBe(ui);
  expect(Q.configTypeLabel(wire)).toBe(label);
});
it.each([null, "NUMBER", "other", "", 1])("未知类型 %s 不悄悄映射", (type) => {
  expect(Q.configTypeFromWire(type)).toBeNull();
  expect(Q.configTypeLabel(type)).toContain("未知类型");
});
it("分页/筛选规范化与空项省略，仅实际 DTO 字段", () => {
  expect(
    Q.systemConfigListParams(2, 20, { configKey: " 中文.key &+# ", configType: "number" }),
  ).toEqual({ page: 2, pageSize: 20, bean: { configKey: "中文.key &+#", configType: "INTEGER" } });
  expect(Q.systemConfigListParams(0, NaN, { configKey: " ", configType: "NUMBER" })).toEqual({
    page: 1,
    pageSize: 10,
    bean: {},
  });
  expect(
    Q.normalizeSystemConfigListParams({
      page: 2,
      pageSize: 20,
      bean: { configType: "integer", name: "ignored", enabled: false },
    }),
  ).toEqual({ page: 2, pageSize: 20, bean: { configType: "INTEGER" } });
});
it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "1", null])(
  "非法 id %s 拒绝",
  (id) => {
    expect(Q.isSystemConfigId(id)).toBe(false);
    expect(() => Q.requireSystemConfigId(id)).toThrow();
  },
);
it("enabled 严格布尔", () => {
  expect(Q.configEnabledAction(true)).toBe("invalid");
  expect(Q.configEnabledAction(false)).toBe("valid");
  for (const value of [null, undefined, 0, 1, "true"]) {
    expect(Q.configEnabledAction(value)).toBeNull();
    expect(Q.configEnabledLabel(value)).toBe("未知");
  }
});
