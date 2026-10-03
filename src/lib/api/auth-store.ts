/**
 * 认证状态（zustand）。接入真实后端登录/登出/token 持久化，
 * 替换原型中内存假数据。localStorage 键名与老前端保持一致，
 * 以便将来与老前端共存/灰度时互认登录态。
 */
import { create } from 'zustand';
import {
  AUTH_EXPIRED_CODES,
  ApiBusinessError,
  HttpResponseError,
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

/**
 * 刷新失败是否确认 refresh token 已失效（登录失效类业务码 / HTTP 401，含响应体畸形的 HTTP 401）：
 * 是 → 清除登录态；否（超时、网络中断、5xx、网关畸形响应等瞬时故障）
 * → 保留会话，返回 false 让调用方按可重试错误处理，避免一次后端抖动就把用户踢下线。
 */
function isRefreshTokenInvalid(err: unknown): boolean {
  if (err instanceof ApiBusinessError) {
    return err.httpStatus === 401 || AUTH_EXPIRED_CODES.includes(err.code);
  }
  // 刷新接口返回 HTTP 401 但响应体畸形/非信封：仍判定 refresh token 失效，清登录态，
  // 否则凭证会被保留，用户卡在“已登录但每次请求都刷新失败”的状态，且永远不会被踢回登录页。
  if (err instanceof HttpResponseError) {
    return err.httpStatus === 401;
  }
  return false;
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

/**
 * 会话代际：logout/login 使代际递增。refreshAccessToken 在完成后核对代际，
 * 丢弃“登出后才返回”的刷新结果，避免并发时序把已登出的用户重新置为登录态。
 */
let sessionGeneration = 0;

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
    sessionGeneration += 1;
    persistLogin(res.token, res.refreshToken, res.userInfo);
    set({ user: res.userInfo, token: res.token, isAuthenticated: true });
  },

  logout: async () => {
    // 先递增代际：使正在进行的刷新完成后被丢弃，不会恢复已登出的会话
    sessionGeneration += 1;
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
    const generation = sessionGeneration;
    try {
      const res = await authApi.refreshToken(refreshToken, user.userId);
      // 登出/login 已发生：丢弃本次刷新结果，不恢复凭证
      if (generation !== sessionGeneration) return false;
      const nextUser: AuthenticatedUser = { ...user, userId: res.userId };
      persistLogin(res.token, res.refreshToken, nextUser);
      set({ user: nextUser, token: res.token, isAuthenticated: true });
      return true;
    } catch (err) {
      // 仅在确认 refresh token 失效时清除登录态；瞬时故障保留会话
      if (isRefreshTokenInvalid(err)) {
        clearStoredAuth();
        set({ user: null, token: null, isAuthenticated: false });
      }
      return false;
    }
  },
}));

// 注册到 HTTP 客户端：401 时自动刷新并重放一次（与老前端 request.ts 一致）
api.setTokenRefresher(() => useAuthStore.getState().refreshAccessToken());
