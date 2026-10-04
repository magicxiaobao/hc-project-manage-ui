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
  REFRESH_TOKEN_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
  USER_INFO_STORAGE_KEY,
} from '../client';
import type { AuthenticatedUser } from '../types';
import { useAuthStore } from '../auth-store';

function makeUser(userId: string, userName: string): AuthenticatedUser {
  return { userId, userName, cnName: null, roles: ['USER'], authorities: [], extraInfo: {} };
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
