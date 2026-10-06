import { api } from './client';
import type { PageRequest, PageResult } from './types';
import type {
  DashboardCreatePayload,
  DashboardUpdatePayload,
  DashboardQueryRequest,
  DashboardResponse,
  DashboardConfigResponse,
  DashboardWidgetCreatePayload,
  DashboardWidgetUpdatePayload,
  DashboardWidgetQueryRequest,
  DashboardWidgetResponse,
} from './dashboard-types';

/** DashboardController 的八个实际端点；身份与生命周期由后端保留。 */
export const dashboardApi = {
  createDashboard: (payload: DashboardCreatePayload) =>
    api.post<number>('/dashboard/v1/createDashboard', payload),
  updateDashboard: (payload: DashboardUpdatePayload) =>
    api.post<string>('/dashboard/v1/updateDashboard', payload),
  validDashboard: (id: number) => api.post<string>(`/dashboard/v1/valid/${id}`),
  invalidDashboard: (id: number) => api.post<string>(`/dashboard/v1/invalid/${id}`),
  getById: (id: number) => api.get<DashboardResponse>(`/dashboard/v1/findById/${id}`),
  findByPage: (page: PageRequest<DashboardQueryRequest>) =>
    api.post<PageResult<DashboardResponse>>('/dashboard/v1/findByPage', page),
  /** 内层 success=false 是正常返回，保留消息与配置原值。 */
  getConfig: (dashboardId: number) =>
    api.get<DashboardConfigResponse>(`/dashboard/v1/${dashboardId}/config`),
  /** 当前用户的默认项；无默认项或 Controller 捕获异常时可能为 null。 */
  getDefault: () => api.get<DashboardResponse | null>('/dashboard/v1/default'),
};

export const dashboardWidgetApi = {
  createDashboardWidget: (payload: DashboardWidgetCreatePayload) =>
    api.post<number>('/dashboardWidget/v1/createDashboardWidget', payload),
  updateDashboardWidget: (payload: DashboardWidgetUpdatePayload) =>
    api.post<string>('/dashboardWidget/v1/updateDashboardWidget', payload),
  validDashboardWidget: (id: number) => api.post<string>(`/dashboardWidget/v1/valid/${id}`),
  invalidDashboardWidget: (id: number) => api.post<string>(`/dashboardWidget/v1/invalid/${id}`),
  getById: (id: number) => api.get<DashboardWidgetResponse>(`/dashboardWidget/v1/findById/${id}`),
  findByPage: (page: PageRequest<DashboardWidgetQueryRequest>) =>
    api.post<PageResult<DashboardWidgetResponse>>('/dashboardWidget/v1/findByPage', page),
};
