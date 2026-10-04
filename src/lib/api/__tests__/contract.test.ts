/**
 * Phase 0 契约测试：断言登录/项目列表接口的请求与响应结构。
 *
 * 覆盖的契约（来自 hc-project-manage 老前端）：
 * - POST /auth/v1/login，请求体 { username, password }，无 token 头
 * - 成功信封 { code: 1, msg, result } 解包为 result
 * - 业务码非 1 时抛 ApiBusinessError（code 透出）
 * - 登录失效类业务码清本地凭证
 * - HTTP 401 时刷新一次（POST /auth/v1/refreshToken { refreshToken, userId: number }）
 *   并用新 token 重放原请求
 * - 重放后依然 401：清本地凭证并通知登录失效（不再触发刷新）
 * - 刷新瞬时失败且凭证仍在：不清凭证、不通知，抛可重试错误（会话保留）
 * - 刷新确认 refresh token 失效且代际由本次刷新驱动：仍通知登录失效；
 *   刷新在途期间无关的登出/登录使代际变化：不通知（刷新失效归因）
 * - 刷新接口返回 HTTP 401 但响应体畸形/非信封：仍判定 refresh token 失效并清凭证
 * - 旧会话请求的迟到登录失效信号：代际已变化时不清除新会话凭证、不通知（会话代际守卫）
 * - 旧会话请求的迟到 401：代际已变化时不触发刷新、不重放旧请求
 * - 同一请求在途期间令牌被轮转：迟到到达的旧令牌登录失效信号直接丢弃，
 *   不清除新凭证、不通知
 * - 登录失效确认（业务码/重放后仍 401）：调用 sessionInvalidator 递增代际，
 *   使在途刷新完成后被丢弃，不复活已失效的会话
 * - hydrate：三键齐全才恢复登录态；缺 refreshToken 的会话拒绝恢复并清理残留凭证
 * - hydrate：userId 非规范十进制时拒绝恢复并清理残留凭证（避免刷新前抛错的僵尸会话）
 * - hydrate：cnName/userName 类型畸形（非字符串）时拒绝恢复并清理残留凭证（避免渲染期崩溃）
 * - POST /project/v1/findByPage，请求体 { page, pageSize, bean }
 * - POST /project/v1/createProject，请求体 ProjectCreatePayload，返回新建项目 id
 * - GET /project/v1/findById/{id}，返回项目详情
 * - POST /project/v1/checkKeyExists，请求体 { projectKey, excludeId? }，返回 boolean
 * - GET /project/v1/enums，返回类型/状态/优先级选项
 * - POST /project/v1/updateProject，请求体 ProjectUpdatePayload
 *
 * 缺陷契约（P2；来自后端 DefectController + 老前端 frontend/src/types/defect.ts）：
 * - POST /defect/v1/createDefect，请求体 DefectCreatePayload，返回新建缺陷 id
 * - POST /defect/v1/updateDefect，字段级更新；严重度与状态流转不在此入口
 * - POST /defect/v1/{defectId}/severity，CAS 旧值校验 + reason 先裁空白，返回重定级结果
 * - POST /defect/v1/updateStatus，请求体 { id, status, reason?, comment?, assigneeId?, testerId?, verifierId? }
 * - GET /defect/v1/findById/{id}，返回缺陷详情
 * - POST /defect/v1/findByPage，请求体 { page, pageSize, bean }
 * - GET /defect/v1/statistics?projectId=（缺省时无参数），返回统计 + 三维分布
 * - GET /defect/v1/board?projectId=，返回 defectsByStatus 分组 + columns 列配置
 * - GET /defect/v1/statusOptions，返回十态枚举元数据（value=枚举名）
 * - POST /defect/v1/advancedSearch，请求体 { page, pageSize, bean: DefectAdvancedQuery }
 *   （batch/batchUpdateStatus/advancedSearchList/xlsx 导出为 P2 明确排除项）
 *
 * 用例/套件契约（P2；来自后端 TestCaseController/TestSuiteController + 老前端）：
 * - POST /testCase/v1/createTestCase，请求体 TestCaseCreatePayload，返回新建用例 id
 * - POST /testCase/v1/updateTestCase，载荷含 id 的字段级更新
 * - POST /testCase/v1/valid/{id} 与 invalid/{id}，启用/归档，id 拼在路径上
 * - GET /testCase/v1/findById/{id}，返回用例详情
 * - POST /testCase/v1/findByPage，请求体 { page, pageSize, bean }，bean.projectId 必填
 * - POST /testCase/v1/deleteTestCase/{id}（软删；老前端称为 archiveTestCase）
 * - POST /testCase/v1/duplicateTestCase/{id}，返回新用例 id
 * - POST /testCase/v1/advancedSearch，请求体 { page, pageSize, bean: TestCaseAdvancedQuery }
 * - POST /testSuite/v1/createTestSuite，请求体 TestSuiteCreatePayload，返回新建套件 id
 * - POST /testSuite/v1/updateTestSuite，载荷含 id 的字段级更新
 * - POST /testSuite/v1/valid/{id} 与 invalid/{id}，启用/归档，id 拼在路径上
 * - GET /testSuite/v1/findById/{id}，返回套件详情
 * - POST /testSuite/v1/findByPage，请求体 { page, pageSize, bean }
 *   （batchDeleteTestCase/advancedSearchExport 为 P2 明确排除项；
 *    老前端遗留路径 /test-suite/* 在后端 testSuite/v1 无对应端点，不建模）
 *
 * 测试轮/执行契约（P2；来自后端 TestRunController/TestExecutionController + 老前端）：
 * - POST /testRun/v1/full-regressions、ad-hoc-runs、targeted-retests，三种建轮，返回轮摘要
 * - POST /testRun/v1/{testRunId}/start 与 complete，id 拼在路径上，无请求体
 * - POST /testRun/v1/{testRunId}/cancel，请求体 { reason }（reason 先 trim）
 * - GET /testRun/v1/{testRunId}，返回 run + cases 轮详情
 * - POST /testRun/v1/findByPage，请求体 { page, pageSize, bean }（projectId/versionId 至少其一）
 * - GET /testRun/v1/{testRunId}/report，返回 run + summary + resultCounts + cases + defects
 *   （report/export 为导出能力，P2 明确排除，不建模）
 * - POST /testExecution/v1/{executionId}/start（无请求体）、complete（字段级可选载荷）、
 *   retry（请求体 { reason }，先 trim）、defects（执行中建缺陷）、defect-links（关联已有缺陷）
 *   （老前端 frontend/src/api/testRun.ts 混入的五个执行能力拆分到 testExecutionApi）
 *
 * 运行：npm run test:contract（需先 npm install）
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiBusinessError, createApiClient } from '../client';
import { useAuthStore } from '../auth-store';
import { authApi } from '../auth';
import { projectApi } from '../project';
import { requirementApi } from '../requirement';
import { taskApi } from '../task';
import { defectApi } from '../defect';
import { testCaseApi } from '../testCase';
import { testSuiteApi } from '../testSuite';
import { testRunApi } from '../testRun';
import { testExecutionApi } from '../testExecution';
import type { ProjectCreatePayload, ProjectUpdatePayload } from '../types';

const memStore = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem: (k: string) => memStore.get(k) ?? null,
  setItem: (k: string, v: string) => {
    memStore.set(k, v);
  },
  removeItem: (k: string) => {
    memStore.delete(k);
  },
});

function mockFetchSequence(
  responses: Array<{ status?: number; body: unknown }>,
) {
  const mock = vi.fn();
  for (const r of responses) {
    mock.mockResolvedValueOnce(
      new Response(JSON.stringify(r.body), {
        status: r.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }
  vi.stubGlobal('fetch', mock);
  return mock;
}

const loginResult = {
  token: 'access-1',
  username: 'admin',
  expireSec: 7200,
  refreshToken: 'refresh-1',
  refreshExpire: 2592000,
  userInfo: {
    userId: '1',
    userName: 'admin',
    cnName: '管理员',
    extraInfo: {},
    roles: ['admin'],
    authorities: [],
  },
};

beforeEach(() => {
  memStore.clear();
  vi.unstubAllGlobals();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => memStore.get(k) ?? null,
    setItem: (k: string, v: string) => {
      memStore.set(k, v);
    },
    removeItem: (k: string) => {
      memStore.delete(k);
    },
  });
});

describe('登录契约', () => {
  it('POST /auth/v1/login，JSON 请求体，不带 token 头', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: loginResult } },
    ]);
    const res = await authApi.login({ username: 'admin', password: 'secret' });

    expect(res.token).toBe('access-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/auth/v1/login');
    expect(init.method).toBe('POST');
    expect((init.headers as Headers).get('Content-Type')).toBe('application/json');
    expect((init.headers as Headers).get('token')).toBeNull();
    expect(JSON.parse(init.body as string)).toEqual({ username: 'admin', password: 'secret' });
  });

  it('业务码非 1 时抛 ApiBusinessError 并透出 code', async () => {
    mockFetchSequence([{ body: { code: 500, msg: '系统异常', result: null } }]);
    const err = await authApi.login({ username: 'a', password: 'b' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiBusinessError);
    expect((err as ApiBusinessError).code).toBe(500);
    expect((err as ApiBusinessError).message).toBe('系统异常');
  });

  it('登录失效类业务码清本地凭证', async () => {
    memStore.set('token', 'old');
    memStore.set('refreshToken', 'old-refresh');
    memStore.set('userInfo', '{}');
    const client = createApiClient({ baseUrl: 'http://test', onUnauthorized: () => {} });
    mockFetchSequence([{ body: { code: 10109, msg: '登录过期', result: null } }]);
    await expect(client.get('/auth/v1/me')).rejects.toBeInstanceOf(ApiBusinessError);
    expect(memStore.get('token')).toBeUndefined();
    expect(memStore.get('refreshToken')).toBeUndefined();
  });
});

describe('401 自动刷新', () => {
  it('401 后刷新一次并用新 token 重放原请求', async () => {
    memStore.set('token', 'expired');
    memStore.set('refreshToken', 'refresh-1');
    memStore.set(
      'userInfo',
      JSON.stringify({ userId: '1', userName: 'admin', cnName: null, extraInfo: {}, roles: [], authorities: [] }),
    );

    const client = createApiClient({ baseUrl: 'http://test', onUnauthorized: () => {} });
    client.setTokenRefresher(async () => {
      // 模拟刷新：调刷新接口并落盘新 token（与 auth-store.refreshAccessToken 等价）
      const refreshRes = await fetch('http://test/auth/v1/refreshToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: 'refresh-1', userId: 1 }),
      });
      const envelope = (await refreshRes.json()) as { code: number; result: { token: string } };
      memStore.set('token', envelope.result.token);
      return envelope.code === 1;
    });

    const fetchMock = mockFetchSequence([
      { status: 401, body: { code: 10109, msg: 'expired', result: null } },
      { body: { code: 1, msg: 'ok', result: { token: 'new-token', userId: 1, expireSec: 1, refreshToken: 'r2', refreshExpire: 2 } } },
      { body: { code: 1, msg: 'ok', result: { userName: 'admin' } } },
    ]);

    const res = await client.get<{ userName: string }>('/auth/v1/me');
    expect(res).toEqual({ userName: 'admin' });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // 第二次调用是刷新接口：userId 必须为 number（wire 格式）
    const [, refreshInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(refreshInit.body as string)).toEqual({ refreshToken: 'refresh-1', userId: 1 });

    // 第三次是重放：带上新 token 头
    const [retryUrl, retryInit] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(retryUrl).toBe('http://test/auth/v1/me');
    expect((retryInit.headers as Headers).get('token')).toBe('new-token');
  });

  it('重放后依然 401：清本地凭证并通知登录失效，不再触发刷新', async () => {
    memStore.set('token', 'expired');
    memStore.set('refreshToken', 'refresh-1');
    memStore.set(
      'userInfo',
      JSON.stringify({ userId: '1', userName: 'admin', cnName: null, extraInfo: {}, roles: [], authorities: [] }),
    );
    let unauthorized = 0;
    const client = createApiClient({ baseUrl: 'http://test', onUnauthorized: () => { unauthorized++; } });
    client.setTokenRefresher(async () => {
      // 刷新“成功”落盘新 token，但新 token 依然被后端拒绝
      memStore.set('token', 'new-token');
      return true;
    });
    const fetchMock = mockFetchSequence([
      { status: 401, body: { code: 10109, msg: 'expired', result: null } },
      { status: 401, body: { code: 10109, msg: 'still expired', result: null } },
    ]);

    const err = await client.get('/auth/v1/me').catch((e) => e);
    expect(err).toBeInstanceOf(ApiBusinessError);
    expect((err as ApiBusinessError).code).toBe(10109);
    // 只发了两次请求（原请求 + 一次重放），没有陷入刷新循环
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(memStore.get('token')).toBeUndefined();
    expect(memStore.get('refreshToken')).toBeUndefined();
    expect(unauthorized).toBe(1);
  });

  it('刷新瞬时失败且凭证仍在：不清凭证、不通知，抛可重试错误', async () => {
    memStore.set('token', 'expired');
    memStore.set('refreshToken', 'refresh-1');
    memStore.set('userInfo', '{}');
    let unauthorized = 0;
    const client = createApiClient({ baseUrl: 'http://test', onUnauthorized: () => { unauthorized++; } });
    // 模拟刷新遇到瞬时故障：返回 false 但不清除凭证
    //（与 auth-store.refreshAccessToken 的新行为一致：仅确认失效时才清）
    client.setTokenRefresher(async () => false);
    mockFetchSequence([{ status: 401, body: { code: 10109, msg: 'expired', result: null } }]);

    const err = await client.get('/auth/v1/me').catch((e) => e);
    expect(err).not.toBeInstanceOf(ApiBusinessError);
    expect((err as Error).message).toContain('刷新访问令牌失败');
    // 会话保留：不踢回登录，页面可展示重试
    expect(memStore.get('token')).toBe('expired');
    expect(memStore.get('refreshToken')).toBe('refresh-1');
    expect(unauthorized).toBe(0);
  });

  it('刷新接口返回 HTTP 401 畸形响应：仍判定 refresh token 失效，清凭证', async () => {
    const { useAuthStore } = await import('../auth-store');
    memStore.set('token', 'expired');
    memStore.set('refreshToken', 'refresh-1');
    memStore.set(
      'userInfo',
      JSON.stringify({ userId: '1', userName: 'admin', cnName: null, extraInfo: {}, roles: [], authorities: [] }),
    );
    // 刷新接口 HTTP 401 但响应体为空（非信封）：Codex finding 场景
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    const ok = await useAuthStore.getState().refreshAccessToken();

    expect(ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/auth/v1/refreshToken');
    // 凭证被清除，用户可正常被踢回登录页，不会卡在“已登录但刷新永远失败”的状态
    expect(memStore.get('token')).toBeUndefined();
    expect(memStore.get('refreshToken')).toBeUndefined();
    expect(memStore.get('userInfo')).toBeUndefined();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

describe('会话代际', () => {
  it('旧会话请求的迟到登录失效信号：不清除新会话凭证、不通知', async () => {
    // 登出后重新登录，新会话凭证已落盘
    memStore.set('token', 'new-token');
    memStore.set('refreshToken', 'new-refresh');
    let unauthorized = 0;
    let generation = 1;
    const client = createApiClient({ baseUrl: 'http://test', onUnauthorized: () => { unauthorized++; } });
    client.setSessionGenerationReader(() => generation);

    // 请求发出后、响应到达前发生登出 + 重新登录（代际变化）
    let resolveFetch!: (res: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => new Promise<Response>((r) => { resolveFetch = r; })),
    );
    const pending = client.get('/auth/v1/me').catch((e) => e);
    generation = 3;
    resolveFetch(
      new Response(JSON.stringify({ code: 10106, msg: '登录失效', result: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const err = await pending;
    expect(err).toBeInstanceOf(ApiBusinessError);
    // 新会话凭证不受影响，不跳转登录页
    expect(memStore.get('token')).toBe('new-token');
    expect(memStore.get('refreshToken')).toBe('new-refresh');
    expect(unauthorized).toBe(0);
  });

  it('同代际的登录失效信号：仍清除凭证并通知', async () => {
    memStore.set('token', 'expired');
    memStore.set('refreshToken', 'refresh-1');
    let unauthorized = 0;
    const client = createApiClient({ baseUrl: 'http://test', onUnauthorized: () => { unauthorized++; } });
    client.setSessionGenerationReader(() => 1);
    mockFetchSequence([{ status: 200, body: { code: 10106, msg: '登录失效', result: null } }]);

    const err = await client.get('/auth/v1/me').catch((e) => e);
    expect(err).toBeInstanceOf(ApiBusinessError);
    expect(memStore.get('token')).toBeUndefined();
    expect(memStore.get('refreshToken')).toBeUndefined();
    expect(unauthorized).toBe(1);
  });

  it('旧会话请求的迟到 401：不触发刷新、不重放、不清除新会话凭证', async () => {
    // 登出后重新登录，新会话凭证已落盘
    memStore.set('token', 'new-token');
    memStore.set('refreshToken', 'new-refresh');
    let unauthorized = 0;
    let generation = 1;
    let refreshCalls = 0;
    const client = createApiClient({ baseUrl: 'http://test', onUnauthorized: () => { unauthorized++; } });
    client.setSessionGenerationReader(() => generation);
    client.setTokenRefresher(async () => {
      refreshCalls++;
      return true;
    });

    // 请求发出后、401 到达前发生登出 + 重新登录（代际变化）
    let resolveFetch!: (res: Response) => void;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((r) => {
          resolveFetch = r;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const pending = client.get('/auth/v1/me').catch((e) => e);
    generation = 3;
    resolveFetch(
      new Response(JSON.stringify({ code: 10109, msg: 'expired', result: null }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const err = await pending;
    expect(err).toBeInstanceOf(ApiBusinessError);
    expect((err as ApiBusinessError).code).toBe(10109);
    // 不用新会话的 refresh token 刷新、不重放旧请求：只发了一次请求
    expect(refreshCalls).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // 新会话凭证不受影响，不跳转登录页
    expect(memStore.get('token')).toBe('new-token');
    expect(memStore.get('refreshToken')).toBe('new-refresh');
    expect(unauthorized).toBe(0);
  });

  it('登录失效类业务码：调用 sessionInvalidator 递增代际并通知', async () => {
    memStore.set('token', 'expired');
    let unauthorized = 0;
    let generation = 1;
    let invalidated = 0;
    const client = createApiClient({ baseUrl: 'http://test', onUnauthorized: () => { unauthorized++; } });
    client.setSessionGenerationReader(() => generation);
    client.setSessionInvalidator(() => {
      invalidated++;
      generation++;
    });
    mockFetchSequence([{ status: 200, body: { code: 10106, msg: '登录失效', result: null } }]);

    const err = await client.get('/auth/v1/me').catch((e) => e);
    expect(err).toBeInstanceOf(ApiBusinessError);
    // 递增代际：在途的刷新完成时会核对到代际变化而被丢弃，不复活已失效的会话
    expect(invalidated).toBe(1);
    expect(memStore.get('token')).toBeUndefined();
    expect(unauthorized).toBe(1);
  });

  it('重放后依然 401：调用 sessionInvalidator 递增代际，防止在途刷新复活会话', async () => {
    memStore.set('token', 'expired');
    memStore.set('refreshToken', 'refresh-1');
    let unauthorized = 0;
    let generation = 1;
    let invalidated = 0;
    const client = createApiClient({ baseUrl: 'http://test', onUnauthorized: () => { unauthorized++; } });
    client.setSessionGenerationReader(() => generation);
    client.setSessionInvalidator(() => {
      invalidated++;
      generation++;
    });
    client.setTokenRefresher(async () => {
      // 刷新“成功”落盘新 token，但新 token 依然被后端拒绝
      memStore.set('token', 'new-token');
      return true;
    });
    mockFetchSequence([
      { status: 401, body: { code: 10109, msg: 'expired', result: null } },
      { status: 401, body: { code: 10109, msg: 'still expired', result: null } },
    ]);

    const err = await client.get('/auth/v1/me').catch((e) => e);
    expect(err).toBeInstanceOf(ApiBusinessError);
    expect(invalidated).toBe(1);
    expect(memStore.get('token')).toBeUndefined();
    expect(unauthorized).toBe(1);
  });

  it('请求在途期间令牌被轮转：旧令牌的迟到登录失效信号直接丢弃', async () => {
    // 请求带着旧 token 发出；在途期间并发请求的刷新先成功，存储已轮转为新 token
    memStore.set('token', 'old-token');
    memStore.set('refreshToken', 'refresh-1');
    let unauthorized = 0;
    const client = createApiClient({ baseUrl: 'http://test', onUnauthorized: () => { unauthorized++; } });
    client.setSessionGenerationReader(() => 1);

    let resolveFetch!: (res: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => new Promise<Response>((r) => { resolveFetch = r; })),
    );
    const pending = client.get('/auth/v1/me').catch((e) => e);
    // 响应到达前，并发请求的刷新先成功并落盘新凭证
    memStore.set('token', 'new-token');
    resolveFetch(
      new Response(JSON.stringify({ code: 10106, msg: '登录失效', result: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const err = await pending;
    expect(err).toBeInstanceOf(ApiBusinessError);
    // 该信号来自旧令牌：新凭证不受影响，不跳转登录页
    expect(memStore.get('token')).toBe('new-token');
    expect(memStore.get('refreshToken')).toBe('refresh-1');
    expect(unauthorized).toBe(0);
  });

  it('请求在途期间令牌被轮转：旧令牌的迟到 401 不再重复刷新，直接用新令牌重放', async () => {
    // 请求带着旧 token 发出；在途期间并发请求的刷新先成功，存储已轮转为新 token（代际不变）
    memStore.set('token', 'expired-a');
    memStore.set('refreshToken', 'refresh-1');
    let refreshCalls = 0;
    const client = createApiClient({ baseUrl: 'http://test', onUnauthorized: () => {} });
    client.setSessionGenerationReader(() => 1);
    client.setTokenRefresher(async () => {
      refreshCalls++;
      return true;
    });

    const resolvers: Array<(res: Response) => void> = [];
    const fetchMock = vi.fn().mockImplementation(
      () => new Promise<Response>((r) => { resolvers.push(r); }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const pending = client.get('/auth/v1/me').catch((e) => e);
    // 401 到达前，并发请求的刷新先完成并落盘新凭证
    memStore.set('token', 'fresh-b');
    memStore.set('refreshToken', 'refresh-2');
    // 旧令牌的迟到 401 到达
    resolvers[0](
      new Response(JSON.stringify({ code: 10109, msg: 'expired', result: null }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    // 等待重放请求发出后，以新令牌的身份返回成功
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    resolvers[1](
      new Response(JSON.stringify({ code: 1, msg: 'ok', result: { hello: 1 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await pending;
    expect(result).toEqual({ hello: 1 });
    // 没有触发第二次刷新：没有反复轮转凭证
    expect(refreshCalls).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // 重放请求携带的是轮转后的新令牌
    const [, retryInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect((retryInit.headers as Headers).get('token')).toBe('fresh-b');
    expect(memStore.get('token')).toBe('fresh-b');
  });
});

describe('刷新失效归因（Codex review 4175724992）', () => {
  it('刷新确认 refresh token 失效（代际由本次刷新驱动+1）：仍通知登录失效', async () => {
    memStore.set('token', 'expired');
    memStore.set('refreshToken', 'refresh-1');
    memStore.set('userInfo', '{}');
    let unauthorized = 0;
    let generation = 0;
    let invalidatedGen: number | null = null;
    const client = createApiClient({ baseUrl: 'http://test', onUnauthorized: () => { unauthorized++; } });
    client.setSessionGenerationReader(() => generation);
    client.setRefreshInvalidationReader(() => invalidatedGen);
    client.setTokenRefresher(async () => {
      // 模拟 auth-store.refreshAccessToken 确认 refresh token 失效的分支：
      // 递增代际、清存储，并记录这次刷新观察到的代际
      invalidatedGen = generation;
      generation += 1;
      memStore.delete('token');
      memStore.delete('refreshToken');
      memStore.delete('userInfo');
      return false;
    });
    mockFetchSequence([{ status: 401, body: { code: 10109, msg: 'expired', result: null } }]);

    const err = await client.get('/auth/v1/me').catch((e) => e);
    expect(err).toBeInstanceOf(ApiBusinessError);
    // 失效属于当前会话（正是这次请求的刷新尝试确认的），必须通知跳转 /login，
    // 不能按“旧会话迟到响应”静默跳过
    expect(unauthorized).toBe(1);
  });

  it('刷新在途期间无关的登出/登录使代际变化：不通知（保留迟到响应保护）', async () => {
    memStore.set('token', 'expired');
    memStore.set('refreshToken', 'refresh-1');
    memStore.set('userInfo', '{}');
    let unauthorized = 0;
    let generation = 0;
    const invalidatedGen: number | null = null;
    const client = createApiClient({ baseUrl: 'http://test', onUnauthorized: () => { unauthorized++; } });
    client.setSessionGenerationReader(() => generation);
    client.setRefreshInvalidationReader(() => invalidatedGen);
    client.setTokenRefresher(async () => {
      // 在途期间用户登出又重新登录（与本次刷新无关的代际变化），
      // 刷新本身未确认失效（不记录归因代际）
      generation += 1;
      generation += 1;
      memStore.delete('token');
      memStore.delete('refreshToken');
      memStore.delete('userInfo');
      return false;
    });
    mockFetchSequence([{ status: 401, body: { code: 10109, msg: 'expired', result: null } }]);

    const err = await client.get('/auth/v1/me').catch((e) => e);
    expect(err).toBeInstanceOf(ApiBusinessError);
    // 迟到响应保护：不清除新会话凭证、不跳转
    expect(unauthorized).toBe(0);
  });
});

describe('项目列表契约', () => {
  it('POST /project/v1/findByPage，标准分页请求体', async () => {
    const fetchMock = mockFetchSequence([
      {
        body: {
          code: 1,
          msg: 'ok',
          result: {
            list: [
              {
                id: 7,
                projectName: '恒川',
                projectKey: 'HC',
                description: null,
                projectType: 'agile',
                status: 'in_progress',
                startDate: null,
                endDate: null,
                projectManagerId: null,
                memberCount: 3,
                projectManagerName: '张三',
                createdAt: 1720000000000,
                updatedAt: 1720000000000,
              },
            ],
            total: 1,
            pageNumber: 1,
            pageSize: 100,
          },
        },
      },
    ]);

    const page = await projectApi.getProjectList({ page: 1, pageSize: 100 });
    expect(page.total).toBe(1);
    expect(page.list[0].projectKey).toBe('HC');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/project/v1/findByPage');
    expect(JSON.parse(init.body as string)).toEqual({ page: 1, pageSize: 100, bean: {} });
  });
});

describe('项目 CRUD 契约（P1）', () => {
  const createPayload: ProjectCreatePayload = {
    projectName: '新项目',
    projectKey: 'NEW',
    description: '描述',
    projectType: 'agile',
    startDate: 1720000000000,
    endDate: null,
    projectManagerId: 1,
  };

  it('POST /project/v1/createProject，返回新建项目 id', async () => {
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: 42 } }]);
    const id = await projectApi.createProject(createPayload);

    expect(id).toBe(42);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/project/v1/createProject');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(createPayload);
  });

  it('GET /project/v1/findById/{id}，id 拼在路径上', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: { id: 7, projectName: '恒川' } } },
    ]);
    const detail = await projectApi.findById(7);

    expect(detail.id).toBe(7);
    expect(detail.projectName).toBe('恒川');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/project/v1/findById/7');
    expect(init.method).toBe('GET');
  });

  it('POST /project/v1/checkKeyExists，不带 excludeId 时只传 projectKey', async () => {
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: true } }]);
    const exists = await projectApi.checkKeyExists('HC');

    expect(exists).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/project/v1/checkKeyExists');
    expect(JSON.parse(init.body as string)).toEqual({ projectKey: 'HC' });
  });

  it('POST /project/v1/checkKeyExists，编辑场景带 excludeId 排除自身', async () => {
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: false } }]);
    const exists = await projectApi.checkKeyExists('HC', 7);

    expect(exists).toBe(false);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ projectKey: 'HC', excludeId: 7 });
  });

  it('GET /project/v1/enums，返回类型/状态/优先级选项', async () => {
    const fetchMock = mockFetchSequence([
      {
        body: {
          code: 1,
          msg: 'ok',
          result: {
            projectTypes: [{ value: 'agile', label: '敏捷' }],
            statuses: [{ value: 'planning', label: '规划中' }],
            priorities: [{ value: 'high', label: '高' }],
          },
        },
      },
    ]);
    const enums = await projectApi.getEnums();

    expect(enums.projectTypes[0].value).toBe('agile');
    expect(enums.statuses[0].value).toBe('planning');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/project/v1/enums');
    expect(init.method).toBe('GET');
  });

  it('POST /project/v1/updateProject，更新载荷日期为 string 格式', async () => {
    const updatePayload: ProjectUpdatePayload = {
      id: 7,
      projectName: '恒川',
      projectKey: 'HC',
      description: '更新',
      projectType: 'agile',
      startDate: '2026-01-01',
      endDate: null,
      projectManagerId: 1,
      status: 'in_progress',
    };
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: 'success' } }]);
    const res = await projectApi.updateProject(updatePayload);

    expect(res).toBe('success');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/project/v1/updateProject');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(updatePayload);
  });
});

describe('hydrate 会话恢复', () => {
  const userJson = JSON.stringify({
    userId: '1',
    userName: 'demo',
    cnName: null,
    extraInfo: {},
    roles: [],
    authorities: [],
  });

  beforeEach(() => {
    useAuthStore.setState({ user: null, token: null, isAuthenticated: false });
  });

  it('三键（token/refreshToken/userInfo）齐全时恢复登录态', () => {
    memStore.set('token', 'access-token');
    memStore.set('refreshToken', 'refresh-token');
    memStore.set('userInfo', userJson);
    useAuthStore.getState().hydrate();
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.token).toBe('access-token');
    expect(state.user?.userId).toBe('1');
  });

  it('缺 refreshToken 时拒绝恢复并清理残留凭证（不可刷新的会话不得复活）', () => {
    memStore.set('token', 'access-token');
    memStore.set('userInfo', userJson);
    useAuthStore.getState().hydrate();
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
    // 残留凭证已清理：避免 access token 过期后陷入“刷新失败但永不跳转登录页”的死循环
    expect(memStore.get('token')).toBeUndefined();
    expect(memStore.get('userInfo')).toBeUndefined();
  });

  it('userInfo.userId 非规范十进制时拒绝恢复并清理残留凭证（避免刷新前抛错的僵尸会话）', () => {
    const badUsers = ['', '01', 'user-1', '9007199254740993'];
    for (const userId of badUsers) {
      memStore.set('token', 'access-token');
      memStore.set('refreshToken', 'refresh-token');
      memStore.set('userInfo', JSON.stringify({
        userId,
        userName: 'demo',
        cnName: null,
        extraInfo: {},
        roles: [],
        authorities: [],
      }));
      useAuthStore.getState().hydrate();
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(state.token).toBeNull();
      // 残留凭证已清理：刷新接口 wire 层要求规范十进制 ID，非法 ID 会在请求前
      // 抛出普通 Error，被误判为瞬时故障而保留会话、access token 过期后每次请求失败
      expect(memStore.get('token')).toBeUndefined();
      expect(memStore.get('userInfo')).toBeUndefined();
    }
  });

  it('空存储时保持未登录且不抛错', () => {
    expect(() => useAuthStore.getState().hydrate()).not.toThrow();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('userInfo.cnName/userName 类型畸形（非字符串）时拒绝恢复并清理残留凭证', () => {
    const badUsers = [
      { cnName: { first: '张' }, userName: 'demo' }, // cnName 为对象：渲染 cnName || userName 时 React 抛错
      { cnName: null, userName: { nick: 'demo' } }, // userName 为对象
      { cnName: 123, userName: 'demo' }, // cnName 为数字
    ];
    for (const extra of badUsers) {
      memStore.set('token', 'access-token');
      memStore.set('refreshToken', 'refresh-token');
      memStore.set(
        'userInfo',
        JSON.stringify({
          userId: '1',
          extraInfo: {},
          roles: [],
          authorities: [],
          ...extra,
        }),
      );
      useAuthStore.getState().hydrate();
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(state.token).toBeNull();
      // 残留凭证已清理：畸形 userInfo 恢复为登录态会在 /me、AppRail 等处渲染期崩溃
      expect(memStore.get('token')).toBeUndefined();
      expect(memStore.get('userInfo')).toBeUndefined();
    }
  });
});

describe('需求契约（P1）', () => {
  const createPayload = {
    title: '登录支持 SSO',
    description: '支持企业 SSO 登录',
    requirementType: 'Story' as const,
    priority: 'HIGH' as const,
    storyPoints: 5,
    projectId: 7,
    assigneeId: 3,
    estimatedStartDate: '2026-10-05',
    estimatedEndDate: '2026-10-20',
  };

  it('POST /requirement/v1/createRequirement，返回新建需求 id', async () => {
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: 101 } }]);
    const id = await requirementApi.createRequirement(createPayload);

    expect(id).toBe(101);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/requirement/v1/createRequirement');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(createPayload);
  });

  it('POST /requirement/v1/updateRequirement，更新载荷带 id', async () => {
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: 'success' } }]);
    const res = await requirementApi.updateRequirement({
      id: 101,
      title: '登录支持 SSO（更新）',
      description: '支持企业 SSO 登录',
      requirementType: 'Story',
      priority: 'MEDIUM',
      projectId: 7,
    });

    expect(res).toBe('success');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/requirement/v1/updateRequirement');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string).id).toBe(101);
  });

  it('POST /requirement/v1/valid/{id} 与 invalid/{id}，id 拼在路径上', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: 'success' } },
      { body: { code: 1, msg: 'ok', result: 'success' } },
    ]);
    await requirementApi.validRequirement(101);
    await requirementApi.invalidRequirement(101);

    expect(fetchMock.mock.calls[0][0]).toBe('/api/requirement/v1/valid/101');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/requirement/v1/invalid/101');
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('POST');
  });

  it('GET /requirement/v1/findById/{id}，返回需求详情', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: { id: 101, title: '登录支持 SSO', status: 'DRAFT' } } },
    ]);
    const detail = await requirementApi.findById(101);

    expect(detail.id).toBe(101);
    expect(detail.title).toBe('登录支持 SSO');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/requirement/v1/findById/101');
    expect(init.method).toBe('GET');
  });

  it('POST /requirement/v1/findByPage，标准分页请求体', async () => {
    const fetchMock = mockFetchSequence([
      {
        body: {
          code: 1,
          msg: 'ok',
          result: {
            list: [{ id: 101, title: '登录支持 SSO', requirementType: 'Story', priority: 'HIGH', status: 'DRAFT' }],
            total: 1,
            pageNumber: 1,
            pageSize: 100,
          },
        },
      },
    ]);
    const page = await requirementApi.getRequirementList({
      page: 1,
      pageSize: 100,
      bean: { projectId: 7, title: '登录' },
    });

    expect(page.total).toBe(1);
    expect(page.list[0].requirementType).toBe('Story');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/requirement/v1/findByPage');
    expect(JSON.parse(init.body as string)).toEqual({
      page: 1,
      pageSize: 100,
      bean: { projectId: 7, title: '登录' },
    });
  });

  it('GET 选项接口：types/priorities/statuses 返回 { value, label }[]', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: [{ value: 'Story', label: '用户故事' }] } },
      { body: { code: 1, msg: 'ok', result: [{ value: 'HIGH', label: '高' }] } },
      { body: { code: 1, msg: 'ok', result: [{ value: 'DRAFT', label: '草稿' }] } },
    ]);
    const [types, priorities, statuses] = await Promise.all([
      requirementApi.getRequirementTypes(),
      requirementApi.getRequirementPriorities(),
      requirementApi.getRequirementStatuses(),
    ]);

    expect(types[0]).toEqual({ value: 'Story', label: '用户故事' });
    expect(priorities[0].value).toBe('HIGH');
    expect(statuses[0].value).toBe('DRAFT');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/requirement/v1/types');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/requirement/v1/priorities');
    expect(fetchMock.mock.calls[2][0]).toBe('/api/requirement/v1/statuses');
  });

  it('POST /requirement/v1/status/transition，流转载荷原样透传', async () => {
    const payload = {
      requirementId: 101,
      toStatus: 'REVIEW',
      reason: '评审',
      comment: '请评审',
      assigneeId: 3,
      actualStartDate: '2026-10-05',
    };
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: 'success' } }]);
    await requirementApi.executeStatusTransition(payload);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/requirement/v1/status/transition');
    expect(JSON.parse(init.body as string)).toEqual(payload);
  });

  it('POST /requirement/v1/status/validate，返回 boolean', async () => {
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: true } }]);
    const ok = await requirementApi.validateStatusTransition(101, 'REVIEW');

    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/requirement/v1/status/validate');
    expect(JSON.parse(init.body as string)).toEqual({ requirementId: 101, toStatus: 'REVIEW' });
  });

  it('GET /requirement/v1/status/allowed/{id}/{currentStatus}，返回允许流转列表', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: ['REVIEW', 'CANCELLED'] } },
    ]);
    const allowed = await requirementApi.getAllowedTransitions(101, 'DRAFT');

    expect(allowed).toEqual(['REVIEW', 'CANCELLED']);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/requirement/v1/status/allowed/101/DRAFT');
  });

  it('GET /requirement/v1/status/history/{id}，返回流转历史聚合', async () => {
    const fetchMock = mockFetchSequence([
      {
        body: {
          code: 1,
          msg: 'ok',
          result: {
            requirementId: 101,
            currentStatus: 'REVIEW',
            transitions: [
              {
                id: 1,
                requirementId: 101,
                fromStatus: 'DRAFT',
                toStatus: 'REVIEW',
                transitionReason: '评审',
                transitionComment: null,
                operatorId: 3,
                transitionTime: '2026-10-04T05:00:00',
                isAutoTransition: false,
                triggerCondition: null,
              },
            ],
            total: 1,
            allowedTransitions: ['APPROVED', 'CANCELLED'],
          },
        },
      },
    ]);
    const history = await requirementApi.getTransitionHistory(101);

    expect(history.currentStatus).toBe('REVIEW');
    expect(history.transitions[0].fromStatus).toBe('DRAFT');
    expect(history.allowedTransitions).toEqual(['APPROVED', 'CANCELLED']);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/requirement/v1/status/history/101');
  });

  it('GET 追溯图 trace/{id} 与 impact/{id}', async () => {
    const node = {
      objectType: 'REQUIREMENT',
      objectId: 101,
      displayName: '登录支持 SSO',
      status: 'REVIEW',
      assigneeId: 3,
      runId: null,
      runType: null,
      direct: true,
      path: [{ objectType: 'REQUIREMENT', objectId: 101 }],
    };
    const fetchMock = mockFetchSequence([
      {
        body: {
          code: 1,
          msg: 'ok',
          result: {
            requirement: node,
            tasks: { total: 0, list: [], truncated: false },
            testCases: { total: 0, list: [], truncated: false },
            testRuns: { total: 0, list: [], truncated: false },
            testExecutions: { total: 0, list: [], truncated: false },
            defects: { total: 0, list: [], truncated: false },
            versions: { total: 0, list: [], truncated: false },
            edges: [],
            generatedAt: '2026-10-04T05:00:00Z',
          },
        },
      },
      {
        body: {
          code: 1,
          msg: 'ok',
          result: {
            root: node,
            nodes: [node],
            edges: [],
            totalNodes: 1,
            truncated: false,
            generatedAt: '2026-10-04T05:00:00Z',
          },
        },
      },
    ]);
    const trace = await requirementApi.getTrace(101);
    const impact = await requirementApi.getImpact(101);

    expect(trace.requirement.objectId).toBe(101);
    expect(trace.tasks.total).toBe(0);
    expect(impact.totalNodes).toBe(1);
    expect(impact.truncated).toBe(false);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/requirement/v1/trace/101');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/requirement/v1/trace/101/impact');
  });

  it('POST /requirement/v1/trace/matrix/findByPage，分页查询追溯矩阵', async () => {
    const fetchMock = mockFetchSequence([
      {
        body: {
          code: 1,
          msg: 'ok',
          result: {
            list: [
              {
                requirement: {
                  objectType: 'REQUIREMENT',
                  objectId: 101,
                  displayName: '登录支持 SSO',
                  status: 'REVIEW',
                  assigneeId: 3,
                  runId: null,
                  runType: null,
                  direct: true,
                  path: [{ objectType: 'REQUIREMENT', objectId: 101 }],
                },
                taskSummaries: [],
                testCaseSummaries: [],
                defectSummaries: [],
                versionEvidence: { total: 0, truncated: false, items: [] },
              },
            ],
            total: 1,
            pageNumber: 1,
            pageSize: 20,
          },
        },
      },
    ]);
    const page = await requirementApi.findMatrixByPage({
      page: 1,
      pageSize: 20,
      bean: { projectId: 7 },
    });

    expect(page.total).toBe(1);
    expect(page.list[0].requirement.objectId).toBe(101);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/requirement/v1/trace/matrix/findByPage');
    expect(JSON.parse(init.body as string)).toEqual({ page: 1, pageSize: 20, bean: { projectId: 7 } });
  });

  it('需求评论线程：target/REQUIREMENT 路径，create/find/update/invalid', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: 501 } },
      {
        body: {
          code: 1,
          msg: 'ok',
          result: {
            list: [{ id: 501, content: '好需求', targetType: 'REQUIREMENT', targetId: 101, parentId: null, creatorId: 3 }],
            total: 1,
            pageNumber: 1,
            pageSize: 20,
          },
        },
      },
      { body: { code: 1, msg: 'ok', result: 'success' } },
    ]);
    const commentId = await requirementApi.createComment(101, { content: '好需求' });
    const comments = await requirementApi.findComments(101, { page: 1, pageSize: 20 });
    await requirementApi.invalidComment(501);

    expect(commentId).toBe(501);
    expect(comments.list[0].targetType).toBe('REQUIREMENT');
    const [url0, init0] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url0).toBe('/api/comment/v1/target/REQUIREMENT/101/create');
    expect(init0.method).toBe('POST');
    expect(JSON.parse(init0.body as string)).toEqual({ content: '好需求' });
    const [url1, init1] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url1).toBe('/api/comment/v1/target/REQUIREMENT/101/find');
    expect(init1.method).toBe('POST');
    expect(JSON.parse(init1.body as string)).toEqual({ page: 1, pageSize: 20 });
    expect(fetchMock.mock.calls[2][0]).toBe('/api/comment/v1/invalid/501');
  });
});

describe('任务契约（P1）', () => {
  const createPayload = {
    title: '实现登录页',
    description: '接真实后端登录',
    taskType: 'dev',
    priority: 'HIGH' as const,
    storyPoints: 3,
    projectId: 7,
    implementsRequirementIds: [101, 102],
    assigneeId: 3,
    estimatedStartDate: '2026-10-05',
    estimatedEndDate: '2026-10-12',
    estimatedHours: 16,
  };

  it('POST /task/v1/createTask，返回新建任务 id', async () => {
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: 201 } }]);
    const id = await taskApi.createTask(createPayload);

    expect(id).toBe(201);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/task/v1/createTask');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(createPayload);
  });

  it('POST /task/v1/updateTask，字段级更新；显式 null 清空', async () => {
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: 'success' } }]);
    const res = await taskApi.updateTask({ id: 201, storyPoints: 5, description: null });

    expect(res).toBe('success');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/task/v1/updateTask');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ id: 201, storyPoints: 5, description: null });
  });

  it('POST /task/v1/valid/{id} 与 invalid/{id}，id 拼在路径上', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: 'success' } },
      { body: { code: 1, msg: 'ok', result: 'success' } },
    ]);
    await taskApi.validTask(201);
    await taskApi.invalidTask(201);

    expect(fetchMock.mock.calls[0][0]).toBe('/api/task/v1/valid/201');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/task/v1/invalid/201');
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('POST');
  });

  it('GET /task/v1/findById/{id}，返回任务详情', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: { id: 201, title: '实现登录页', status: 'IN_PROGRESS', priority: 'HIGH' } } },
    ]);
    const detail = await taskApi.findById(201);

    expect(detail.id).toBe(201);
    expect(detail.title).toBe('实现登录页');
    expect(detail.status).toBe('IN_PROGRESS');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/task/v1/findById/201');
    expect(init.method).toBe('GET');
  });

  it('POST /task/v1/findByPage，请求体 { page, pageSize, bean }', async () => {
    const fetchMock = mockFetchSequence([
      {
        body: {
          code: 1,
          msg: 'ok',
          result: { list: [{ id: 201, title: '实现登录页', status: 'TODO' }], total: 1, pageNumber: 1, pageSize: 20 },
        },
      },
    ]);
    const page = await taskApi.findByPage({
      page: 1,
      pageSize: 20,
      bean: { projectId: 7, status: 'TODO' },
    });

    expect(page.total).toBe(1);
    expect(page.list[0].id).toBe(201);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/task/v1/findByPage');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      page: 1,
      pageSize: 20,
      bean: { projectId: 7, status: 'TODO' },
    });
  });

  it('getTaskList 默认第 1 页每页 100 条，空查询条件', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: { list: [], total: 0, pageNumber: 1, pageSize: 100 } } },
    ]);
    await taskApi.getTaskList({ bean: { projectId: 7 } });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/task/v1/findByPage');
    expect(JSON.parse(init.body as string)).toEqual({ page: 1, pageSize: 100, bean: { projectId: 7 } });
  });

  it('POST /task/v1/updateStatus，流转上下文拼进请求体', async () => {
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: 'OK' } }]);
    const res = await taskApi.updateTaskStatus(201, 'COMPLETED', {
      reason: '功能完成',
      deliverables: '登录页合并主干',
    });

    expect(res).toBe('OK');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/task/v1/updateStatus');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      taskId: 201,
      status: 'COMPLETED',
      reason: '功能完成',
      deliverables: '登录页合并主干',
    });
  });

  it('POST /task/v1/assign，改派请求带 taskId/assigneeId/reason', async () => {
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: '任务分配成功' } }]);
    const res = await taskApi.assignTask({ taskId: 201, assigneeId: 5, reason: '负载均衡' });

    expect(res).toBe('任务分配成功');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/task/v1/assign');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ taskId: 201, assigneeId: 5, reason: '负载均衡' });
  });

  it('任务评论线程：target/TASK 路径，create/find/update/invalid', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: 601 } },
      {
        body: {
          code: 1,
          msg: 'ok',
          result: {
            list: [{ id: 601, content: '进度不错', targetType: 'TASK', targetId: 201, parentId: null, creatorId: 3 }],
            total: 1,
            pageNumber: 1,
            pageSize: 20,
          },
        },
      },
      { body: { code: 1, msg: 'ok', result: 'success' } },
    ]);
    const commentId = await taskApi.createComment(201, { content: '进度不错' });
    const comments = await taskApi.findComments(201, { page: 1, pageSize: 20 });
    await taskApi.invalidComment(601);

    expect(commentId).toBe(601);
    expect(comments.list[0].targetType).toBe('TASK');
    const [url0, init0] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url0).toBe('/api/comment/v1/target/TASK/201/create');
    expect(init0.method).toBe('POST');
    expect(JSON.parse(init0.body as string)).toEqual({ content: '进度不错' });
    const [url1, init1] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url1).toBe('/api/comment/v1/target/TASK/201/find');
    expect(init1.method).toBe('POST');
    expect(JSON.parse(init1.body as string)).toEqual({ page: 1, pageSize: 20 });
    expect(fetchMock.mock.calls[2][0]).toBe('/api/comment/v1/invalid/601');
  });
});

describe('缺陷契约（P2）', () => {
  it('POST /defect/v1/createDefect，返回新建缺陷 id', async () => {
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: 301 } }]);
    const payload = {
      title: '登录按钮无响应',
      description: '点击登录按钮后页面无反应',
      defectType: '功能缺陷',
      severity: 'MAJOR' as const,
      priority: 'HIGH' as const,
      projectId: 7,
      reporterId: 3,
      assigneeId: 5,
      foundDate: '2026-10-04T09:30:00',
      reproductionSteps: '1. 打开登录页；2. 点击登录',
      affectedRequirementIds: [101],
      foundInTaskIds: [201],
    };
    const id = await defectApi.createDefect(payload);

    expect(id).toBe(301);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/defect/v1/createDefect');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(payload);
  });

  it('POST /defect/v1/updateDefect，字段级更新；严重度与状态流转不在此入口', async () => {
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: 'success' } }]);
    const res = await defectApi.updateDefect({
      id: 301,
      priority: 'MEDIUM',
      environment: 'staging',
      reproductionSteps: '1. 打开登录页；2. 点击登录；3. 无反应',
    });

    expect(res).toBe('success');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/defect/v1/updateDefect');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      id: 301,
      priority: 'MEDIUM',
      environment: 'staging',
      reproductionSteps: '1. 打开登录页；2. 点击登录；3. 无反应',
    });
  });

  it('POST /defect/v1/{defectId}/severity，CAS 旧值校验；reason 先裁空白', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: { defectId: 301, previousSeverity: 'MAJOR', currentSeverity: 'CRITICAL' } } },
    ]);
    const result = await defectApi.changeSeverity(301, {
      expectedSeverity: 'MAJOR',
      targetSeverity: 'CRITICAL',
      reason: '  阻塞主流程  ',
    });

    expect(result.defectId).toBe(301);
    expect(result.previousSeverity).toBe('MAJOR');
    expect(result.currentSeverity).toBe('CRITICAL');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/defect/v1/301/severity');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      expectedSeverity: 'MAJOR',
      targetSeverity: 'CRITICAL',
      reason: '阻塞主流程',
    });
  });

  it('POST /defect/v1/updateStatus，流转上下文 id/status/reason/comment/三角色 id', async () => {
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: 'success' } }]);
    const res = await defectApi.updateStatus({
      id: 301,
      status: 'ASSIGNED',
      reason: '转交后端处理',
      comment: '请优先处理',
      assigneeId: 5,
    });

    expect(res).toBe('success');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/defect/v1/updateStatus');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      id: 301,
      status: 'ASSIGNED',
      reason: '转交后端处理',
      comment: '请优先处理',
      assigneeId: 5,
    });
  });

  it('GET /defect/v1/findById/{id}，返回缺陷详情', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: { id: 301, title: '登录按钮无响应', status: 'NEW', severity: 'MAJOR', priority: 'HIGH' } } },
    ]);
    const detail = await defectApi.findById(301);

    expect(detail.id).toBe(301);
    expect(detail.title).toBe('登录按钮无响应');
    expect(detail.status).toBe('NEW');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/defect/v1/findById/301');
    expect(init.method).toBe('GET');
  });

  it('POST /defect/v1/findByPage，请求体 { page, pageSize, bean }', async () => {
    const fetchMock = mockFetchSequence([
      {
        body: {
          code: 1,
          msg: 'ok',
          result: { list: [{ id: 301, title: '登录按钮无响应', status: 'NEW' }], total: 1, pageNumber: 1, pageSize: 20 },
        },
      },
    ]);
    const page = await defectApi.findByPage({
      page: 1,
      pageSize: 20,
      bean: { projectId: 7, status: 'NEW', severity: 'MAJOR' },
    });

    expect(page.total).toBe(1);
    expect(page.list[0].id).toBe(301);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/defect/v1/findByPage');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      page: 1,
      pageSize: 20,
      bean: { projectId: 7, status: 'NEW', severity: 'MAJOR' },
    });
  });

  it('getDefectList 默认第 1 页每页 100 条，空查询条件', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: { list: [], total: 0, pageNumber: 1, pageSize: 100 } } },
    ]);
    await defectApi.getDefectList();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/defect/v1/findByPage');
    expect(JSON.parse(init.body as string)).toEqual({ page: 1, pageSize: 100, bean: {} });
  });

  it('GET /defect/v1/statistics，projectId 拼查询参数；缺省时不带参数', async () => {
    const fetchMock = mockFetchSequence([
      // severityStats 的 key 是中文标签（severity.getName()），与英文 identity 不同
      { body: { code: 1, msg: 'ok', result: { totalDefects: 5, openDefects: 3, severityStats: { 主要: 2 } } } },
      { body: { code: 1, msg: 'ok', result: { totalDefects: 5, openDefects: 3 } } },
    ]);
    const stats = await defectApi.getDefectStatistics(7);
    await defectApi.getDefectStatistics();

    expect(stats.totalDefects).toBe(5);
    expect(stats.openDefects).toBe(3);
    expect(stats.severityStats['主要']).toBe(2);
    const [url0, init0] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url0).toBe('/api/defect/v1/statistics?projectId=7');
    expect(init0.method).toBe('GET');
    const [url1] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url1).toBe('/api/defect/v1/statistics');
  });

  it('GET /defect/v1/board，返回分组缺陷与看板列', async () => {
    // 后端列配置忠实于 DefectBoardColumnCatalog：十列恒存在，按生命周期顺序排列，
    // id 为 `status-${status}`；defectsByStatus 仅含出现过的状态键（空项目为空对象）
    const columnsSpec = [
      ['NEW', '新建', '#faad14'],
      ['ASSIGNED', '已分配', '#13c2c2'],
      ['IN_PROGRESS', '处理中', '#1890ff'],
      ['PENDING_VERIFICATION', '待验证', '#faad14'],
      ['TESTING', '测试中', '#722ed1'],
      ['RESOLVED', '已解决', '#52c41a'],
      ['VERIFIED', '已验证', '#52c41a'],
      ['CLOSED', '已关闭', '#8c8c8c'],
      ['REOPEN', '重新打开', '#fa8c16'],
      ['REJECTED', '已拒绝', '#ff4d4f'],
    ] as const;
    const buildColumns = (counts: Record<string, number>) =>
      columnsSpec.map(([s, name, color]) => ({ id: `status-${s}`, name, status: s, color, count: counts[s] ?? 0 }));
    const fetchMock = mockFetchSequence([
      {
        body: {
          code: 1,
          msg: 'ok',
          result: {
            defectsByStatus: { NEW: [{ id: 301, title: '登录按钮无响应' }] },
            columns: buildColumns({ NEW: 1 }),
          },
        },
      },
      {
        body: {
          code: 1,
          msg: 'ok',
          result: { defectsByStatus: {}, columns: buildColumns({}) },
        },
      },
    ]);
    const board = await defectApi.getDefectBoardData(7);
    const emptyBoard = await defectApi.getDefectBoardData();

    // 消费端按 Partial 处理：存在的键用 ?? []，缺席的键为 undefined
    expect((board.defectsByStatus.NEW ?? [])[0].id).toBe(301);
    expect(board.defectsByStatus.CLOSED).toBeUndefined();
    expect(board.columns).toHaveLength(10);
    expect(board.columns[0]).toEqual({ id: 'status-NEW', name: '新建', status: 'NEW', color: '#faad14', count: 1 });
    expect(board.columns.map((c) => c.status)).toEqual(columnsSpec.map(([s]) => s));
    expect(board.columns.find((c) => c.status === 'CLOSED')?.count).toBe(0);
    // 空分组：defectsByStatus 为空对象，十列仍完整且计数全零
    expect(emptyBoard.defectsByStatus).toEqual({});
    expect(emptyBoard.columns).toHaveLength(10);
    expect(emptyBoard.columns.every((c) => c.count === 0)).toBe(true);
    const [url0, init0] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url0).toBe('/api/defect/v1/board?projectId=7');
    expect(init0.method).toBe('GET');
    const [url1] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url1).toBe('/api/defect/v1/board');
  });

  it('GET /defect/v1/statusOptions，返回十态元数据（value=枚举名）', async () => {
    const fetchMock = mockFetchSequence([
      {
        body: {
          code: 1,
          msg: 'ok',
          result: [
            { value: 'NEW', label: '新建' },
            { value: 'ASSIGNED', label: '已分配' },
            { value: 'IN_PROGRESS', label: '处理中' },
            { value: 'PENDING_VERIFICATION', label: '待验证' },
            { value: 'RESOLVED', label: '已解决' },
            { value: 'CLOSED', label: '已关闭' },
            { value: 'REOPEN', label: '重新打开' },
            { value: 'REJECTED', label: '已拒绝' },
            { value: 'VERIFIED', label: '已验证' },
            { value: 'TESTING', label: '测试中' },
          ],
        },
      },
    ]);
    const options = await defectApi.getStatusOptions();

    expect(options).toHaveLength(10);
    expect(options[0]).toEqual({ value: 'NEW', label: '新建' });
    expect(options.map((o) => o.value)).toContain('REOPEN');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/defect/v1/statusOptions');
    expect(init.method).toBe('GET');
  });

  it('POST /defect/v1/advancedSearch，高级查询条件拼在 bean 内', async () => {
    const fetchMock = mockFetchSequence([
      {
        body: {
          code: 1,
          msg: 'ok',
          result: { list: [{ id: 301, title: '登录按钮无响应' }], total: 1, pageNumber: 1, pageSize: 20 },
        },
      },
    ]);
    const page = await defectApi.advancedSearch({
      page: 1,
      pageSize: 20,
      bean: {
        projectId: 7,
        keyword: '登录',
        status: ['NEW', 'ASSIGNED'],
        severity: ['MAJOR', 'CRITICAL'],
        priority: ['HIGH'],
        orderBy: 'updateTime',
        orderDirection: 'DESC',
      },
    });

    expect(page.total).toBe(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/defect/v1/advancedSearch');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      page: 1,
      pageSize: 20,
      bean: {
        projectId: 7,
        keyword: '登录',
        status: ['NEW', 'ASSIGNED'],
        severity: ['MAJOR', 'CRITICAL'],
        priority: ['HIGH'],
        orderBy: 'updateTime',
        orderDirection: 'DESC',
      },
    });
  });
});

describe('测试用例契约（P2）', () => {
  it('POST /testCase/v1/createTestCase，返回新建用例 id', async () => {
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: 401 } }]);
    const payload = {
      title: '登录接口返回异常',
      description: 'POST /auth/v1/login 返回 500',
      caseNumber: 'TC-2026-0001',
      testType: '功能测试' as const,
      priority: '高' as const,
      status: 'DRAFT' as const,
      projectId: 7,
      preconditions: '系统处于可登录状态',
      testSteps: '1. 输入账号密码；2. 点击登录',
      expectedResult: '返回 token 并跳转首页',
      verifiesRequirementIds: [101, 102],
    };
    const id = await testCaseApi.createTestCase(payload);

    expect(id).toBe(401);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/testCase/v1/createTestCase');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(payload);
  });

  it('POST /testCase/v1/updateTestCase，字段级更新：仅传 id + 变更字段', async () => {
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: 'success' } }]);
    const res = await testCaseApi.updateTestCase({
      id: 401,
      priority: '中',
    });

    expect(res).toBe('success');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/testCase/v1/updateTestCase');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      id: 401,
      priority: '中',
    });
  });

  it('POST /testCase/v1/valid/{id} 与 invalid/{id}，id 拼在路径上', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: 'success' } },
      { body: { code: 1, msg: 'ok', result: 'success' } },
    ]);
    await testCaseApi.validTestCase(401);
    await testCaseApi.invalidTestCase(401);

    const [url1, init1] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url1).toBe('/api/testCase/v1/valid/401');
    expect(init1.method).toBe('POST');
    const [url2, init2] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url2).toBe('/api/testCase/v1/invalid/401');
    expect(init2.method).toBe('POST');
  });

  it('GET /testCase/v1/findById/{id}，返回用例详情', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: { id: 401, title: '登录接口返回异常', projectId: 7 } } },
    ]);
    const res = await testCaseApi.findById(401);

    expect(res.id).toBe(401);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/testCase/v1/findById/401');
    expect(init.method).toBe('GET');
  });

  it('POST /testCase/v1/findByPage，请求体 { page, pageSize, bean }；bean.projectId 必填', async () => {
    const fetchMock = mockFetchSequence([
      {
        body: {
          code: 1,
          msg: 'ok',
          result: { list: [{ id: 401, title: '登录接口返回异常' }], total: 1, pageNumber: 1, pageSize: 20 },
        },
      },
    ]);
    const page = await testCaseApi.findByPage({
      page: 1,
      pageSize: 20,
      bean: { projectId: 7, status: 'ACTIVE', priority: '高' },
    });

    expect(page.total).toBe(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/testCase/v1/findByPage');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      page: 1,
      pageSize: 20,
      bean: { projectId: 7, status: 'ACTIVE', priority: '高' },
    });
  });

  it('POST /testCase/v1/deleteTestCase/{id}（软删；老前端称为 archiveTestCase）', async () => {
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: 'success' } }]);
    const res = await testCaseApi.deleteTestCase(401);

    expect(res).toBe('success');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/testCase/v1/deleteTestCase/401');
    expect(init.method).toBe('POST');
  });

  it('POST /testCase/v1/duplicateTestCase/{id}，返回新用例 id', async () => {
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: 402 } }]);
    const id = await testCaseApi.duplicateTestCase(401);

    expect(id).toBe(402);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/testCase/v1/duplicateTestCase/401');
    expect(init.method).toBe('POST');
  });

  it('POST /testCase/v1/advancedSearch，高级查询条件拼在 bean 内', async () => {
    const fetchMock = mockFetchSequence([
      {
        body: {
          code: 1,
          msg: 'ok',
          result: { list: [{ id: 401, title: '登录接口返回异常' }], total: 1, pageNumber: 1, pageSize: 20 },
        },
      },
    ]);
    const page = await testCaseApi.advancedSearch({
      page: 1,
      pageSize: 20,
      bean: {
        keyword: '登录',
        statusList: ['ACTIVE', 'REVIEW'],
        priorityList: ['高', '中'],
        testTypeList: ['功能测试'],
        projectIds: [7],
        orderBy: 'updateTime',
        orderDirection: 'DESC',
      },
    });

    expect(page.total).toBe(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/testCase/v1/advancedSearch');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      page: 1,
      pageSize: 20,
      bean: {
        keyword: '登录',
        statusList: ['ACTIVE', 'REVIEW'],
        priorityList: ['高', '中'],
        testTypeList: ['功能测试'],
        projectIds: [7],
        orderBy: 'updateTime',
        orderDirection: 'DESC',
      },
    });
  });
});

describe('测试套件契约（P2）', () => {
  it('POST /testSuite/v1/createTestSuite，返回新建套件 id', async () => {
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: 501 } }]);
    const payload = {
      suiteName: '登录模块回归套件',
      projectId: 7,
      description: '登录/鉴权相关回归用例集合',
      suiteType: '回归测试' as const,
      status: 'DRAFT' as const,
    };
    const id = await testSuiteApi.createTestSuite(payload);

    expect(id).toBe(501);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/testSuite/v1/createTestSuite');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(payload);
  });

  it('POST /testSuite/v1/updateTestSuite，字段级更新：仅传 id + 变更字段', async () => {
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: 'success' } }]);
    const res = await testSuiteApi.updateTestSuite({
      id: 501,
      status: 'PAUSED',
    });

    expect(res).toBe('success');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/testSuite/v1/updateTestSuite');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      id: 501,
      status: 'PAUSED',
    });
  });

  it('POST /testSuite/v1/valid/{id} 与 invalid/{id}，id 拼在路径上', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: 'success' } },
      { body: { code: 1, msg: 'ok', result: 'success' } },
    ]);
    await testSuiteApi.validTestSuite(501);
    await testSuiteApi.invalidTestSuite(501);

    const [url1, init1] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url1).toBe('/api/testSuite/v1/valid/501');
    expect(init1.method).toBe('POST');
    const [url2, init2] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url2).toBe('/api/testSuite/v1/invalid/501');
    expect(init2.method).toBe('POST');
  });

  it('GET /testSuite/v1/findById/{id}，返回套件详情', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: { id: 501, suiteName: '登录模块回归套件', projectId: 7 } } },
    ]);
    const res = await testSuiteApi.findById(501);

    expect(res.id).toBe(501);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/testSuite/v1/findById/501');
    expect(init.method).toBe('GET');
  });

  it('POST /testSuite/v1/findByPage，请求体 { page, pageSize, bean }', async () => {
    const fetchMock = mockFetchSequence([
      {
        body: {
          code: 1,
          msg: 'ok',
          result: { list: [{ id: 501, suiteName: '登录模块回归套件' }], total: 1, pageNumber: 1, pageSize: 20 },
        },
      },
    ]);
    const page = await testSuiteApi.findByPage({
      page: 1,
      pageSize: 20,
      bean: { projectId: 7, status: 'ACTIVE' },
    });

    expect(page.total).toBe(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/testSuite/v1/findByPage');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      page: 1,
      pageSize: 20,
      bean: { projectId: 7, status: 'ACTIVE' },
    });
  });
});

describe('测试轮/执行 API 契约', () => {
  it('POST /testRun/v1/full-regressions，按版本建轮，返回轮摘要', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: { id: 901, runName: 'v2.1 全量回归', runType: 'FULL_REGRESSION', status: 'CREATED' } } },
    ]);
    const run = await testRunApi.createFullRegression({
      versionId: 21,
      runName: 'v2.1 全量回归',
      environment: 'staging',
    });

    expect(run.id).toBe(901);
    expect(run.runType).toBe('FULL_REGRESSION');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/testRun/v1/full-regressions');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      versionId: 21,
      runName: 'v2.1 全量回归',
      environment: 'staging',
    });
  });

  it('POST /testRun/v1/ad-hoc-runs，即席建轮带选择项', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: { id: 902, runName: '登录冒烟', runType: 'AD_HOC', status: 'CREATED' } } },
    ]);
    const run = await testRunApi.createAdHocRun({
      projectId: 7,
      runName: '登录冒烟',
      selections: [
        { selectionType: 'TEST_SUITE', id: 501 },
        { selectionType: 'TEST_CASE', id: 611 },
      ],
    });

    expect(run.id).toBe(902);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/testRun/v1/ad-hoc-runs');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      projectId: 7,
      runName: '登录冒烟',
      selections: [
        { selectionType: 'TEST_SUITE', id: 501 },
        { selectionType: 'TEST_CASE', id: 611 },
      ],
    });
  });

  it('POST /testRun/v1/targeted-retests，基于旧轮+用例选择建轮', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: { id: 903, runName: '复测#901', runType: 'TARGETED_RETEST', status: 'CREATED' } } },
    ]);
    const run = await testRunApi.createTargetedRetest({
      sourceRunId: 901,
      sourceRunCaseIds: [3101, 3102],
      runName: '复测#901',
    });

    expect(run.id).toBe(903);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/testRun/v1/targeted-retests');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      sourceRunId: 901,
      sourceRunCaseIds: [3101, 3102],
      runName: '复测#901',
    });
  });

  it('POST /testRun/v1/{id}/start 与 /complete，id 拼路径，无请求体', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: { id: 901, status: 'RUNNING' } } },
      { body: { code: 1, msg: 'ok', result: { id: 901, status: 'COMPLETED' } } },
    ]);
    await testRunApi.startRun(901);
    await testRunApi.completeRun(901);

    const [url1, init1] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url1).toBe('/api/testRun/v1/901/start');
    expect(init1.method).toBe('POST');
    const [url2, init2] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url2).toBe('/api/testRun/v1/901/complete');
    expect(init2.method).toBe('POST');
  });

  it('POST /testRun/v1/{id}/cancel，reason 先 trim 再发送', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: { id: 901, status: 'CANCELLED', cancellationReason: '环境被占用' } } },
    ]);
    const run = await testRunApi.cancelRun(901, { reason: '  环境被占用  ' });

    expect(run.status).toBe('CANCELLED');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/testRun/v1/901/cancel');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ reason: '环境被占用' });
  });

  it('GET /testRun/v1/{id}，返回 run + cases 轮详情', async () => {
    const fetchMock = mockFetchSequence([
      {
        body: {
          code: 1,
          msg: 'ok',
          result: {
            run: { id: 901, runName: 'v2.1 全量回归', status: 'RUNNING' },
            cases: [
              {
                runCaseId: 3101,
                testCaseId: 611,
                snapshot: { title: '登录成功用例' },
                attempts: [],
                defects: [],
              },
            ],
          },
        },
      },
    ]);
    const detail = await testRunApi.getDetail(901);

    expect(detail.run.id).toBe(901);
    expect(detail.cases).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/testRun/v1/901');
    expect(init.method).toBe('GET');
  });

  it('POST /testRun/v1/findByPage，请求体 { page, pageSize, bean }', async () => {
    const fetchMock = mockFetchSequence([
      {
        body: {
          code: 1,
          msg: 'ok',
          result: { list: [{ id: 901, runName: 'v2.1 全量回归' }], total: 1, pageNumber: 1, pageSize: 20 },
        },
      },
    ]);
    const page = await testRunApi.findByPage({
      page: 1,
      pageSize: 20,
      bean: { projectId: 7, status: 'RUNNING' },
    });

    expect(page.total).toBe(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/testRun/v1/findByPage');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      page: 1,
      pageSize: 20,
      bean: { projectId: 7, status: 'RUNNING' },
    });
  });

  it('GET /testRun/v1/{id}/report，返回 summary + resultCounts + cases + defects', async () => {
    const fetchMock = mockFetchSequence([
      {
        body: {
          code: 1,
          msg: 'ok',
          result: {
            run: { id: 901, runName: 'v2.1 全量回归', status: 'COMPLETED' },
            summary: { runCaseCount: 4, executedCaseCount: 4, passRate: 0.75, versionEvidenceState: 'OFFICIAL' },
            resultCounts: { passed: 3, failed: 1, blocked: 0, skipped: 0 },
            cases: [],
            defects: [{ defectId: 801, title: '登录 500', liveStatus: '已分配', severity: '严重' }],
            generatedAt: '2026-10-04T05:00:00Z',
          },
        },
      },
    ]);
    const report = await testRunApi.getReport(901);

    expect(report.resultCounts.passed).toBe(3);
    expect(report.summary.passRate).toBe(0.75);
    expect(report.defects).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/testRun/v1/901/report');
    expect(init.method).toBe('GET');
  });
});

describe('执行记录 API 契约', () => {
  it('POST /testExecution/v1/{id}/start，无请求体', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: { id: 5101, runCaseId: 3101, attemptNo: 1, status: 'RUNNING' } } },
    ]);
    const exec = await testExecutionApi.startExecution(5101);

    expect(exec.status).toBe('RUNNING');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/testExecution/v1/5101/start');
    expect(init.method).toBe('POST');
  });

  it('POST /testExecution/v1/{id}/complete，字段级可选载荷', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: { id: 5101, status: 'COMPLETED', result: 'FAILED' } } },
    ]);
    const exec = await testExecutionApi.completeExecution(5101, {
      actualResult: '登录报 500',
      failureMessage: 'NullPointerException at LoginService:42',
      executionNotes: 'staging 环境复现',
    });

    expect(exec.result).toBe('FAILED');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/testExecution/v1/5101/complete');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      actualResult: '登录报 500',
      failureMessage: 'NullPointerException at LoginService:42',
      executionNotes: 'staging 环境复现',
    });
  });

  it('POST /testExecution/v1/{id}/retry，reason 先 trim 再发送', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: { id: 5102, runCaseId: 3101, attemptNo: 2, status: 'NOT_STARTED' } } },
    ]);
    const exec = await testExecutionApi.retryExecution(5101, { reason: ' 环境抖动重跑 ' });

    expect(exec.attemptNo).toBe(2);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/testExecution/v1/5101/retry');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ reason: '环境抖动重跑' });
  });

  it('POST /testExecution/v1/{id}/defects，执行中建缺陷，返回 operation 三态', async () => {
    const fetchMock = mockFetchSequence([
      {
        body: {
          code: 1,
          msg: 'ok',
          result: {
            executionId: 5101,
            operation: 'CREATED',
            defect: { id: 801, title: '登录 500', status: 'NEW', severity: '严重', assigneeId: null },
            relation: null,
            occurredAt: '2026-10-04T05:00:00Z',
          },
        },
      },
    ]);
    const res = await testExecutionApi.createDefectFromExecution(5101, {
      title: '登录 500',
      severity: '严重',
      priority: '高',
      reproductionSteps: '输入账号密码点登录',
      expectedResult: '进入首页',
      actualResult: '报 500',
      environment: 'staging',
    });

    expect(res.operation).toBe('CREATED');
    expect(res.defect.id).toBe(801);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/testExecution/v1/5101/defects');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.title).toBe('登录 500');
    expect(body.severity).toBe('严重');
    // 项目/报告人由服务端可信事实填充，前端不传
    expect(body).not.toHaveProperty('projectId');
    expect(body).not.toHaveProperty('reporterId');
  });

  it('POST /testExecution/v1/{id}/defect-links，关联已有缺陷', async () => {
    const fetchMock = mockFetchSequence([
      {
        body: {
          code: 1,
          msg: 'ok',
          result: {
            executionId: 5101,
            operation: 'LINKED',
            defect: { id: 802, title: '已知的登录缺陷', status: 'ASSIGNED', severity: '一般', assigneeId: 3 },
            relation: { relationType: 'EXECUTION_DEFECT' },
            occurredAt: '2026-10-04T05:10:00Z',
          },
        },
      },
    ]);
    const res = await testExecutionApi.linkExistingDefect(5101, { defectId: 802 });

    expect(res.operation).toBe('LINKED');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/testExecution/v1/5101/defect-links');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ defectId: 802 });
  });
});
