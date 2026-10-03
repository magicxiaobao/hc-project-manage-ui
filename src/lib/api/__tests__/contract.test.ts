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
 * - POST /project/v1/findByPage，请求体 { page, pageSize, bean }
 *
 * 运行：npm run test:contract（需先 npm install）
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiBusinessError, createApiClient } from '../client';
import { authApi } from '../auth';
import { projectApi } from '../project';

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
