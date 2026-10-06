/**
 * Codex review 4175472562 回归测试：
 * hydrate() 用 localStorage 的用户覆盖内存态时，若检测到账号已变化
 * （另一个 tab 替换了持久会话），必须作废查询缓存——query key 不携带
 * 用户身份，否则新账号会命中旧账号的缓存数据。
 *
 * 运行：pnpm vitest run src/lib/api/__tests__/auth-store-hydrate.test.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setQueryCacheClearer } from '../../query/session';
import {
  HttpResponseError,
  REFRESH_TOKEN_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
  USER_INFO_STORAGE_KEY,
} from '../client';
import type { AuthenticatedUser } from '../types';
import { getSessionGeneration, useAuthStore } from '../auth-store';

const { requestAccessRefreshStub } = vi.hoisted(() => ({ requestAccessRefreshStub: vi.fn() }));
vi.mock('../../access/service', () => ({ requestAccessRefresh: requestAccessRefreshStub }));

function makeUser(userId: string, userName: string, authorities: string[] = []): AuthenticatedUser {
  return { userId, userName, cnName: null, roles: ['USER'], authorities, extraInfo: {} };
}

function storageWith(user: AuthenticatedUser): Record<string, string> {
  return {
    [TOKEN_STORAGE_KEY]: `token-of-${user.userId}`,
    [REFRESH_TOKEN_STORAGE_KEY]: `refresh-of-${user.userId}`,
    [USER_INFO_STORAGE_KEY]: JSON.stringify(user),
  };
}

describe('hydrate 账号变化时清查询缓存', () => {
  let backing: Record<string, string>;

  beforeEach(() => {
    backing = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => (key in backing ? backing[key] : null),
      setItem: (key: string, value: string) => {
        backing[key] = value;
      },
      removeItem: (key: string) => {
        delete backing[key];
      },
    });
    useAuthStore.setState({ user: null, token: null, isAuthenticated: false });
    setQueryCacheClearer(null);
  });

  it('内存用户 A、持久会话已换成 B：清缓存并切换为 B', () => {
    const userA = makeUser('1001', 'alice');
    const userB = makeUser('1002', 'bob');
    useAuthStore.setState({ user: userA, token: 'token-of-1001', isAuthenticated: true });
    backing = storageWith(userB);
    const clearer = vi.fn();
    setQueryCacheClearer(clearer);

    useAuthStore.getState().hydrate();

    expect(clearer).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().user?.userId).toBe('1002');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('内存与持久会话同为 A：不清缓存', () => {
    const userA = makeUser('1001', 'alice');
    useAuthStore.setState({ user: userA, token: 'token-of-1001', isAuthenticated: true });
    backing = storageWith(userA);
    const clearer = vi.fn();
    setQueryCacheClearer(clearer);

    useAuthStore.getState().hydrate();

    expect(clearer).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user?.userId).toBe('1001');
  });

  it('内存无用户（正常刷新恢复）：不清缓存', () => {
    const userB = makeUser('1002', 'bob');
    backing = storageWith(userB);
    const clearer = vi.fn();
    setQueryCacheClearer(clearer);

    useAuthStore.getState().hydrate();

    expect(clearer).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user?.userId).toBe('1002');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});

describe('hydrate 跨 tab 登出时清会话（Codex review 4175510484）', () => {
  let backing: Record<string, string>;

  beforeEach(() => {
    backing = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => (key in backing ? backing[key] : null),
      setItem: (key: string, value: string) => {
        backing[key] = value;
      },
      removeItem: (key: string) => {
        delete backing[key];
      },
    });
    useAuthStore.setState({ user: null, token: null, isAuthenticated: false });
    setQueryCacheClearer(null);
  });

  it('内存用户 A、三个存储项全被删（另一 tab 登出）：清缓存并重置内存态', () => {
    const userA = makeUser('1001', 'alice');
    useAuthStore.setState({ user: userA, token: 'token-of-1001', isAuthenticated: true });
    // 另一 tab 的 logout 把三个存储项全部删掉 → backing 保持空
    const clearer = vi.fn();
    setQueryCacheClearer(clearer);

    useAuthStore.getState().hydrate();

    expect(clearer).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('内存用户 A、存储只有残缺凭证：内存态重置且残留凭证被清', () => {
    const userA = makeUser('1001', 'alice');
    useAuthStore.setState({ user: userA, token: 'token-of-1001', isAuthenticated: true });
    backing = { [TOKEN_STORAGE_KEY]: 'stale-token' }; // 缺 refreshToken 与 userInfo
    const clearer = vi.fn();
    setQueryCacheClearer(clearer);

    useAuthStore.getState().hydrate();

    expect(clearer).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(backing).toEqual({});
  });

  it('内存无用户、存储全空（未登录正常刷新）：不动缓存不动内存态', () => {
    const clearer = vi.fn();
    setQueryCacheClearer(clearer);

    useAuthStore.getState().hydrate();

    expect(clearer).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

/**
 * Codex review 4175693767 回归测试：
 * refresh 失败且确认 refresh token 失效（非信封体的 HTTP 401）时，必须按完整
 * 会话失效处理：递增会话代际 + 清查询缓存 + 清存储 + 清内存态。只清内存态的话，
 * 另一 tab 随后以 B 登录、本 tab hydrate() 时 prevUser 为 null 会跳过缓存清理
 * （4175472562 的条件要求内存有用户），B 会直接命中 A 的旧缓存。
 */
