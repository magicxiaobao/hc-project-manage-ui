import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiBusinessError, HttpResponseError } from '../client';
import { dashboardApi, dashboardWidgetApi } from '../dashboard';
import type {
  DashboardCreatePayload,
  DashboardUpdatePayload,
  DashboardResponse,
  DashboardConfigResponse,
  DashboardWidgetCreatePayload,
  DashboardWidgetUpdatePayload,
  DashboardWidgetResponse,
  DashboardQueryRequest,
  DashboardWidgetQueryRequest,
} from '../dashboard-types';
import type { PageRequest } from '../types';

// 仅替换模块单例的配置，get/post/request 与错误处理使用真实统一客户端。
vi.mock('../client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../client')>();
  return {
    ...actual,
    api: actual.createApiClient({ baseUrl: 'http://test', getToken: () => 'collab-token' }),
  };
});

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

function reply(result: unknown, status = 200, code = 1) {
  fetchMock.mockImplementation(
    async () =>
      new Response(JSON.stringify({ code, msg: code === 1 ? 'ok' : '参数错误', result }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
}

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  reply(null);
});

afterEach(() => vi.unstubAllGlobals());

function pathAndMethod(path: string, method: 'GET' | 'POST') {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [input, init] = fetchMock.mock.calls[0];
  const url = new URL(String(input));
  expect(url.pathname).toBe(path);
  expect(init?.method).toBe(method);
  return { url, init };
}

function request(path: string, method: 'GET' | 'POST', body?: unknown) {
  const sent = pathAndMethod(path, method);
  if (body === undefined) expect(sent.init?.body).toBeUndefined();
  else {
    expect(new Headers(sent.init?.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(sent.init?.body))).toEqual(body);
  }
  return sent;
}

const dashboardPayload = {
  dashboardName: '研发看板',
  description: null,
  dashboardType: '项目仪表板',
  projectId: 3,
  ownerId: 4,
  dashboardConfig: '{}',
  isDefault: false,
  isPublic: false,
  sortOrder: 0,
  status: 'active',
  refreshInterval: 0,
  autoRefresh: false,
  theme: '',
  accessConfig: '{}',
  lastAccessedAt: '2026-10-05T09:00:00',
  accessCount: 0,
} satisfies DashboardCreatePayload;
const dashboardUpdate = { ...dashboardPayload, id: 7 } satisfies DashboardUpdatePayload;
const dashboard = {
  ...dashboardPayload,
  id: 7,
  createdAt: 0,
  updatedAt: null,
} satisfies DashboardResponse;
const widgetPayload = {
  dashboardId: 7,
  widgetName: '统计',
  widgetTitle: null,
  widgetType: 'chart',
  dataSource: '',
  widgetConfig: '{}',
  positionX: 0,
  positionY: 0,
  width: 0,
  height: 0,
  sortOrder: 0,
  isVisible: false,
  isResizable: false,
  isDraggable: false,
  refreshInterval: 0,
  autoRefresh: false,
  styleConfig: '{}',
  filterConfig: '{}',
  lastUpdatedAt: '2026-10-05T09:00:00',
} satisfies DashboardWidgetCreatePayload;
const widgetUpdate = { ...widgetPayload, id: 8 } satisfies DashboardWidgetUpdatePayload;
const widget = {
  ...widgetPayload,
  id: 8,
  createdAt: null,
  updatedAt: 0,
} satisfies DashboardWidgetResponse;
const dashboardPage = {
  page: 2,
  pageSize: 5,
  bean: {
    dashboardName: '看板',
    dashboardType: '项目仪表板',
    projectId: 0,
    ownerId: 4,
    status: null,
  },
  sorts: { sortOrder: 'asc' },
} satisfies PageRequest<DashboardQueryRequest>;
const widgetPage = {
  page: 1,
  pageSize: 10,
  bean: { dashboardId: 7, widgetName: '统计', widgetType: 'chart', dataSource: '' },
  sorts: { positionX: 'asc' },
} satisfies PageRequest<DashboardWidgetQueryRequest>;
const config = {
  success: true,
  message: null,
  config: {
    dashboardId: 7,
    dashboardName: '研发看板',
    dashboardType: '项目仪表板',
    layout: [{ id: 'chart-1', type: 'chart', x: 0, y: 0, w: 4, h: 2, config: { series: [] } }],
    theme: { name: 'light', primaryColor: '#123456', backgroundColor: null, fontSize: '14px' },
    refresh: { autoRefresh: false, interval: 0, strategy: null },
    permissions: {
      editable: false,
      deletable: false,
      shareable: false,
      accessPermissions: ['view'],
    },
    customConfig: { feature: false, count: 0 },
  },
} satisfies DashboardConfigResponse;

describe('dashboardApi（8 个端点）', () => {
  it('createDashboard：完整 JSON，Long 解包与 token 头', async () => {
    reply(7);
    expect(await dashboardApi.createDashboard(dashboardPayload)).toBe(7);
    const { init } = request('/dashboard/v1/createDashboard', 'POST', dashboardPayload);
    expect(new Headers(init?.headers).get('token')).toBe('collab-token');
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);
  });
  it('updateDashboard：保留 id/false/0/null，省略 undefined', async () => {
    reply('更新成功');
    expect(await dashboardApi.updateDashboard({ ...dashboardUpdate, theme: undefined })).toBe(
      '更新成功',
    );
    const { theme: _omitted, ...expected } = dashboardUpdate;
    request('/dashboard/v1/updateDashboard', 'POST', expected);
  });
  it.each([
    ['validDashboard', '/dashboard/v1/valid/7'],
    ['invalidDashboard', '/dashboard/v1/invalid/7'],
  ] as const)('%s：无 body 的 POST 与 String 解包', async (method, path) => {
    reply('成功');
    expect(await dashboardApi[method](7)).toBe('成功');
    request(path, 'POST');
  });
  it('getById：实体可空标量、false、0 原样解包', async () => {
    reply(dashboard);
    expect(await dashboardApi.getById(7)).toEqual(dashboard);
    request('/dashboard/v1/findById/7', 'GET');
  });
  it('findByPage：精确 page/pageSize/bean/sorts 与 PageResult 解包', async () => {
    const result = { list: [dashboard], total: 1, pageNumber: 2, pageSize: 5 };
    reply(result);
    expect(await dashboardApi.findByPage(dashboardPage)).toEqual(result);
    request('/dashboard/v1/findByPage', 'POST', dashboardPage);
  });
  it('getConfig：成功配置包含完整嵌套 DTO', async () => {
    reply(config);
    expect(await dashboardApi.getConfig(7)).toEqual(config);
    request('/dashboard/v1/7/config', 'GET');
  });
  it('getConfig：外层成功时保留内部 success=false/message/null', async () => {
    const result = {
      success: false,
      message: '配置读取失败',
      config: null,
    } satisfies DashboardConfigResponse;
    reply(result);
    expect(await dashboardApi.getConfig(7)).toEqual(result);
    request('/dashboard/v1/7/config', 'GET');
  });
  it('getDefault：保留 Controller 返回的 null', async () => {
    reply(null);
    expect(await dashboardApi.getDefault()).toBeNull();
    request('/dashboard/v1/default', 'GET');
  });
});

