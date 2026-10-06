/**
 * 认证状态（zustand）。接入真实后端登录/登出/token 持久化，
 * 替换原型中内存假数据。localStorage 键名与老前端保持一致，
 * 以便将来与老前端共存/灰度时互认登录态。
 */
import { create } from 'zustand';
import { resetAccess } from '../access/store';
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
      Array.isArray(user.roles) && user.roles.every((role) => typeof role === 'string') &&
      Array.isArray(user.authorities) && user.authorities.every((code) => typeof code === 'string')
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
  acceptVerifiedUser: (user: AuthenticatedUser, generation: number) => void;
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
export const getSessionGeneration = () => sessionGeneration;
let verifiedGeneration: number | null = null;

/**
 * 刷新失效归因（Codex review 4175724992）：最近一次因 refresh token 被拒绝
 * 而使会话失效的刷新所观察到的会话代际。客户端用它判断“代际变化正是由本次
 * 请求的刷新尝试驱动的”——此时失效属于当前会话，即使 authStillCurrent()
 * 为 false 也应通知登录失效；无关的登出/登录导致的代际变化仍保持迟到响应
 * 保护、不通知。仅在刷新确认失效的分支里赋值，旧值不会被误匹配（客户端
 * 同时要求代际恰好 +1 且刷新前与请求发出时代际一致）。
 */
let invalidatedRefreshObservedGeneration: number | null = null;

/**
 * storage 事件是否应触发 hydrate（本地评审 pi P2）：只响应身份键
 * USER_INFO_STORAGE_KEY 与 key === null。
 * - persistLogin 总是最后写 userInfo（token → refreshToken → userInfo），
 *   该事件到达时三键齐全，hydrate 能看到完整会话；跨 tab 登录/换账号被感知。
 * - clear()（登出删三键）触发 key === null，hydrate 走跨 tab 登出清理分支。
 * - token/refreshToken 的单键事件故意忽略：单键变化只可能来自写入序列中断
 *   （如配额异常导致后两个 setItem 没写）或不遵循三键协议的外部写入者
 *   （这些键与老前端共享、灰度互认登录态），此时存储处于部分写入中间态；
 *   若此时 hydrate，会把残缺会话判为僵尸并 clearStoredAuth()，删掉对方正在
 *   写入的凭证，造成级联登出。token 单键轮转无需 hydrate——客户端每次请求
 *   都从存储直读最新 token，身份未变。
 */
export function shouldHydrateOnStorageEvent(key: string | null): boolean {
  return key === null || key === USER_INFO_STORAGE_KEY;
}

/**
 * 系统管理员判定（与后端对齐）。
 *
 * 后端 UserController 类级 `@PreAuthorize("hasAuthority('system:admin')")`
 * （project-manage-system-biz UserController.java:55），系统管理域接口要求
 * authorities 包含 'system:admin'。路由资格消费已验证权限快照；此函数仅用于管理员 API 的条件。
 */
export function hasSystemAdmin(authorities: readonly string[] | null | undefined): boolean {
  return (authorities ?? []).includes('system:admin');
}

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
        resetAccess(null, sessionGeneration);
        clearQueryCache();
      }
      set({ user: verifiedGeneration === sessionGeneration && prevUser?.userId === user.userId ? prevUser : user, token, isAuthenticated: true });
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
      resetAccess(null, sessionGeneration);
      clearQueryCache();
      set({ user: null, token: null, isAuthenticated: false });
    }
    if (token || refreshToken || user) {
      clearStoredAuth();
    }
  },

  acceptVerifiedUser: (user, generation) => {
    if (generation !== sessionGeneration || !get().isAuthenticated || get().user?.userId !== user.userId) return;
    verifiedGeneration = generation;
    writeStorage(USER_INFO_STORAGE_KEY, JSON.stringify(user));
    set({ user });
  },

  login: async (username: string, password: string) => {
    const res = await authApi.login({ username, password });
    sessionGeneration += 1;
    resetAccess(null, sessionGeneration);
    persistLogin(res.token, res.refreshToken, res.userInfo);
    // 换账号/重新登录：旧用户的查询缓存必须作废，避免 B 看到 A 的数据。
    clearQueryCache();
    set({ user: res.userInfo, token: res.token, isAuthenticated: true });
  },

  logout: async () => {
    // 先递增代际：使正在进行的刷新完成后被丢弃，不会恢复已登出的会话
    sessionGeneration += 1;
    resetAccess(null, sessionGeneration);
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
      if (res.userId !== user.userId) throw new HttpResponseError('刷新响应用户不匹配', 401);
      const nextUser: AuthenticatedUser = { ...(get().user ?? user), userId: res.userId };
      persistLogin(res.token, res.refreshToken, nextUser);
      set({ user: nextUser, token: res.token, isAuthenticated: true });
      return true;
    } catch (err) {
      // 旧会话的刷新在登出/重新登录后才返回错误：直接丢弃，不碰新会话的凭证
      if (generation !== sessionGeneration) return false;
      // 仅在确认 refresh token 失效时清除登录态；瞬时故障保留会话
      if (isRefreshTokenInvalid(err)) {
        // Codex review 4175693767：确认 refresh token 失效就是完整的会话失效，
        // 不能只清内存态+存储——必须同时递增会话代际（丢弃在途的旧会话刷新
        // 结果）并清空查询缓存。否则：本 tab 先清了内存用户、另一 tab 再以
        // B 登录后 hydrate() 时 prevUser 为 null 会跳过缓存清理（4175472562
        // 的条件要求内存有用户），B 会直接命中 A 的旧缓存。
        sessionGeneration += 1;
        resetAccess(null, sessionGeneration);
        // Codex review 4175724992：记录这次使会话失效的刷新所观察到的代际，
        // 供客户端归因——代际变化正是由本次请求的刷新尝试驱动的，失效属于
        // 当前会话，客户端仍需通知登录失效（跳转 /login），而不是按“旧会话
        // 迟到响应”静默跳过。
        invalidatedRefreshObservedGeneration = generation;
        clearQueryCache();
        clearStoredAuth();
        set({ user: null, token: null, isAuthenticated: false });
      }
      return false;
    }
  },

  invalidateSessionFromClient: () => {
    // 先递增代际：在途的刷新完成时核对到代际已变化，丢弃刷新结果，不复活已失效的会话
    sessionGeneration += 1;
    resetAccess(null, sessionGeneration);
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
// 刷新失效归因读取器：让客户端判断代际变化是否由本次请求的刷新尝试驱动
api.setRefreshInvalidationReader(() => invalidatedRefreshObservedGeneration);
// 登录失效清理器：客户端确认登录失效时递增代际并清内存态
api.setSessionInvalidator(() => useAuthStore.getState().invalidateSessionFromClient());
