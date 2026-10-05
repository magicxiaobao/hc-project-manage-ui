import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { workLogApi } from '../worklog';
import type {
  WorkLogCreatePayload,
  WorkLogUpdatePayload,
  WorkLogQueryRequest,
  WorkLogResponse,
  WorkLogAnalyticsRequest,
  WorkLogAnalyticsResponse,
  WorkLogStatisticsResponse,
} from '../worklog-types';
import type { PageRequest } from '../types';
import { normalizeWorkLogAnalytics } from '../../worklog-analytics-data';

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
  const headers = new Headers(sent.init?.headers);
  expect(headers.get('token')).toBe('collab-token');
  expect(headers.has('Authorization')).toBe(false);
  if (body === undefined) expect(sent.init?.body).toBeUndefined();
  else {
    expect(new Headers(sent.init?.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(sent.init?.body))).toEqual(body);
  }
  return sent;
}

const payload = {
  taskId: 3,
  userId: 4,
  projectId: 5,
  sprintId: null,
  workDescription: '研发 & + #',
  workType: '开发',
  workDate: '2026-10-05T09:00:00',
  startTime: '2026-10-05T09:00:00',
  endTime: null,
  hoursSpent: 0,
  remainingHours: 0,
  progressPercentage: 0,
  status: '',
  isBillable: false,
  billingRate: 0,
  workLocation: '办公室',
  tags: '[]',
  isOvertime: false,
  approvalStatus: null,
  approverId: null,
  approvalTime: null,
  approvalComment: '',
} satisfies WorkLogCreatePayload;
const update = { ...payload, id: 7 } satisfies WorkLogUpdatePayload;
const worklog = { ...payload, id: 7, createdAt: 0, updatedAt: null } satisfies WorkLogResponse;
const page = {
  page: 2,
  pageSize: 5,
  bean: {
    taskId: 3,
    userId: 4,
    projectId: 5,
    sprintId: null,
    workType: '开发',
    workDate: '2026-10-05T09:00:00',
    status: '',
    workLocation: '办公室',
    approvalStatus: null,
    approverId: 0,
  },
  sorts: { workDate: 'desc' },
} satisfies PageRequest<WorkLogQueryRequest>;
const analysisRequest = {
  startDate: '2026-10-05',
  endDate: '2026-10-05',
  projectIds: [5],
  userIds: [4],
  taskIds: [3],
} satisfies WorkLogAnalyticsRequest;
const statistics = {
  dimension: 'user',
  userId: 4,
  userName: 'dev',
  userCnName: null,
  projectId: 5,
  projectName: '项目',
  taskId: 3,
  taskTitle: '研发',
  sprintId: null,
  sprintName: null,
  statisticDate: '2026-10-05',
  totalHours: 0,
  effectiveHours: 0,
  billableHours: 0,
  overtimeHours: 0,
  recordCount: 0,
  completedTasks: 0,
  avgEfficiency: null,
  workTypeHours: { 开发: 0 },
  workLocationHours: { 办公室: 0 },
  approvalStatusHours: {},
  entries: [
    {
      workLogId: 7,
      workDate: '2026-10-05',
      workType: '开发',
      workDescription: null,
      hoursSpent: 0,
      workLocation: null,
      approvalStatus: null,
      isBillable: false,
      isOvertime: false,
    },
  ],
  effectiveHoursRatio: 0,
  billableHoursRatio: null,
  overtimeHoursRatio: 0,
} satisfies WorkLogStatisticsResponse;
const analytics = {
  dateRange: { startDate: '2026-10-05', endDate: '2026-10-05', totalDays: 1, workingDays: 0 },
  userStats: [statistics],
  dailyTrend: [
    {
      period: 'daily',
      date: '2026-10-05',
      hours: 0,
      effectiveHours: 0,
      recordCount: 0,
      userCount: 0,
      avgHoursPerUser: null,
      efficiency: 0,
    },
  ],
  weeklyTrend: [],
  monthlyTrend: null,
  overview: {
    totalHours: 0,
    effectiveHours: 0,
    billableHours: 0,
    overtimeHours: 0,
    totalRecords: 0,
    userCount: 0,
    projectCount: 0,
    taskCount: 0,
    avgDailyHours: null,
    avgHoursPerUser: 0,
    avgHoursPerProject: 0,
    effectiveRatio: 0,
    billableRatio: null,
    overtimeRatio: 0,
  },
  efficiency: {
    avgTaskCompletionTime: null,
    avgHoursPerTask: 0,
    typeEfficiency: { 开发: 0 },
    topPerformers: [
      {
        userId: 4,
        userName: 'dev',
        userCnName: null,
        totalHours: 0,
        completedTasks: 0,
        efficiency: 0,
        effectiveRatio: 0,
        performanceLevel: null,
      },
    ],
    improvementSuggestions: [],
  },
  teamCollaboration: {
    workLocationDistribution: { 办公室: 0 },
    workTypeDistribution: { 开发: 0 },
    projectCollaborations: [
      {
        projectId: 5,
        projectName: '项目',
        participantCount: 0,
        totalHours: 0,
        avgHoursPerUser: null,
        taskCompletionRate: 0,
        collaborationQuality: null,
      },
    ],
    teamEfficiencyScore: 0,
    collaborationInsights: [],
  },
  keyMetricsSummary: { count: 0, enabled: false },
  insights: [],
} satisfies WorkLogAnalyticsResponse;

