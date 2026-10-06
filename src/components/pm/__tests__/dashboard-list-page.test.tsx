// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dashboardDetail, renderDashboardContent, widgetDetail } from './dashboard-test-support';
import { DashboardListPage } from '../dashboard-list-page';
import { useAuthStore } from '@/lib/api/auth-store';
import { queryKeys } from '@/lib/query';
import type { DashboardConfigResponse, DashboardResponse } from '@/lib/api/dashboard-types';

vi.mock('@/lib/api/client', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  return { ...actual, api: actual.createApiClient({ baseUrl: 'http://test', getToken: () => 'ui-test-token' }) };
});
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
let record: DashboardResponse;
let config: DashboardConfigResponse | null;
let widgetFails: boolean;
let total: number;
let requests: { path: string; method?: string; body?: Record<string, unknown> }[];
const sent = (path: string) => requests.filter(request => request.path === path);
beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: true }); record = dashboardDetail(); widgetFails = false; total = 13; requests = [];
  config = { success: true, message: null, config: { dashboardId: 7, dashboardName: '真实配置', dashboardType: null, layout: [], theme: null, refresh: null, permissions: null, customConfig: null } };
  fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const path = new URL(String(input)).pathname;
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    requests.push({ path, method: init?.method, body });
    let result: unknown;
    switch (path) {
      case '/project/v1/findByPage': result = { list: body?.page === 2 ? [{ id: 23, projectName: '项目二十三', projectKey: 'P23' }] : [{ id: 3, projectName: '项目三', projectKey: 'P3' }], total: 21, pageNumber: body?.page, pageSize: 20 }; break;
      case '/dashboard/v1/findByPage': result = { list: total ? [record] : [], total, pageNumber: body?.page, pageSize: body?.pageSize }; break;
      case '/dashboard/v1/findById/7': result = record; break;
      case '/dashboard/v1/7/config': result = config; break;
      case '/dashboard/v1/createDashboard': record = { ...record, ...body, id: 7 }; result = 7; break;
      case '/dashboard/v1/updateDashboard': record = { ...record, ...body }; result = '成功'; break;
      case '/dashboard/v1/valid/7': record = { ...record, status: '活跃' }; result = '成功'; break;
      case '/dashboard/v1/invalid/7': record = { ...record, status: '归档' }; result = '成功'; break;
      case '/dashboardWidget/v1/findByPage':
        if (widgetFails) return new Response(JSON.stringify({ code: 10009, msg: '小部件无权限', result: null }), { status: 403, headers: { 'Content-Type': 'application/json' } });
        result = { list: [widgetDetail()], total: 1, pageNumber: 1, pageSize: 12 }; break;
      case '/dashboardWidget/v1/findById/11': result = widgetDetail(); break;
      case '/dashboardWidget/v1/createDashboardWidget': result = 11; break;
      default: throw new Error(`UI 调用未批准端点 ${path}`);
    }
    expect(new Headers(init?.headers).get('token')).toBe('ui-test-token');
    return new Response(JSON.stringify({ code: 1, msg: 'ok', result }), { headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); useAuthStore.setState({ isAuthenticated: false }); });
