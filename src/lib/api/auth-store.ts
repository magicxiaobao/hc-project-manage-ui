/**
 * 认证状态（zustand）。接入真实后端登录/登出/token 持久化，
 * 替换原型中内存假数据。localStorage 键名与老前端保持一致，
 * 以便将来与老前端共存/灰度时互认登录态。
 */
import { create } from 'zustand';
import {
  REFRESH_TOKEN_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
  USER_INFO_STORAGE_KEY,
  api,
  clearStoredAuth,
} from './client';
import { authApi } from './auth';
import type { AuthenticatedUser } from './types';

function readStorage(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 忽略（如隐私模式） */
  }
}

function getPersistedUser(): AuthenticatedUser | null {
  const raw = readStorage(USER_INFO_STORAGE_KEY);
  if (!raw) return null;
  try {
    const user = JSON.parse(raw) as AuthenticatedUser;
    return user && typeof user.userId === 'string' ? user : null;
  } catch {
    return null;
  }
}

function persistLogin(token: string, refreshToken: string, user: AuthenticatedUser): void {
  writeStorage(TOKEN_STORAGE_KEY, token);
  writeStorage(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
  writeStorage(USER_INFO_STORAGE_KEY, JSON.stringify(user));
}

interface AuthState {
  user: AuthenticatedUser | null;
  token: string | null;
  isAuthenticated: boolean;
  /** 从 localStorage 恢复登录态（页面刷新后调用） */
  hydrate: () => void;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** 供 HTTP 客户端 401 时调用：刷新访问令牌，成功返回 true */
  refreshAccessToken: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,

  hydrate: () => {
    const token = readStorage(TOKEN_STORAGE_KEY);
    const user = getPersistedUser();
    if (token && user) {
      set({ user, token, isAuthenticated: true });
    }
  },

  login: async (username: string, password: string) => {
    const res = await authApi.login({ username, password });
    persistLogin(res.token, res.refreshToken, res.userInfo);
    set({ user: res.userInfo, token: res.token, isAuthenticated: true });
  },

  logout: async () => {
    const refreshToken = readStorage(REFRESH_TOKEN_STORAGE_KEY);
    if (refreshToken) {
      try {
        await authApi.logout({ refreshToken });
      } catch {
        /* 后端吊销失败也继续本地清理 */
      }
    }
    clearStoredAuth();
    set({ user: null, token: null, isAuthenticated: false });
  },

  refreshAccessToken: async () => {
    const refreshToken = readStorage(REFRESH_TOKEN_STORAGE_KEY);
    const user = get().user ?? getPersistedUser();
    if (!refreshToken || !user) return false;
    try {
      const res = await authApi.refreshToken(refreshToken, user.userId);
      const nextUser: AuthenticatedUser = { ...user, userId: res.userId };
      persistLogin(res.token, res.refreshToken, nextUser);
      set({ user: nextUser, token: res.token, isAuthenticated: true });
      return true;
    } catch {
      clearStoredAuth();
      set({ user: null, token: null, isAuthenticated: false });
      return false;
    }
  },
}));

// 注册到 HTTP 客户端：401 时自动刷新并重放一次（与老前端 request.ts 一致）
api.setTokenRefresher(() => useAuthStore.getState().refreshAccessToken());
