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
 * 运行：npm run test:contract（需先 npm install）
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiBusinessError, createApiClient } from '../client';
import { useAuthStore } from '../auth-store';
import { authApi } from '../auth';
import { projectApi } from '../project';
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
