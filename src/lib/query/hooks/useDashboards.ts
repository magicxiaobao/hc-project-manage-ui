import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboardApi } from '../../api/dashboard';
import { useAuthStore } from '../../api/auth-store';
import type { DashboardCreatePayload, DashboardUpdatePayload } from '../../api/dashboard-types';
import { validId } from '../../dashboard-form';
import { queryKeys } from '../keys';

export interface DashboardListParams { page?: number; pageSize?: number; projectId?: number | null; dashboardName?: string; dashboardType?: string }
export function normalizeDashboardListParams(params: DashboardListParams = {}) {
  return { page: validId(params.page) ? params.page : 1, pageSize: validId(params.pageSize) ? params.pageSize : 12,
    bean: { projectId: params.projectId ?? 0, ...(params.dashboardName?.trim() ? { dashboardName: params.dashboardName.trim() } : {}), ...(params.dashboardType?.trim() ? { dashboardType: params.dashboardType.trim() } : {}) } };
}
export function useDashboardList(params: DashboardListParams = {}, open = true) {
  const authenticated = useAuthStore(s => s.isAuthenticated);
  const normalized = normalizeDashboardListParams(params);
  return useQuery({ queryKey: queryKeys.dashboard.list(normalized), queryFn: () => dashboardApi.findByPage(normalized), enabled: authenticated && open && validId(normalized.bean.projectId) });
}
export function useDashboardDetail(id?: number | null, open = true) {
  const authenticated = useAuthStore(s => s.isAuthenticated);
  return useQuery({ queryKey: queryKeys.dashboard.detail(id ?? 0), queryFn: () => dashboardApi.getById(id!), enabled: authenticated && open && validId(id), staleTime: 0 });
}
export function useDashboardConfig(id?: number | null, open = true) {
  const authenticated = useAuthStore(s => s.isAuthenticated);
  return useQuery({ queryKey: queryKeys.dashboard.config(id ?? 0), queryFn: () => dashboardApi.getConfig(id!), enabled: authenticated && open && validId(id), staleTime: 0 });
}
export function useCreateDashboard() {
  const client = useQueryClient();
  return useMutation({ retry: false, mutationFn: async (data: DashboardCreatePayload) => {
    const id = await dashboardApi.createDashboard(data);
    // Controller 返回 0 不是成功创建；不能进入编辑流程或清除草稿。
    if (!validId(id)) throw new Error('创建响应异常：未返回有效仪表盘 ID');
    return id;
  }, onSuccess: id => {
    void client.invalidateQueries({ queryKey: queryKeys.dashboard.all, predicate: q => q.queryKey[2] === 'list' });
    void client.invalidateQueries({ queryKey: queryKeys.dashboard.detail(id) });
  } });
}
function useDashboardMutation<T>(fn: (data: T) => Promise<string>, getId: (data: T) => number, invalid = false) {
  const client = useQueryClient();
  return useMutation({ retry: false, mutationFn: fn, onSuccess: (_result, data) => {
    // 仅该域列表与目标详情/config；失败不本地移除行。
    void client.invalidateQueries({ queryKey: queryKeys.dashboard.all, predicate: q => q.queryKey[2] === 'list' });
    void client.invalidateQueries({ queryKey: queryKeys.dashboard.detail(getId(data)) });
    void client.invalidateQueries({ queryKey: queryKeys.dashboard.config(getId(data)) });
    if (invalid) void client.invalidateQueries({ queryKey: queryKeys.dashboardWidget.all });
  } });
}
export const useUpdateDashboard = () => useDashboardMutation((data: DashboardUpdatePayload) => dashboardApi.updateDashboard(data), data => data.id);
export const useValidDashboard = () => useDashboardMutation(dashboardApi.validDashboard, id => id);
export const useInvalidDashboard = () => useDashboardMutation(dashboardApi.invalidDashboard, id => id, true);