const { refreshTokenStub } = vi.hoisted(() => ({ refreshTokenStub: vi.fn() }));
vi.mock('../auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth')>();
  return { ...actual, authApi: { ...actual.authApi, refreshToken: refreshTokenStub } };
});

describe('refresh 失败确认 token 失效时清会话（Codex review 4175693767）', () => {
  let backing: Record<string, string>;

  beforeEach(() => {
    backing = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => (key in backing ? backing[key] : null),
      setItem: (key: string, value: string) => {
        backing[key] = value;
      },
      removeItem: (key: string) => {
        delete backing[key];
      },
    });
    useAuthStore.setState({ user: null, token: null, isAuthenticated: false });
    setQueryCacheClearer(null);
    refreshTokenStub.mockReset();
  });

  it('刷新返回 HTTP 401（非信封体）：返回 false、清缓存、清存储与内存态', async () => {
    const userA = makeUser('1001', 'alice');
    useAuthStore.setState({ user: userA, token: 'token-of-1001', isAuthenticated: true });
    backing = storageWith(userA);
    refreshTokenStub.mockRejectedValue(new HttpResponseError('Unauthorized', 401));
    const clearer = vi.fn();
    setQueryCacheClearer(clearer);

    const ok = await useAuthStore.getState().refreshAccessToken();

    expect(ok).toBe(false);
    expect(clearer).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(backing).toEqual({});
  });

  it('刷新遇到瞬时故障（普通网络错误）：保留会话、不清缓存', async () => {
    const userA = makeUser('1001', 'alice');
    useAuthStore.setState({ user: userA, token: 'token-of-1001', isAuthenticated: true });
    backing = storageWith(userA);
    refreshTokenStub.mockRejectedValue(new Error('boom'));
    const clearer = vi.fn();
    setQueryCacheClearer(clearer);

    const ok = await useAuthStore.getState().refreshAccessToken();

    expect(ok).toBe(false);
    expect(clearer).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user?.userId).toBe('1001');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});

/**
 * Codex review 4194259260 回归测试：
 * 同一用户的 authorities 与存储不一致时（另一 tab 的 /me 刷新或 token 刷新
 * 写回了不同权限），接收 tab 的 hydrate() 必须立即请求一次权限快照刷新
 * （经 /me 对账），否则路由/按钮权限过期；同时已验证的内存用户不被存储
 * 直接覆盖（与 service.test.ts「已验证 authorities 不被 hydrate 覆盖」
 * 不变量一致）。authorities 未变时不触发刷新（token 刷新等场景）。
 */
