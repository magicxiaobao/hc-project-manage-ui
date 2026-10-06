import { useQuery } from "@tanstack/react-query";
import { workLogApi } from "../../api/worklog";
import { useAuthStore } from "../../api/auth-store";
import type { WorkLogAnalyticsRequest } from "../../api/worklog-types";
import {
  normalizeWorkLogAnalytics,
  validWorkLogAnalyticsSnapshot,
  type WorkLogDimension,
} from "../../worklog-analytics-data";
import { queryKeys } from "../keys";
function requireSnapshot(params: WorkLogAnalyticsRequest | null) {
  if (!useAuthStore.getState().isAuthenticated) throw new Error("请登录后查看工时统计");
  if (!validWorkLogAnalyticsSnapshot(params)) throw new Error("请选择有效项目与日期范围");
}
export function useWorkLogAnalytics(applied: WorkLogAnalyticsRequest | null, enabled = true) {
  const auth = useAuthStore((state) => state.isAuthenticated);
  const params = applied ? normalizeWorkLogAnalytics("analytics", applied) : null;
  return useQuery({
    queryKey: queryKeys.workLog.analytics(params),
    enabled: auth && enabled && validWorkLogAnalyticsSnapshot(params),
    queryFn: () => {
      requireSnapshot(params);
      return workLogApi.getAnalytics(params!);
    },
  });
}
export function useWorkLogStatistics(
  dimension: WorkLogDimension,
  applied: WorkLogAnalyticsRequest | null,
  enabled = true,
) {
  const auth = useAuthStore((state) => state.isAuthenticated);
  const params = applied ? normalizeWorkLogAnalytics(dimension, applied) : null;
  const methods = {
    projects: workLogApi.getProjectStatisticsList,
    users: workLogApi.getUserStatisticsList,
    tasks: workLogApi.getTaskStatisticsList,
  };
  return useQuery({
    queryKey: queryKeys.workLog.statisticsGroup(dimension, params),
    enabled: auth && enabled && validWorkLogAnalyticsSnapshot(params),
    queryFn: () => {
      requireSnapshot(params);
      return methods[dimension](params!);
    },
  });
}