describe('dashboardWidgetApi（6 个端点）', () => {
  it('createDashboardWidget：完整 JSON 与 Long 解包', async () => {
    reply(8);
    expect(await dashboardWidgetApi.createDashboardWidget(widgetPayload)).toBe(8);
    request('/dashboardWidget/v1/createDashboardWidget', 'POST', widgetPayload);
  });
  it('updateDashboardWidget：定位 id 与完整 JSON', async () => {
    reply('成功');
    expect(await dashboardWidgetApi.updateDashboardWidget(widgetUpdate)).toBe('成功');
    request('/dashboardWidget/v1/updateDashboardWidget', 'POST', widgetUpdate);
  });
  it.each([
    ['validDashboardWidget', '/dashboardWidget/v1/valid/8'],
    ['invalidDashboardWidget', '/dashboardWidget/v1/invalid/8'],
  ] as const)('%s：无 body 的 POST', async (method, path) => {
    reply('成功');
    expect(await dashboardWidgetApi[method](8)).toBe('成功');
    request(path, 'POST');
  });
  it('getById：保留 null/false/0', async () => {
    reply(widget);
    expect(await dashboardWidgetApi.getById(8)).toEqual(widget);
    request('/dashboardWidget/v1/findById/8', 'GET');
  });
  it('findByPage：精确分页 wrapper 与结果', async () => {
    const result = { list: [widget], total: 1, pageNumber: 1, pageSize: 10 };
    reply(result);
    expect(await dashboardWidgetApi.findByPage(widgetPage)).toEqual(result);
    request('/dashboardWidget/v1/findByPage', 'POST', widgetPage);
  });
});

describe('统一客户端错误分类', () => {
  it.each([200, 400])('HTTP %i 失败信封：ApiBusinessError 保留 code/httpStatus', async (status) => {
    reply(null, status, 10009);
    const error = await dashboardApi.getById(7).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ApiBusinessError);
    expect(error).toMatchObject({
      code: 10009,
      httpStatus: status,
      result: null,
      message: '参数错误',
    });
    request('/dashboard/v1/findById/7', 'GET');
  });
  it.each([
    ['非信封 JSON', JSON.stringify({ error: '参数错误' })],
    ['畸形 JSON', 'invalid json'],
  ])('HTTP 400 %s：HttpResponseError 保留状态', async (_label, body) => {
    fetchMock.mockImplementation(async () => new Response(body, { status: 400 }));
    const error = await dashboardApi.getById(7).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(HttpResponseError);
    expect(error).toMatchObject({ httpStatus: 400 });
    request('/dashboard/v1/findById/7', 'GET');
  });
});