describe('hydrate 同用户权限变化时刷新快照（Codex review 4194259260）', () => {
  let backing: Record<string, string>;

  beforeEach(() => {
    backing = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => (key in backing ? backing[key] : null),
      setItem: (key: string, value: string) => {
        backing[key] = value;
      },
      removeItem: (key: string) => {
        delete backing[key];
      },
    });
    useAuthStore.setState({ user: null, token: null, isAuthenticated: false });
    setQueryCacheClearer(null);
    requestAccessRefreshStub.mockClear();
  });

  function signInMemory(user: AuthenticatedUser) {
    // hydrate 要求 token/refreshToken/userInfo 三键齐全，先按登录态种子存储
    backing = storageWith(user);
    useAuthStore.setState({ user, token: `token-of-${user.userId}`, isAuthenticated: true });
    // 本 tab 完成过一次 /me 校验：verifiedGeneration 与 sessionGeneration 对齐，
    // hydrate 才会走“沿用内存用户”的快路径（复现线上真实条件）。
    useAuthStore.getState().acceptVerifiedUser(user, getSessionGeneration());
  }

  it('authorities 与存储不一致：保留已验证内存用户，并请求一次权限刷新对账', () => {
    const before = makeUser('1001', 'alice', ['project:view']);
    signInMemory(before);
    const prevRef = useAuthStore.getState().user;
    // 另一 tab 写回了不同的 authorities（可能是它的 /me 刷新，也可能是
    // 它的 token 刷新把内存旧权限 persistLogin 写回——存储未必已验证）
    const changed = { ...before, authorities: ['project:view', 'sys:user:view'] };
    backing[USER_INFO_STORAGE_KEY] = JSON.stringify(changed);

    useAuthStore.getState().hydrate();

    // 已验证的内存用户不被存储直接覆盖（service.test.ts 既有不变量），
    // 但必须立即请求刷新经 /me 对账，而不是等 focus/超时
    expect(useAuthStore.getState().user).toBe(prevRef);
    expect(useAuthStore.getState().user?.authorities).toEqual(['project:view']);
    expect(requestAccessRefreshStub).toHaveBeenCalledTimes(1);
    expect(requestAccessRefreshStub).toHaveBeenCalledWith('cross-tab-authority-change');
  });

  it('authorities 未变（另一 tab 写回相同内容）：保留内存用户且不刷新', () => {
    const userA = makeUser('1001', 'alice', ['project:view']);
    signInMemory(userA);
    const prevRef = useAuthStore.getState().user;
    // 另一 tab 的 acceptVerifiedUser 写回相同内容
    backing[USER_INFO_STORAGE_KEY] = JSON.stringify({ ...userA });

    useAuthStore.getState().hydrate();

    expect(useAuthStore.getState().user).toBe(prevRef);
    expect(requestAccessRefreshStub).not.toHaveBeenCalled();
  });

  it('authorities 顺序不同但集合相同：不视为变化', () => {
    const userA = makeUser('1001', 'alice', ['a', 'b']);
    signInMemory(userA);
    backing[USER_INFO_STORAGE_KEY] = JSON.stringify({ ...userA, authorities: ['b', 'a'] });

    useAuthStore.getState().hydrate();

    expect(requestAccessRefreshStub).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user?.authorities).toEqual(['a', 'b']);
  });

  it('内存无用户（页面刷新恢复）：不请求刷新', () => {
    const stored = makeUser('1001', 'alice', ['project:view']);
    backing = storageWith(stored);

    useAuthStore.getState().hydrate();

    expect(useAuthStore.getState().user?.userId).toBe('1001');
    expect(requestAccessRefreshStub).not.toHaveBeenCalled();
  });
});
