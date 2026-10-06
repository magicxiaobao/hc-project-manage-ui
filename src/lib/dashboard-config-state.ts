import type { DashboardConfigResponse, DashboardConfigVO } from './api/dashboard-types';
import { validId } from './dashboard-form';

export type DashboardConfigState = { kind: 'ready'; config: DashboardConfigVO } | { kind: 'error'; message: string };
export function dashboardConfigState(response: DashboardConfigResponse | null | undefined, dashboardId: number): DashboardConfigState {
  if (response?.success === false) return { kind: 'error', message: response.message || '获取仪表盘配置失败' };
  if (response?.success !== true || !response.config || !validId(dashboardId) || response.config.dashboardId !== dashboardId) return { kind: 'error', message: '配置响应异常：成功标记、配置或所属 ID 无效' };
  return { kind: 'ready', config: response.config };
}
