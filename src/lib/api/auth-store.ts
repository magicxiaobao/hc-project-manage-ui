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
import { authApi, isCanonicalUserId } from './auth';
import { clearQueryCache } from '../query/session';
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

/** 展示名字段的运行时类型守卫：userName 必须为字符串，cnName 允许字符串或 null。 */
function isDisplayName(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string';
}

function getPersistedUser(): AuthenticatedUser | null {
  const raw = readStorage(USER_INFO_STORAGE_KEY);
  if (!raw) return null;
  try {
    const user = JSON.parse(raw) as AuthenticatedUser;
    // 完整性校验：AppShell 在登录态下会直接求值 authUser.roles.join(...) 与
    // authUser.cnName || authUser.userName 等字段，只校验 userId/roles 不足以
    // 防范 userInfo 被部分篡改/损坏后的渲染期崩溃（如 cnName 为对象时 React 抛错）。
    // 另要求 userId 为规范十进制（与 toWireUserId 同约束）：非法持久化 ID 会让
    // 刷新接口在请求前抛出普通 Error、被误判为瞬时故障而保留僵尸会话。
    return user &&
      isCanonicalUserId(user.userId) &&
      typeof user.userName === 'string' &&
      isDisplayName(user.cnName) &&
      Array.isArray(user.roles)
      ? user
      : null;
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
  /**
   * 客户端驱动的登录失效（登录失效类业务码 / 401 重放仍失败）：
   * 递增会话代际（使在途刷新完成后被丢弃）、清本地存储与内存态。
   * 由客户端经 api.setSessionInvalidator 注册后调用。
   */
  invalidateSessionFromClient: () => void;
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
    const refreshToken = readStorage(REFRESH_TOKEN_STORAGE_KEY);
    const user = getPersistedUser();
    if (token && refreshToken && user) {
      // Codex review 4175472562：另一个 tab 可能把本 tab 的持久会话替换成了另
      // 一个账号——hydrate 用 localStorage 的用户覆盖内存态时若不作废查询缓存，
      // 新账号会直接命中旧账号的缓存（query key 不携带用户身份，login/logout
      // 的清理走不到这条路径）。只在“内存已有用户且身份发生变化”时清缓存：
      // 正常刷新恢复（内存无用户）无需清理，登出已在 logout/invalidate 里清过。
      const prevUser = get().user;
      if (prevUser && prevUser.userId !== user.userId) {
        // 顺带递增会话代际：丢弃旧会话在途的 token 刷新结果，防止它覆盖新账号凭证。
        sessionGeneration += 1;
        clearQueryCache();
      }
      set({ user, token, isAuthenticated: true });
      return;
    }
    // 会话残缺：缺 refreshToken 的会话无法刷新。直接恢复它只会得到一个
    // “已登录但永远刷不出新令牌”的僵尸会话——access token 过期后每次请求
    // 失败，而客户端会把“凭证仍在”判为瞬时故障、保留会话永不跳转登录页。
    // 因此缺 refreshToken 时拒绝恢复并清理残留凭证。
    // Codex review 4175510484：跨 tab 登出（另一 tab 的 logout 把 token、refresh
    // token、userInfo 三个存储项全部删掉）时，既走不到上面的成功分支（持久会话
    // 已无从比较），也走不到下面的残留清理分支（无任何凭证残留），内存态里的已
    // 认证用户、会话代际和查询缓存会原封不动——/projects、/projects/new 等显式
    // 调 hydrate() 的页面会继续渲染已登出账号的新鲜缓存数据。
    // 同 tab 的 logout 本来就会清内存态，所以“内存有用户 + 持久会话缺失”只能来
    // 自另一 tab 的登出，此时把内存态按已登出处理：递增代际（丢弃在途刷新结果）、
    // 清查询缓存、重置 store。页面初始加载时内存无用户，不会误触发。
    if (get().user && (!token || !refreshToken || !user)) {
      sessionGeneration += 1;
      clearQueryCache();
      set({ user: null, token: null, isAuthenticated: false });
    }
    if (token || refreshToken || user) {
      clearStoredAuth();
    }
  },

  login: async (username: string, password: string) => {
    const res = await authApi.login({ username, password });
    sessionGeneration += 1;
    persistLogin(res.token, res.refreshToken, res.userInfo);
    // 换账号/重新登录：旧用户的查询缓存必须作废，避免 B 看到 A 的数据。
    clearQueryCache();
    set({ user: res.userInfo, token: res.token, isAuthenticated: true });
  },

  logout: async () => {
    // 先递增代际：使正在进行的刷新完成后被丢弃，不会恢复已登出的会话
    sessionGeneration += 1;
    const refreshToken = readStorage(REFRESH_TOKEN_STORAGE_KEY);
    // 先清本地、再调后端：即使用户在吊销请求返回前关闭标签页，会话也不会残留。
    // 后端吊销凭请求体中的 refreshToken（持有即吊销，不依赖访问令牌头），顺序调换安全。
    clearStoredAuth();
    // 登出即作废全部查询缓存：同一标签页后续登录的账号不再复用旧数据。
    clearQueryCache();
    set({ user: null, token: null, isAuthenticated: false });
    if (refreshToken) {
      try {
        await authApi.logout({ refreshToken });
      } catch {
        /* 后端吊销失败也继续：本地已清理，吊销按 best-effort 处理 */
      }
    }
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
      // 旧会话的刷新在登出/重新登录后才返回错误：直接丢弃，不碰新会话的凭证
      if (generation !== sessionGeneration) return false;
      // 仅在确认 refresh token 失效时清除登录态；瞬时故障保留会话
      if (isRefreshTokenInvalid(err)) {
        clearStoredAuth();
        set({ user: null, token: null, isAuthenticated: false });
      }
      return false;
    }
  },

  invalidateSessionFromClient: () => {
    // 先递增代际：在途的刷新完成时核对到代际已变化，丢弃刷新结果，不复活已失效的会话
    sessionGeneration += 1;
    clearStoredAuth();
    // 会话失效同样作废查询缓存：后续登录的账号从干净状态开始。
    clearQueryCache();
    set({ user: null, token: null, isAuthenticated: false });
  },
}));

// 注册到 HTTP 客户端：401 时自动刷新并重放一次（与老前端 request.ts 一致）
api.setTokenRefresher(() => useAuthStore.getState().refreshAccessToken());
// 会话代际读取器：让客户端丢弃“旧会话请求在代际变化后返回”的迟到登录失效信号
api.setSessionGenerationReader(() => sessionGeneration);
// 登录失效清理器：客户端确认登录失效时递增代际并清内存态
api.setSessionInvalidator(() => useAuthStore.getState().invalidateSessionFromClient());
