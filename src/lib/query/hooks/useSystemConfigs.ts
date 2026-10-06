import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { systemApi } from "../../api/system";
import type { SystemConfigCreatePayload, SystemConfigUpdatePayload } from "../../api/system-types";
import { hasSystemAdmin, useAuthStore } from "../../api/auth-store";
import {
  normalizeSystemConfigListParams,
  requireSystemConfigId,
  isSystemConfigId,
  type SystemConfigListParams,
} from "../../system-config-query";
import { queryKeys } from "../keys";
export const systemConfigAccessible = () => {
  const state = useAuthStore.getState();
  return state.isAuthenticated && hasSystemAdmin(state.user?.authorities);
};
export function useSystemConfigAccess() {
  return useAuthStore((state) => state.isAuthenticated && hasSystemAdmin(state.user?.authorities));
}
export function assertSystemConfigAccess() {
  if (!systemConfigAccessible()) throw new Error("需要系统管理员权限");
}
export const systemConfigListOptions = (params: SystemConfigListParams, enabled: boolean) => {
  const request = normalizeSystemConfigListParams(params);
  return {
    queryKey: queryKeys.system.list({ kind: "systemConfigList", ...request }),
    queryFn: () => {
      assertSystemConfigAccess();
      return systemApi.systemConfig.findByPage(request);
    },
    enabled: enabled && systemConfigAccessible(),
  };
};
export const systemConfigDetailOptions = (configId: number | null, enabled: boolean) => ({
  queryKey: queryKeys.system.list({ kind: "systemConfigDetail", configId }),
  queryFn: async () => {
    assertSystemConfigAccess();
    requireSystemConfigId(configId);
    const row = await systemApi.systemConfig.findById(configId);
    if (row.id !== configId) throw new Error("配置详情 ID 不匹配，请重试");
    return row;
  },
  enabled: enabled && systemConfigAccessible() && isSystemConfigId(configId),
});
export const systemConfigByKeyOptions = (configKey: string, enabled: boolean) => ({
  queryKey: queryKeys.system.list({ kind: "systemConfigByKey", configKey: configKey.trim() }),
  queryFn: () => {
    assertSystemConfigAccess();
    if (!configKey.trim()) throw new Error("配置键不能为空");
    return systemApi.systemConfig.getConfigByKey(configKey.trim());
  },
  enabled: enabled && systemConfigAccessible() && !!configKey.trim(),
});
/** disabled query 仍能命中缓存，权限撤回时同时遮蔽 data 和手动 refetch。 */
export function protectSystemConfigQuery<
  T extends { data: unknown; refetch: (...args: never[]) => unknown },
>(query: T, accessible: boolean) {
  return {
    ...query,
    data: accessible ? query.data : undefined,
    accessible,
    refetch: (...args: Parameters<T["refetch"]>): ReturnType<T["refetch"]> => {
      assertSystemConfigAccess();
      return query.refetch(...args) as ReturnType<T["refetch"]>;
    },
  };
}
export function useSystemConfigList(params: SystemConfigListParams, enabled = true) {
  const accessible = useSystemConfigAccess();
  return protectSystemConfigQuery(
    useQuery(systemConfigListOptions(params, accessible && enabled)),
    accessible,
  );
}
export function useSystemConfigDetail(id: number | null, enabled: boolean) {
  const accessible = useSystemConfigAccess();
  return protectSystemConfigQuery(
    useQuery(systemConfigDetailOptions(id, accessible && enabled)),
    accessible,
  );
}
export function useSystemConfigByKey(key: string, enabled = true) {
  const accessible = useSystemConfigAccess();
  return protectSystemConfigQuery(
    useQuery(systemConfigByKeyOptions(key, accessible && enabled)),
    accessible,
  );
}
function useSystemConfigMutation<T, R>(operation: (data: T) => Promise<R>, write = true) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: T) => {
      assertSystemConfigAccess();
      return operation(data);
    },
    onSuccess: () => {
      if (write) void client.invalidateQueries({ queryKey: queryKeys.system.all });
    },
  });
}
export const useCreateSystemConfig = () =>
  useSystemConfigMutation(async (data: SystemConfigCreatePayload) => {
    const id = await systemApi.systemConfig.createSystemConfig(data);
    if (!isSystemConfigId(id)) throw new Error("配置创建未成功：返回 ID 无效，请检查后重试");
    return id;
  });
export const useUpdateSystemConfig = () =>
  useSystemConfigMutation((data: SystemConfigUpdatePayload) => {
    requireSystemConfigId(data.id);
    return systemApi.systemConfig.updateSystemConfig(data);
  });
export const useValidSystemConfig = () =>
  useSystemConfigMutation((id: number) => {
    requireSystemConfigId(id);
    return systemApi.systemConfig.validSystemConfig(id);
  });
export const useInvalidSystemConfig = () =>
  useSystemConfigMutation((id: number) => {
    requireSystemConfigId(id);
    return systemApi.systemConfig.invalidSystemConfig(id);
  });
export const useCheckConfigKey = () =>
  useSystemConfigMutation(async (key: string) => {
    const result = await systemApi.systemConfig.existsByConfigKey(key);
    if (typeof result !== "boolean") throw new Error("未返回有效的编码唯一性结果");
    return result;
  }, false);
export const useValidateConfigValue = () =>
  useSystemConfigMutation(async (data: { configKey: string; configValue: string }) => {
    const result = await systemApi.systemConfig.validateConfigValue(
      data.configKey,
      data.configValue,
    );
    if (typeof result !== "boolean") throw new Error("未返回有效的配置值校验结果");
    return result;
  }, false);