describe('workLogApi 已定型端点（19 个）', () => {
  it('createWorkLog：完整字段与数字 Long id', async () => {
    reply(7);
    expect(await workLogApi.createWorkLog(payload)).toBe(7);
    request('/workLog/v1/createWorkLog', 'POST', payload);
  });
  it('updateWorkLog：id/false/0/null/空串原样传递', async () => {
    reply('更新成功');
    expect(await workLogApi.updateWorkLog(update)).toBe('更新成功');
    request('/workLog/v1/updateWorkLog', 'POST', update);
  });
  it.each([
    ['validWorkLog', '/workLog/v1/valid/7'],
    ['invalidWorkLog', '/workLog/v1/invalid/7'],
    ['completeWork', '/workLog/v1/complete/7'],
    ['pauseWork', '/workLog/v1/pause/7'],
  ] as const)('%s：无 body/query 的 POST，String 解包', async (method, path) => {
    reply('成功');
    expect(await workLogApi[method](7)).toBe('成功');
    const { url } = request(path, 'POST');
    expect(url.search).toBe('');
  });
  it('getById：LocalDateTime 与所有响应字段原样返回', async () => {
    reply(worklog);
    expect(await workLogApi.getById(7)).toEqual(worklog);
    request('/workLog/v1/findById/7', 'GET');
  });
  it.each([
    ['findByPage', () => workLogApi.findByPage(page), '/workLog/v1/findByPage'],
    ['findByUser', () => workLogApi.findByUser(4, page), '/workLog/v1/user/4/findByPage'],
    ['findByTask', () => workLogApi.findByTask(3, page), '/workLog/v1/task/3/findByPage'],
    ['findByProject', () => workLogApi.findByProject(5, page), '/workLog/v1/project/5/findByPage'],
    ['findBySprint', () => workLogApi.findBySprint(6, page), '/workLog/v1/sprint/6/findByPage'],
  ] as const)('%s：完整分页 wrapper，范围 id 只在 path', async (_method, invoke, path) => {
    const result = { list: [worklog], total: 1, pageNumber: 2, pageSize: 5 };
    reply(result);
    expect(await invoke()).toEqual(result);
    request(path, 'POST', page);
  });
  it('findByPage：无筛选使用 bean={}', async () => {
    const unfiltered = { page: 1, pageSize: 10, bean: {} };
    const result = { list: [], total: 0, pageNumber: 1, pageSize: 10 };
    reply(result);
    expect(await workLogApi.findByPage(unfiltered)).toEqual(result);
    request('/workLog/v1/findByPage', 'POST', unfiltered);
  });
  it.each([undefined, '开发'])(
    'startWork：workType=%s，中文/空格/&/+/# query 编码且无 body',
    async (workType) => {
      reply(9);
      const workDescription = '修复 登录 & 测试 + #';
      expect(await workLogApi.startWork({ taskId: 0, userId: 4, workDescription, workType })).toBe(
        9,
      );
      const { url } = request('/workLog/v1/startWork', 'POST');
      expect(url.searchParams.get('taskId')).toBe('0');
      expect(url.searchParams.get('userId')).toBe('4');
      expect(url.searchParams.get('workDescription')).toBe(workDescription);
      if (workType === undefined) expect(url.searchParams.has('workType')).toBe(false);
      else expect(url.searchParams.get('workType')).toBe('开发');
      expect([...url.searchParams.keys()].sort()).toEqual(
        (workType === undefined
          ? ['taskId', 'userId', 'workDescription']
          : ['taskId', 'userId', 'workDescription', 'workType']
        ).sort(),
      );
    },
  );
  describe.each([
    ['approveWorkLog', '/workLog/v1/approve/7'],
    ['rejectWorkLog', '/workLog/v1/reject/7'],
  ] as const)('%s', (method, path) => {
    it.each([undefined, '', '批准 & 待办 + #'])(
      'comment=%s：必填 approverId、可选 comment query，无 body',
      async (comment) => {
        reply('成功');
        expect(await workLogApi[method](7, { approverId: 0, comment })).toBe('成功');
        const { url } = request(path, 'POST');
        expect(url.searchParams.get('approverId')).toBe('0');
        if (comment === undefined) expect(url.searchParams.has('comment')).toBe(false);
        else expect(url.searchParams.get('comment')).toBe(comment);
        expect([...url.searchParams.keys()].sort()).toEqual(
          (comment === undefined ? ['approverId'] : ['approverId', 'comment']).sort(),
        );
      },
    );
  });
  it('getAnalytics：必填日期/可选 ID 集合与完整嵌套 DTO', async () => {
    reply(analytics);
    expect(await workLogApi.getAnalytics(analysisRequest)).toEqual(analytics);
    request('/workLog/v1/analytics', 'POST', analysisRequest);
  });
  it.each([
    ['getUserStatisticsList', '/workLog/v1/statistics/users'],
    ['getProjectStatisticsList', '/workLog/v1/statistics/projects'],
    ['getTaskStatisticsList', '/workLog/v1/statistics/tasks'],
  ] as const)(
    '%s：分析请求与 List<WorkLogStatisticsResponse>（含 entry/maps）',
    async (method, path) => {
      reply([statistics]);
      expect(await workLogApi[method](analysisRequest)).toEqual([statistics]);
      request(path, 'POST', analysisRequest);
    },
  );
});

