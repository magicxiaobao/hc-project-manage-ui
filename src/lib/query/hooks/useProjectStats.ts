import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "../../api/auth-store";
import { projectStatsApi } from "../../api/project-stats";
import type { PageRequest } from "../../api/types";
import type { StatisticsProjectOptionQuery } from "../../api/project-stats-types";
import { alignComparison, normalizeCompareIds, validProjectId } from "../../project-dashboard-data";
import { queryKeys } from "../keys";

export function useProjectDashboard(projectId: number) {
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: queryKeys.project.dashboard(projectId),
    queryFn: async () => {
      const data = await projectStatsApi.getDashboard(projectId);
      if (data != null && data.projectId !== projectId)
        throw new Error("仪表盘响应异常：项目 ID 不匹配。");
      return data;
    },
    enabled: authenticated && validProjectId(projectId),
  });
}
export function useProjectProgress(projectId: number) {
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: queryKeys.project.progress(projectId),
    queryFn: async () => {
      const data = await projectStatsApi.getProgress(projectId);
      if (data != null && data.projectId !== projectId)
        throw new Error("计划响应异常：项目 ID 不匹配。");
      return data;
    },
    enabled: authenticated && validProjectId(projectId),
  });
}
export function useProjectDashboardCompare(projectIds: readonly number[]) {
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  const normalized = normalizeCompareIds(projectIds);
  return useQuery({
    queryKey: queryKeys.project.dashboardCompare(normalized.ids),
    queryFn: async () => {
      const data = await projectStatsApi.compareDashboards(normalized.ids);
      const aligned = alignComparison(normalized.ids, data);
      if (aligned.error) throw new Error(aligned.error);
      return data;
    },
    enabled: authenticated && normalized.enabled,
  });
}
export function useProjectStatistics(open = true) {
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: queryKeys.project.statistics(),
    queryFn: () => projectStatsApi.getStatistics(),
    enabled: authenticated && open,
  });
}
export function normalizeStatisticsOptions(params: PageRequest<StatisticsProjectOptionQuery>) {
  const { projectName, ...bean } = params.bean ?? {};
  const name = projectName?.trim();
  return {
    ...params,
    page: validProjectId(params.page) ? params.page : 1,
    pageSize: validProjectId(params.pageSize) ? params.pageSize : 20,
    bean: { ...bean, ...(name ? { projectName: name } : {}) },
  };
}
export function useStatisticsProjectOptions(
  params: PageRequest<StatisticsProjectOptionQuery>,
  open = true,
) {
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  const normalized = normalizeStatisticsOptions(params);
  return useQuery({
    queryKey: queryKeys.project.statisticsOptions(normalized),
    queryFn: () => projectStatsApi.findStatisticsProjectOptions(normalized),
    enabled: authenticated && open,
  });
}
