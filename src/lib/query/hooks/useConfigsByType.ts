import { useQuery } from "@tanstack/react-query";
import { systemApi } from "../../api/system";
import { configTypeToWire, type ConfigType } from "../../system-config-query";
import { queryKeys } from "../keys";
import {
  assertSystemConfigAccess,
  protectSystemConfigQuery,
  systemConfigAccessible,
  useSystemConfigAccess,
} from "./useSystemConfigs";
export const configsByTypeOptions = (type: ConfigType | "", enabled = true) => {
  const configType = configTypeToWire(type);
  return {
    queryKey: queryKeys.system.list({ kind: "configsByType", configType }),
    queryFn: () => {
      assertSystemConfigAccess();
      if (!configType) throw new Error("配置类型不支持");
      return systemApi.systemConfig.getConfigsByType(configType);
    },
    enabled: enabled && systemConfigAccessible() && configType !== null,
  };
};
/** 保留 configValue 原始 String，解析由消费域决定。全部接口仍需 system:admin。 */
export function useConfigsByType(type: ConfigType | "", enabled = true) {
  const accessible = useSystemConfigAccess();
  return protectSystemConfigQuery(
    useQuery(configsByTypeOptions(type, accessible && enabled)),
    accessible,
  );
}