describe('workLogApi 未定型端点：仅 pathname + HTTP method 契约', () => {
  it.each([
    ['POST workLog/v1/batchImport', () => workLogApi.batchImport(null), '/workLog/v1/batchImport', 'POST'],
    ['POST workLog/v1/export', () => workLogApi.exportWorkLogs(page), '/workLog/v1/export', 'POST'],
    [
      'POST workLog/v1/analytics/trend',
      () => workLogApi.getTrendAnalysis(analysisRequest),
      '/workLog/v1/analytics/trend',
      'POST',
    ],
    [
      'POST workLog/v1/analytics/efficiency',
      () => workLogApi.getEfficiencyAnalysis(analysisRequest),
      '/workLog/v1/analytics/efficiency',
      'POST',
    ],
    [
      'POST workLog/v1/analytics/collaboration',
      () => workLogApi.getCollaborationAnalysis(analysisRequest),
      '/workLog/v1/analytics/collaboration',
      'POST',
    ],
    [
      'GET workLog/v1/statistics/project/{projectId}',
      () => workLogApi.getProjectStatistics(5, { startDate: '2026-10-05', endDate: '2026-10-05' }),
      '/workLog/v1/statistics/project/5',
      'GET',
    ],
    [
      'GET workLog/v1/statistics/user/{userId}',
      () =>
        workLogApi.getUserStatistics(4, {
          startDate: '2026-10-05',
          endDate: '2026-10-05',
          projectIds: [5, 6],
        }),
      '/workLog/v1/statistics/user/4',
      'GET',
    ],
    [
      'GET workLog/v1/statistics/task/{taskId}',
      () => workLogApi.getTaskStatistics(3, { projectIds: [5, 6] }),
      '/workLog/v1/statistics/task/3',
      'GET',
    ],
  ] as const)('%s', async (_name, invoke, path, method) => {
    await invoke();
    pathAndMethod(path, method);
  });
});

// 按路径标注，避免与 analytics spec 局部编号冲突。
describe('统计页定型 POST 请求口径与 Result 解包', () => {
  it.each([
    ['analytics', 'getAnalytics', '/workLog/v1/analytics'],
    ['projects', 'getProjectStatisticsList', '/workLog/v1/statistics/projects'],
    ['users', 'getUserStatisticsList', '/workLog/v1/statistics/users'],
    ['tasks', 'getTaskStatisticsList', '/workLog/v1/statistics/tasks'],
  ] as const)('POST %s', async (view, method, path) => {
    const body = normalizeWorkLogAnalytics(view, { ...analysisRequest, projectIds: [6, 5, 6], userIds: [9,4,9], taskIds: [8,3,8] });
    const expected = { startDate: analysisRequest.startDate, endDate: analysisRequest.endDate, projectIds: [5,6], ...(view === 'users' ? {userIds:[4,9]} : view === 'tasks' ? {taskIds:[3,8]} : {}) };
    const response = view === 'analytics' ? { ...analytics, keyMetricsSummary: { unconfirmed: { mystery: 'value' } } } : [statistics, { ...statistics, statisticDate: '2026-10-06', totalHours: 1.25 }];
    reply(response);
    expect(await workLogApi[method](body)).toEqual(response);
    request(path, 'POST', expected);
  });
});