async function selectProject() {
  await screen.findByRole('option', { name: '项目三 · P3' });
  fireEvent.change(screen.getByLabelText('项目范围'), { target: { value: '3' } });
  await screen.findByRole('heading', { name: '原名称' });
}
describe('/dashboards 消费真实统一客户端', () => {
  it('项目分页不截断、缺范围不请求；搜索/重置/pageSize 的 wrapper 与页码一致', async () => {
    await renderDashboardContent(<DashboardListPage />); await screen.findByRole('option', { name: '项目三 · P3' });
    expect(screen.getByText('请选择项目查看仪表盘')).toBeTruthy(); expect(sent('/dashboard/v1/findByPage')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '下一页项目' })); await screen.findByRole('option', { name: '项目二十三 · P23' }); expect(sent('/project/v1/findByPage').at(-1)?.body?.page).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: '上一页项目' })); await selectProject();
    fireEvent.click(screen.getByRole('button', { name: /^下一页$/ })); await waitFor(() => expect(sent('/dashboard/v1/findByPage').at(-1)?.body?.page).toBe(2));
    fireEvent.change(screen.getByLabelText('仪表盘名称'), { target: { value: ' 搜索名称 ' } }); fireEvent.change(screen.getByLabelText('仪表盘类型'), { target: { value: ' 项目仪表板 ' } }); fireEvent.click(screen.getByRole('button', { name: '搜索' }));
    await waitFor(() => expect(sent('/dashboard/v1/findByPage').at(-1)?.body).toEqual({ page: 1, pageSize: 12, bean: { projectId: 3, dashboardName: '搜索名称', dashboardType: '项目仪表板' } }));
    fireEvent.click(screen.getByRole('button', { name: '重置' })); await waitFor(() => expect(sent('/dashboard/v1/findByPage').at(-1)?.body).toEqual({ page: 1, pageSize: 12, bean: { projectId: 3 } }));
    fireEvent.change(screen.getByLabelText('每页条数'), { target: { value: '24' } }); await waitFor(() => expect(sent('/dashboard/v1/findByPage').at(-1)?.body?.pageSize).toBe(24));
    expect(requests.every(request => !/default|setDefault|archive|activate|copy|statistics|access/.test(request.path))).toBe(true);
  });
  it('新建→详情编辑→启用/invalid；取消不写，invalid 不本地删行', async () => {
    await renderDashboardContent(<DashboardListPage />); await selectProject();
    fireEvent.click(screen.getByRole('button', { name: '新建仪表盘' })); await screen.findByRole('dialog', { name: '新建仪表盘' });
    fireEvent.change(screen.getByLabelText(/仪表盘名称.*必填/), { target: { value: '新仪表盘' } }); fireEvent.click(screen.getByRole('button', { name: '保存' })); await screen.findByRole('heading', { name: '新仪表盘' });
    expect(sent('/dashboard/v1/createDashboard')[0].body).toMatchObject({ projectId: 3, dashboardName: '新仪表盘' });
    for (const field of ['ownerId', 'dashboardType', 'isDefault', 'status', 'dashboardConfig', 'accessConfig']) expect(sent('/dashboard/v1/createDashboard')[0].body).not.toHaveProperty(field);
    fireEvent.click(screen.getByRole('button', { name: '编辑' })); await screen.findByLabelText(/仪表盘名称.*必填/); expect(sent('/dashboard/v1/findById/7')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText(/仪表盘名称.*必填/), { target: { value: '编辑后' } }); fireEvent.click(screen.getByRole('button', { name: '保存' })); await screen.findByRole('heading', { name: '编辑后' });
    fireEvent.click(screen.getByRole('button', { name: /^启用$/ })); fireEvent.click(screen.getByRole('button', { name: '取消' })); expect(sent('/dashboard/v1/valid/7')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /^启用$/ })); fireEvent.click(screen.getByRole('button', { name: '确认' })); await waitFor(() => expect(sent('/dashboard/v1/valid/7')).toHaveLength(1)); await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: '删除入口（归档）' })); expect(screen.getByText(/仅归档仪表盘/)).toBeTruthy(); fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await screen.findByText(/归档 · 项目/); expect(screen.getByRole('heading', { name: '编辑后' })).toBeTruthy(); expect(sent('/dashboard/v1/invalid/7')[0]).toEqual({ path: '/dashboard/v1/invalid/7', method: 'POST', body: undefined });
  });
  it('config 内层失败可重试、widget 失败独立，null 响应明确异常', async () => {
    config = { success: false, message: '配置解析失败', config: null }; widgetFails = true;
    await renderDashboardContent(<DashboardListPage />); await selectProject(); fireEvent.click(screen.getByRole('button', { name: '查看配置' }));
    await screen.findByText('配置解析失败'); await screen.findByText(/小部件无权限/); expect(screen.queryByText('暂无布局项')).toBeNull();
    config = null; fireEvent.click(screen.getByRole('button', { name: '重新读取配置' })); await screen.findByText(/配置响应异常/);
    config = { success: true, message: null, config: { dashboardId: 7, dashboardName: '真实配置', dashboardType: null, layout: [], theme: null, refresh: null, permissions: null, customConfig: null } };
    fireEvent.click(screen.getByRole('button', { name: '重新读取配置' })); await screen.findByText('暂无布局项'); expect(screen.getAllByText('未设置').length).toBeGreaterThan(0); expect(screen.getByText(/小部件无权限/)).toBeTruthy();
  });
  it('关闭父配置/切换项目通过 widget dirty guard，路由 blocker 独立，重新读取 config 不覆盖草稿', async () => {
    const view = await renderDashboardContent(<DashboardListPage />); await selectProject(); fireEvent.click(screen.getByRole('button', { name: '查看配置' })); await screen.findByRole('button', { name: '新建小部件' });
    fireEvent.click(screen.getByRole('button', { name: '新建小部件' })); await screen.findByLabelText(/小部件名称/); fireEvent.change(screen.getByLabelText(/小部件名称/), { target: { value: '小部件草稿' } });
    fireEvent.click(screen.getByRole('button', { name: '关闭仪表盘配置与小部件' })); await screen.findByRole('dialog', { name: '是否放弃修改？' }); fireEvent.click(screen.getByRole('button', { name: '继续编辑' })); expect((screen.getByLabelText(/小部件名称/) as HTMLInputElement).value).toBe('小部件草稿');
    fireEvent.click(screen.getByRole('button', { name: '重新读取配置' })); await waitFor(() => expect(sent('/dashboard/v1/7/config')).toHaveLength(2)); expect((screen.getByLabelText(/小部件名称/) as HTMLInputElement).value).toBe('小部件草稿');
    await act(async () => { view.router.history.push('/away'); }); await screen.findByRole('dialog', { name: '是否放弃修改？' }); fireEvent.click(screen.getByRole('button', { name: '继续编辑' }));
    fireEvent.change(screen.getByLabelText('项目范围'), { target: { value: '' } }); await screen.findByRole('dialog', { name: '是否放弃修改？' }); fireEvent.click(screen.getByRole('button', { name: '放弃修改' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull()); expect(screen.getByText('请选择项目查看仪表盘')).toBeTruthy();
  });
  it('total 减少至 0 时从越界页返回第 1 页', async () => {
    const view = await renderDashboardContent(<DashboardListPage />); await selectProject(); fireEvent.click(screen.getByRole('button', { name: /^下一页$/ })); await waitFor(() => expect(sent('/dashboard/v1/findByPage').at(-1)?.body?.page).toBe(2));
    total = 0; await act(async () => { await view.client.invalidateQueries({ queryKey: queryKeys.dashboard.all }); }); await waitFor(() => expect(sent('/dashboard/v1/findByPage').at(-1)?.body?.page).toBe(1)); expect(screen.getByText('暂无仪表盘')).toBeTruthy();
  });
});
