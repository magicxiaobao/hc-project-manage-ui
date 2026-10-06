import type { SystemConfigQuery } from "./api/system-types";
export type ConfigType = "string" | "number" | "boolean" | "json";
export const CONFIG_TYPES = [
  { id: "string", label: "字符串" },
  { id: "number", label: "数字（整数）" },
  { id: "boolean", label: "布尔" },
  { id: "json", label: "JSON" },
];
const wires: Record<ConfigType, string> = {
  string: "STRING",
  number: "INTEGER",
  boolean: "BOOLEAN",
  json: "JSON",
};
export const configTypeToWire = (type: string): string | null =>
  Object.hasOwn(wires, type) ? wires[type as ConfigType] : null;
export const configTypeFromWire = (type: unknown): ConfigType | null => {
  if (typeof type !== "string") return null;
  return (
    (Object.keys(wires) as ConfigType[]).find((key) => wires[key] === type.toUpperCase()) ?? null
  );
};
export const configTypeLabel = (type: unknown) => {
  const ui = configTypeFromWire(type);
  return ui
    ? CONFIG_TYPES.find((item) => item.id === ui)!.label
    : `${type ?? "—"}（未知类型，请核对）`;
};
export const isSystemConfigId = (id: unknown): id is number =>
  typeof id === "number" && Number.isSafeInteger(id) && id > 0;
export function requireSystemConfigId(id: unknown): asserts id is number {
  if (!isSystemConfigId(id)) throw new Error("配置 ID 无效");
}
export interface SystemConfigListParams {
  page: number;
  pageSize: number;
  bean: SystemConfigQuery;
}
const positive = (value: number, fallback: number) =>
  Number.isSafeInteger(value) && value > 0 ? value : fallback;
/** filters.configType 是 UI 类型；规范化后的 bean 是 wire 类型。 */
export function systemConfigListParams(
  page = 1,
  pageSize = 10,
  filters: { configKey?: string; configType?: string } = {},
): SystemConfigListParams {
  const configKey = filters.configKey?.trim();
  const configType = configTypeToWire(filters.configType ?? "");
  return {
    page: positive(page, 1),
    pageSize: positive(pageSize, 10),
    bean: {
      ...(configKey ? { configKey } : {}),
      ...(configType ? { configType } : {}),
    },
  };
}
export const normalizeSystemConfigListParams = (params: SystemConfigListParams) =>
  systemConfigListParams(params.page, params.pageSize, {
    configKey: params.bean.configKey,
    configType: configTypeFromWire(params.bean.configType) ?? "",
  });
export const configEnabledLabel = (enabled: unknown) =>
  enabled === true ? "启用" : enabled === false ? "禁用" : "未知";
export const configEnabledAction = (enabled: unknown) =>
  enabled === true ? "invalid" : enabled === false ? "valid" : null;
