import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { projectStatsApi } from '../project-stats';
import type {
  ProjectDashboardVO,
  ProjectGanttVO,
  ProjectStatisticsVO,
  StatisticsProjectOptionQuery,
  StatisticsProjectOptionResponse,
} from '../project-stats-types';
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

const dashboard = {
  projectId: 3,
  projectName: '研发项目',
  progressPercent: 0,
  memberCount: 0,
  taskCount: 0,
  requirementCount: 0,
  bugCount: 0,
  versionCount: 0,
  totalTasks: 0,
  completedTasks: 0,
  inProgressTasks: 0,
  pendingTasks: 0,
  pausedTasks: 0,
  cancelledTasks: 0,
  unfinishedTasks: 0,
  milestoneProgress: null,
  startDate: '2026-10-05',
  endDate: null,
  progress: 0,
} satisfies ProjectDashboardVO;
const progress = {
  projectId: 3,
  projectName: '研发项目',
  startDate: 0,
  endDate: 1791244800000,
  tasks: [
    { id: 0, name: null, start: '2026-10-05', end: '2026-10-06', type: null, status: 'pending' },
  ],
} satisfies ProjectGanttVO;
const statistics = {
  totalCount: 0,
  runningCount: 0,
  completedCount: 0,
  archivedCount: null,
  pausedCount: 0,
} satisfies ProjectStatisticsVO;
const page = {
  page: 2,
  pageSize: 5,
  bean: { projectName: '研发 & + #', projectKey: '', projectType: 'agile', status: null },
  sorts: { projectName: 'asc' },
} satisfies PageRequest<StatisticsProjectOptionQuery>;

describe('projectStatsApi（5 个端点）', () => {
  it('getDashboard：完整 ProjectDashboardVO 解包', async () => {
    reply(dashboard);
    expect(await projectStatsApi.getDashboard(3)).toEqual(dashboard);
    request('/project/v1/dashboard/3', 'GET');
  });
  it('getProgress：ProjectGanttVO Long 起止与 task LocalDate', async () => {
    reply(progress);
    const result = await projectStatsApi.getProgress(3);
    expect(result).toEqual(progress);
    expect(typeof result.startDate).toBe('number');
    expect(result.tasks?.[0].start).toBe('2026-10-05');
    request('/project/v1/progress/3', 'GET');
  });
  it('compareDashboards：重复 projectIds key 与数组结果', async () => {
    const result = [dashboard, { ...dashboard, projectId: 4 }];
    reply(result);
    expect(await projectStatsApi.compareDashboards([0, 3, 4])).toEqual(result);
    const { url } = request('/project/v1/dashboard/compare', 'GET');
    expect(url.searchParams.getAll('projectIds')).toEqual(['0', '3', '4']);
    expect([...url.searchParams.keys()]).toEqual(['projectIds', 'projectIds', 'projectIds']);
  });
  it('getStatistics：聚合结果保留 0/null', async () => {
    reply(statistics);
    expect(await projectStatsApi.getStatistics()).toEqual(statistics);
    const { url } = request('/project/v1/statistics', 'GET');
    expect(url.search).toBe('');
  });
  it('findStatisticsProjectOptions：四个查询字段、wrapper、外层解包', async () => {
    const option = { id: 3, projectName: null } satisfies StatisticsProjectOptionResponse;
    const result = { list: [option], total: 1, pageNumber: 2, pageSize: 5 };
    reply(result);
    expect(await projectStatsApi.findStatisticsProjectOptions(page)).toEqual(result);
    request('/project/v1/statistics/options', 'POST', page);
  });
  it('findStatisticsProjectOptions：未筛选时 bean={}，空页原样返回', async () => {
    const unfiltered = { page: 1, pageSize: 10, bean: {} };
    const result = { list: [], total: 0, pageNumber: 1, pageSize: 10 };
    reply(result);
    expect(await projectStatsApi.findStatisticsProjectOptions(unfiltered)).toEqual(result);
    request('/project/v1/statistics/options', 'POST', unfiltered);
  });
});
