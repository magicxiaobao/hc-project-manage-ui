import { describe, expect, it } from 'vitest';
import type { DashboardConfigResponse, DashboardConfigVO } from '../api/dashboard-types';
import { dashboardConfigState } from '../dashboard-config-state';

const config: DashboardConfigVO = { dashboardId: 3, dashboardName: null, dashboardType: null, layout: null, theme: null, refresh: null, permissions: null, customConfig: null };
describe('真实 config 响应判定', () => {
  it('接受嵌套 null 和空布局，不填默认配置', () => {
    expect(dashboardConfigState({ success: true, config, message: null }, 3)).toEqual({ kind: 'ready', config });
    expect(dashboardConfigState({ success: true, config: { ...config, layout: [] }, message: null }, 3)).toMatchObject({ kind: 'ready', config: { layout: [] } });
  });
  it('内层 false 使用真实消息和兜底，不能展示其 config', () => {
    expect(dashboardConfigState({ success: false, message: '权限不足', config }, 3)).toEqual({ kind: 'error', message: '权限不足' });
    expect(dashboardConfigState({ success: false, message: null, config: null }, 3)).toEqual({ kind: 'error', message: '获取仪表盘配置失败' });
  });
  it.each([undefined, null, { success: null, config }, { config }, { success: true, config: null }, { success: true, config: { ...config, dashboardId: 4 } }])('异常响应不视为空布局：%j', response => {
    expect(dashboardConfigState(response as DashboardConfigResponse, 3).kind).toBe('error');
  });
});
