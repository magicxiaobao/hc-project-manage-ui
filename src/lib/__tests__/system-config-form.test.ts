import { expect, it } from "vitest";
import type { SystemConfigResponse } from "../api/system-types";
import * as F from "../system-config-form";
const form = (configType = "string", configValue = "raw text") => ({
  ...F.emptySystemConfigForm(),
  name: " 名称 ",
  configKey: " 中文.key &+# ",
  configType,
  configValue,
  enabled: false,
});
const row = (patch: Partial<SystemConfigResponse> = {}): SystemConfigResponse => ({
  id: 9,
  name: "名称",
  configKey: "key",
  configType: "STRING",
  configValue: "text",
  description: null,
  enabled: true,
  memo: "保留",
  createdAt: null,
  updatedAt: null,
  ...patch,
});
it("初始/nullable 回填及未知类型值不自动修复", () => {
  expect(F.emptySystemConfigForm()).toMatchObject({
    configType: "string",
    configValue: "",
    enabled: true,
  });
  expect(
    F.systemConfigFormFromResponse(
      row({ name: null, configKey: null, configValue: null, configType: null, enabled: null }),
    ),
  ).toMatchObject({ name: "", configKey: "", configValue: "", configType: "", enabled: false });
  expect(
    F.systemConfigFormFromResponse(row({ configType: "NUMBER", configValue: "1.2" })),
  ).toMatchObject({ configType: "NUMBER", configValue: "1.2" });
  expect(
    F.systemConfigFormFromResponse(row({ configType: "boolean", configValue: "FALSE" }))
      .configValue,
  ).toBe("false");
});
it("全部字段错误、点号 key、长度边界及描述清空", () => {
  expect(
    Object.keys(
      F.validateSystemConfigForm({
        ...form(),
        name: " ",
        configKey: "",
        configType: "",
        configValue: "",
        description: "x".repeat(501),
      }),
    ),
  ).toEqual(["name", "configKey", "description", "configType", "configValue"]);
  expect(
    F.validateSystemConfigForm({
      ...form(),
      name: "x".repeat(100),
      configKey: "x".repeat(100),
      description: "x".repeat(500),
    }),
  ).toEqual({});
  expect(
    F.validateSystemConfigForm({ ...form(), name: "x".repeat(101), configKey: "x".repeat(101) }),
  ).toHaveProperty("configKey");
  expect(F.buildSystemConfigCreatePayload(form()).description).toBe("");
});
it.each(["0", "-1", "-2147483648", "2147483647", " +00012 ", "-0000"])(
  "合法整数 %s 始终 String",
  (value) => {
    expect(F.validateSystemConfigForm(form("number", value))).toEqual({});
    expect(F.buildSystemConfigCreatePayload(form("number", value)).configValue).toBe(
      String(Number(value)),
    );
  },
);
it.each(["", "-", "+", "2147483648", "-2147483649", "1.2", "1e2", "NaN", "Infinity", "12a"])(
  "非法整数 %s 拒绝",
  (value) =>
    expect(F.validateSystemConfigForm(form("number", value))).toHaveProperty("configValue"),
);
it.each(["true", "false"])("Boolean %s 不视为缺失", (value) =>
  expect(F.buildSystemConfigCreatePayload(form("boolean", value)).configValue).toBe(value),
);
it.each(["FALSE", "no", "", " false "])("Boolean 未明确选择 %s 拒绝", (value) =>
  expect(F.validateSystemConfigForm(form("boolean", value))).toHaveProperty("configValue"),
);
it.each([" {} ", '[1,{"a":[false,null]}]', ' {"nested":{"n":0}}\n'])("JSON %s 规范化", (value) =>
  expect(F.buildSystemConfigCreatePayload(form("json", value)).configValue).toBe(
    JSON.stringify(JSON.parse(value)),
  ),
);
it.each(["{bad", "null", '"text"', "1", "true", ""])(
  "JSON %s 即使 remote true 也不能写",
  (value) => {
    expect(F.configValuePrecheckError(true)).toBeUndefined();
    expect(() => F.buildSystemConfigCreatePayload(form("json", value))).toThrow();
  },
);
it("白名单/raw string/false/清空描述/省略未变类型及 memo", () => {
  const draft = form("string", "  raw\n text  ");
  expect(
    F.buildSystemConfigCreatePayload({ ...draft, memo: "ignored", deleted: true } as typeof draft),
  ).toEqual({
    name: "名称",
    configKey: "中文.key &+#",
    configType: "STRING",
    configValue: "  raw\n text  ",
    description: "",
    enabled: false,
  });
  expect(F.buildSystemConfigUpdatePayload(9, draft, draft)).toEqual({
    id: 9,
    name: "名称",
    configKey: "中文.key &+#",
    configValue: "  raw\n text  ",
    description: "",
    enabled: false,
  });
  expect(F.buildSystemConfigUpdatePayload(9, form("number", "0"), draft)).toHaveProperty(
    "configType",
    "INTEGER",
  );
  expect(() => F.buildSystemConfigUpdatePayload(0, draft, draft)).toThrow();
  expect(() =>
    F.buildSystemConfigUpdatePayload(9, form("NUMBER", "0"), form("NUMBER", "0")),
  ).toThrow();
});
it("切形态保留 raw；dirty 原始逐字段比较，包括 JSON 排版", () => {
  const draft = form("json", '{ "a":1 }');
  const base = F.systemConfigFormSnapshot(draft);
  expect(F.switchSystemConfigType(draft, "number").configValue).toBe(draft.configValue);
  expect(
    F.systemConfigSnapshotsEqual(
      base,
      F.systemConfigFormSnapshot({ ...draft, configValue: '{"a":1}' }),
    ),
  ).toBe(false);
  expect(
    F.systemConfigSnapshotsEqual(
      base,
      F.systemConfigFormSnapshot({ ...draft, name: draft.name + " " }),
    ),
  ).toBe(false);
  expect(F.systemConfigSnapshotsEqual(base, F.systemConfigFormSnapshot(draft))).toBe(true);
  expect(F.switchSystemConfigType(form("string", "FALSE"), "boolean").configValue).toBe("false");
  expect(F.switchSystemConfigType(form("string", "bad"), "boolean").configValue).toBe("bad");
});
it("远程校验只适用于已启用且 key/type 未变", () => {
  const draft = { ...form(), configKey: "key", enabled: true };
  expect(F.shouldValidateConfigValue(row(), draft)).toBe(true);
  for (const original of [
    undefined,
    row({ enabled: false }),
    row({ enabled: null }),
    row({ configKey: "other" }),
    row({ configType: "INTEGER" }),
    row({ configType: "NUMBER" }),
  ])
    expect(F.shouldValidateConfigValue(original, draft)).toBe(false);
});
it("预检 true/false/异常/畸形分别映射", () => {
  expect(F.configKeyPrecheckError(false)).toBeUndefined();
  expect(F.configKeyPrecheckError(true)).toContain("已存在");
  expect(F.configValuePrecheckError(false)).toContain("未通过");
  expect(F.configValuePrecheckError(true)).toBeUndefined();
  for (const value of [null, undefined, 0, "false", {}]) {
    expect(F.configKeyPrecheckError(value)).toContain("无法确认");
    expect(F.configValuePrecheckError(value)).toContain("无法确认");
  }
  expect(F.configKeyPrecheckError(false, true)).toContain("无法确认");
});
it("读回已启用匹配 id/type/value；禁用 null 成功", () => {
  const payload = F.buildSystemConfigCreatePayload({
    ...form(),
    name: "名称",
    configKey: "key",
    configValue: "text",
    enabled: true,
  });
  expect(() => F.verifySavedConfig(row({ description: "" }), 9, payload, "STRING")).not.toThrow();
  for (const data of [
    null,
    row({ id: 2 }),
    row({ configType: "JSON" }),
    row({ configValue: "different" }),
    row({ enabled: false }),
  ])
    expect(() => F.verifySavedConfig(data, 9, payload, "STRING")).toThrow();
  expect(() =>
    F.verifySavedConfig(null, 9, { ...payload, enabled: false }, "STRING"),
  ).not.toThrow();
  expect(() => F.verifySavedConfig(row(), 9, { ...payload, enabled: false }, "STRING")).toThrow();
});
