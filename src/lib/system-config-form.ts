import type {
  SystemConfigResponse,
  SystemConfigCreatePayload,
  SystemConfigUpdatePayload,
} from "./api/system-types";
import { configTypeFromWire, configTypeToWire, requireSystemConfigId } from "./system-config-query";
export interface SystemConfigFormInput {
  name: string;
  configKey: string;
  configType: string;
  configValue: string;
  description: string;
  enabled: boolean;
}
export type SystemConfigFormErrors = Partial<Record<keyof SystemConfigFormInput, string>>;
export const emptySystemConfigForm = (): SystemConfigFormInput => ({
  name: "",
  configKey: "",
  configType: "string",
  configValue: "",
  description: "",
  enabled: true,
});
export const systemConfigFormFromResponse = (row: SystemConfigResponse): SystemConfigFormInput => ({
  name: row.name ?? "",
  configKey: row.configKey ?? "",
  configType: configTypeFromWire(row.configType) ?? row.configType ?? "",
  configValue:
    configTypeFromWire(row.configType) === "boolean" &&
    /^(true|false)$/i.test(row.configValue ?? "")
      ? row.configValue!.toLowerCase()
      : (row.configValue ?? ""),
  description: row.description ?? "",
  enabled: row.enabled === true,
});
/** raw 字段逐一比较，JSON 排版及空白仍属于修改。 */
export const systemConfigFormSnapshot = (form: SystemConfigFormInput) =>
  [
    form.name,
    form.configKey,
    form.configType,
    form.configValue,
    form.description,
    form.enabled,
  ] as const;
export const systemConfigSnapshotsEqual = (
  a: ReturnType<typeof systemConfigFormSnapshot>,
  b: ReturnType<typeof systemConfigFormSnapshot>,
) => a.every((value, index) => value === b[index]);
export function validateSystemConfigForm(form: SystemConfigFormInput): SystemConfigFormErrors {
  const errors: SystemConfigFormErrors = {};
  for (const field of ["name", "configKey"] as const) {
    if (!form[field].trim()) errors[field] = field === "name" ? "请输入名称" : "请输入配置键";
    else if (form[field].trim().length > 100) errors[field] = "不能超过 100 个字符";
  }
  if (form.description.length > 500) errors.description = "描述不能超过 500 个字符";
  if (!configTypeToWire(form.configType)) errors.configType = "类型不支持，请明确选择配置类型";
  const value = form.configValue.trim();
  if (!value) errors.configValue = "请输入配置值";
  else if (form.configType === "number") {
    if (
      !/^[+-]?\d+$/.test(value) ||
      !Number.isInteger(Number(value)) ||
      Number(value) < -2147483648 ||
      Number(value) > 2147483647
    )
      errors.configValue = "请输入 32 位十进制整数（-2147483648 至 2147483647）";
  } else if (form.configType === "boolean" && !["true", "false"].includes(form.configValue))
    errors.configValue = "请明确选择 true 或 false";
  else if (form.configType === "json") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed === null || typeof parsed !== "object")
        errors.configValue = "JSON 顶层必须为对象或数组";
    } catch {
      errors.configValue = "JSON 格式不合法";
    }
  }
  return errors;
}
export const normalizedConfigValue = (form: SystemConfigFormInput): string => {
  if (form.configType === "number") return String(Number(form.configValue.trim()));
  if (form.configType === "json") return JSON.stringify(JSON.parse(form.configValue));
  return form.configValue;
};
export function buildSystemConfigCreatePayload(
  form: SystemConfigFormInput,
): SystemConfigCreatePayload {
  if (Object.keys(validateSystemConfigForm(form)).length) throw new Error("表单校验未通过");
  return {
    name: form.name.trim(),
    configKey: form.configKey.trim(),
    configType: configTypeToWire(form.configType)!,
    configValue: normalizedConfigValue(form),
    description: form.description,
    enabled: form.enabled,
  };
}
export function buildSystemConfigUpdatePayload(
  id: number,
  form: SystemConfigFormInput,
  initial: SystemConfigFormInput,
): SystemConfigUpdatePayload {
  requireSystemConfigId(id);
  const payload = buildSystemConfigCreatePayload(form);
  // 后端只应用非 null 字段；未主动改变类型时省略，保留存量大小写/未知值。
  if (form.configType === initial.configType) delete payload.configType;
  return { id, ...payload };
}
export function switchSystemConfigType(
  form: SystemConfigFormInput,
  configType: string,
): SystemConfigFormInput {
  const raw = form.configValue;
  return {
    ...form,
    configType,
    configValue: configType === "boolean" && /^(true|false)$/i.test(raw) ? raw.toLowerCase() : raw,
  };
}
export const shouldValidateConfigValue = (
  row: SystemConfigResponse | undefined,
  form: SystemConfigFormInput,
) =>
  !!row &&
  row.enabled === true &&
  form.enabled === true &&
  row.configKey === form.configKey.trim() &&
  configTypeFromWire(row.configType) !== null &&
  configTypeFromWire(row.configType) === form.configType;
export const configKeyPrecheckError = (result: unknown, failed = false) =>
  failed || typeof result !== "boolean"
    ? "无法确认编码唯一性，请重试"
    : result
      ? "配置键已存在"
      : undefined;
export const configValuePrecheckError = (result: unknown, failed = false) =>
  failed || typeof result !== "boolean"
    ? "无法确认配置值校验，请重试"
    : result
      ? undefined
      : "未通过已启用配置的校验，请确认配置仍启用且类型未变化";
export function verifySavedConfig(
  row: SystemConfigResponse | null,
  id: number,
  payload: SystemConfigCreatePayload | SystemConfigUpdatePayload,
  expectedType: string | null,
) {
  if (payload.enabled === false) {
    if (row !== null) throw new Error("禁用配置仍可按键读取，请核对");
    return;
  }
  if (!row) throw new Error("已启用配置无法按键读取，请核对");
  verifySavedConfigDetail(row, id, payload, expectedType);
}
export function verifySavedConfigDetail(
  row: SystemConfigResponse,
  id: number,
  payload: SystemConfigCreatePayload | SystemConfigUpdatePayload,
  expectedType: string | null,
) {
  if (
    row.id !== id ||
    row.configType !== expectedType ||
    row.configValue !== payload.configValue ||
    row.configKey !== payload.configKey ||
    row.name !== payload.name ||
    row.description !== payload.description ||
    row.enabled !== payload.enabled
  )
    throw new Error("读取结果与保存内容不一致，请核对");
}
