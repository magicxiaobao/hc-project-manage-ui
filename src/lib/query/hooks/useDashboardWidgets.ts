import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboardWidgetApi } from '../../api/dashboard';
import { useAuthStore } from '../../api/auth-store';
import type { DashboardWidgetCreatePayload, DashboardWidgetUpdatePayload } from '../../api/dashboard-types';
import { validId } from '../../dashboard-form';
import { queryKeys } from '../keys';

export interface DashboardWidgetListParams { page?: number; pageSize?: number; dashboardId?: number | null }
export function normalizeDashboardWidgetListParams(params: DashboardWidgetListParams = {}) {
  return { page: validId(params.page) ? params.page : 1, pageSize: validId(params.pageSize) ? params.pageSize : 12, bean: { dashboardId: params.dashboardId ?? 0 } };
}
export function useDashboardWidgetList(params: DashboardWidgetListParams = {}, open = true) {
  const authenticated = useAuthStore(s => s.isAuthenticated);
  const normalized = normalizeDashboardWidgetListParams(params);
  return useQuery({ queryKey: queryKeys.dashboardWidget.list(normalized), queryFn: () => dashboardWidgetApi.findByPage(normalized), enabled: authenticated && open && validId(normalized.bean.dashboardId) });
}
export function useDashboardWidgetDetail(id?: number | null, open = true) {
  const authenticated = useAuthStore(s => s.isAuthenticated);
  return useQuery({ queryKey: queryKeys.dashboardWidget.detail(id ?? 0), queryFn: () => dashboardWidgetApi.getById(id!), enabled: authenticated && open && validId(id), staleTime: 0 });
}
function useWidgetMutation<T>(fn: (data: T) => Promise<string | number>, getId: (data: T, result: string | number) => number, dashboardId: number) {
  const client = useQueryClient();
  return useMutation({ retry: false, mutationFn: fn, onSuccess: (result, data) => {
    void client.invalidateQueries({ queryKey: queryKeys.dashboardWidget.all, predicate: q => q.queryKey[2] === 'list' });
    void client.invalidateQueries({ queryKey: queryKeys.dashboardWidget.detail(getId(data, result)) });
    // B3: DashboardServiceImpl.getDashboardConfig 只解析 dashboardConfig JSON，
    // WidgetService 不同步它。重取真实 GET，不能 setQueryData 合成布局。
    void client.invalidateQueries({ queryKey: queryKeys.dashboard.config(dashboardId), refetchType: 'all' });
  } });
}
export function useCreateDashboardWidget(dashboardId: number) {
  return useWidgetMutation(async (data: DashboardWidgetCreatePayload) => {
    const id = await dashboardWidgetApi.createDashboardWidget(data);
    if (!validId(id)) throw new Error('创建响应异常：未返回有效小部件 ID');
    return id;
  }, (_data, result) => result as number, dashboardId);
}
export const useUpdateDashboardWidget = (dashboardId: number) => useWidgetMutation((data: DashboardWidgetUpdatePayload) => dashboardWidgetApi.updateDashboardWidget(data), data => data.id, dashboardId);
export const useValidDashboardWidget = (dashboardId: number) => useWidgetMutation(dashboardWidgetApi.validDashboardWidget, id => id, dashboardId);
export const useInvalidDashboardWidget = (dashboardId: number) => useWidgetMutation(dashboardWidgetApi.invalidDashboardWidget, id => id, dashboardId);
