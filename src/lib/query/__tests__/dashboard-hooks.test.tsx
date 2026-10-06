// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { useAuthStore } from '../../api/auth-store';
import { dashboardApi, dashboardWidgetApi } from '../../api/dashboard';
import { queryKeys } from '../keys';
import { normalizeDashboardListParams, useCreateDashboard, useDashboardConfig, useDashboardDetail, useDashboardList, useInvalidDashboard, useUpdateDashboard, useValidDashboard } from '../hooks/useDashboards';
import { useCreateDashboardWidget, useDashboardWidgetDetail, useDashboardWidgetList, useInvalidDashboardWidget, useUpdateDashboardWidget, useValidDashboardWidget } from '../hooks/useDashboardWidgets';

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
const page = { list: [], total: 0, pageNumber: 1, pageSize: 12 };
const config = { success: true, message: null, config: { dashboardId: 9, dashboardName: '真实配置', dashboardType: null, layout: [], theme: null, refresh: null, permissions: null, customConfig: null } };
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  useAuthStore.setState({ isAuthenticated: true });
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); useAuthStore.setState({ isAuthenticated: false }); });
describe('dashboard/widget 范围与失效', () => {
  it('同一归一化参数用于 key 与分页 wrapper，不带 pageNum/平铺筛选', async () => {
    const spy = vi.spyOn(dashboardApi, 'findByPage').mockResolvedValue(page);
    const params = { projectId: 3, dashboardName: ' 名称 ', dashboardType: ' 项目仪表板 ' };
    const normalized = normalizeDashboardListParams(params);
    const hook = renderHook(() => useDashboardList(params), { wrapper });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledWith({ page: 1, pageSize: 12, bean: { projectId: 3, dashboardName: '名称', dashboardType: '项目仪表板' } });
    expect(client.getQueryData(queryKeys.dashboard.list(normalized))).toEqual(page);
    expect(queryKeys.dashboard.config(9)).toEqual(['hc', 'dashboard', 'config', 9]);
  });
  it.each([null, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('无有效范围 %s 时全部读取 disabled', id => {
    const list = vi.spyOn(dashboardApi, 'findByPage'); const get = vi.spyOn(dashboardApi, 'getById'); const conf = vi.spyOn(dashboardApi, 'getConfig');
    const widgets = vi.spyOn(dashboardWidgetApi, 'findByPage'); const widget = vi.spyOn(dashboardWidgetApi, 'getById');
    const hook = renderHook(() => [useDashboardList({ projectId: id }), useDashboardDetail(id), useDashboardConfig(id), useDashboardWidgetList({ dashboardId: id }), useDashboardWidgetDetail(id)], { wrapper });
    expect(hook.result.current.every(query => query.fetchStatus === 'idle')).toBe(true);
    for (const spy of [list, get, conf, widgets, widget]) expect(spy).not.toHaveBeenCalled();
  });
  it('未登录/open=false 不请求，跨项目不使用旧 placeholder', async () => {
    const spy = vi.spyOn(dashboardApi, 'findByPage').mockResolvedValue(page);
    useAuthStore.setState({ isAuthenticated: false });
    const hook = renderHook(({ id, open }) => useDashboardList({ projectId: id }, open), { wrapper, initialProps: { id: 3, open: false } });
    expect(spy).not.toHaveBeenCalled();
    act(() => useAuthStore.setState({ isAuthenticated: true }));
    expect(spy).not.toHaveBeenCalled();
    hook.rerender({ id: 3, open: true });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    spy.mockImplementation(() => new Promise(() => {}));
    hook.rerender({ id: 4, open: true });
    expect(hook.result.current.data).toBeUndefined();
    expect(spy).toHaveBeenLastCalledWith({ page: 1, pageSize: 12, bean: { projectId: 4 } });
  });
  it('widget 变更真实重取 config，但重取不证明 layout 已同步', async () => {
    const get = vi.spyOn(dashboardApi, 'getConfig').mockResolvedValue(config);
    const create = vi.spyOn(dashboardWidgetApi, 'createDashboardWidget').mockResolvedValue(11);
    const hook = renderHook(() => ({ config: useDashboardConfig(9), create: useCreateDashboardWidget(9) }), { wrapper });
    await waitFor(() => expect(hook.result.current.config.isSuccess).toBe(true));
    await act(async () => { await hook.result.current.create.mutateAsync({ dashboardId: 9, widgetName: '小部件', widgetConfig: '{}' }); });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(create).toHaveBeenCalledTimes(1);
    expect(hook.result.current.config.data?.config?.layout).toEqual([]);
    expect(client.getQueryState(queryKeys.dashboardWidget.detail(11))).toBeUndefined();
  });
  it('所有 dashboard mutation 失效列表与目标 detail/config，invalid 加 widget', async () => {
    vi.spyOn(dashboardApi, 'createDashboard').mockResolvedValue(7);
    vi.spyOn(dashboardApi, 'updateDashboard').mockResolvedValue('ok');
    vi.spyOn(dashboardApi, 'validDashboard').mockResolvedValue('ok');
    vi.spyOn(dashboardApi, 'invalidDashboard').mockResolvedValue('ok');
    const spy = vi.spyOn(client, 'invalidateQueries');
    const hook = renderHook(() => ({ create: useCreateDashboard(), update: useUpdateDashboard(), valid: useValidDashboard(), invalid: useInvalidDashboard() }), { wrapper });
    await act(async () => {
      await hook.result.current.create.mutateAsync({ projectId: 3, dashboardName: '新建' });
      await hook.result.current.update.mutateAsync({ id: 7, dashboardName: '更新' });
      await hook.result.current.valid.mutateAsync(7); await hook.result.current.invalid.mutateAsync(7);
    });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: queryKeys.dashboard.all }));
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.dashboard.detail(7) });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.dashboard.config(7) });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.dashboardWidget.all });
  });
  it('widget update/valid/invalid 不合成缓存，失效对应详情/父 config', async () => {
    vi.spyOn(dashboardWidgetApi, 'updateDashboardWidget').mockResolvedValue('ok');
    vi.spyOn(dashboardWidgetApi, 'validDashboardWidget').mockResolvedValue('ok');
    vi.spyOn(dashboardWidgetApi, 'invalidDashboardWidget').mockResolvedValue('ok');
    const spy = vi.spyOn(client, 'invalidateQueries');
    const hook = renderHook(() => ({ update: useUpdateDashboardWidget(9), valid: useValidDashboardWidget(9), invalid: useInvalidDashboardWidget(9) }), { wrapper });
    await act(async () => { await hook.result.current.update.mutateAsync({ id: 11 }); await hook.result.current.valid.mutateAsync(11); await hook.result.current.invalid.mutateAsync(11); });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: queryKeys.dashboardWidget.all }));
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.dashboardWidget.detail(11) });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.dashboard.config(9), refetchType: 'all' });
  });
  it('失败不失效、不乐观删行，mutation 不重试，create 0 拒绝成功', async () => {
    const spy = vi.spyOn(dashboardApi, 'invalidDashboard').mockRejectedValue(new Error('无权限'));
    vi.spyOn(dashboardApi, 'createDashboard').mockResolvedValue(0);
    vi.spyOn(dashboardWidgetApi, 'createDashboardWidget').mockResolvedValue(0);
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const hook = renderHook(() => ({ invalid: useInvalidDashboard(), create: useCreateDashboard(), widget: useCreateDashboardWidget(9) }), { wrapper });
    await act(async () => {
      await expect(hook.result.current.invalid.mutateAsync(7)).rejects.toThrow('无权限');
      await expect(hook.result.current.create.mutateAsync({})).rejects.toThrow('有效仪表盘 ID');
      await expect(hook.result.current.widget.mutateAsync({})).rejects.toThrow('有效小部件 ID');
    });
    expect(spy).toHaveBeenCalledTimes(1); expect(invalidate).not.toHaveBeenCalled();
  });
});
