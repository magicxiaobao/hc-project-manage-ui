/**
 * Phase 0 HTTP 客户端（fetch 实现，不引入 axios）。
 *
 * 行为对标 hc-project-manage 老前端 frontend/src/utils/request.ts：
 * - 请求头 `token` 携带访问令牌（后端 JWT 拦截器要求，非标准 Authorization 头）
 * - 统一解包 { code, msg, result } 信封，code === 1 为成功
 * - 业务码 10106/10107/10108/10109/10115 视为登录失效：清本地凭证并通知上层
 * - HTTP 401（非登录/刷新接口）时尝试刷新 token 并重放一次
 * - baseURL 取 VITE_API_BASE_URL，开发环境默认为 '/api'（由 vite 反代到后端）
 */
import type { ApiEnvelope } from './types';

export const TOKEN_HEADER = 'token';
export const TOKEN_STORAGE_KEY = 'token';
export const REFRESH_TOKEN_STORAGE_KEY = 'refreshToken';
export const USER_INFO_STORAGE_KEY = 'userInfo';

/** 登录失效类业务码（与老前端保持一致） */
export const AUTH_EXPIRED_CODES = [10106, 10107, 10108, 10109, 10115];

/** 自带错误处理的认证接口：401 时不走刷新流程 */
const AUTH_OWN_ERROR_ENDPOINTS = ['/auth/v1/login', '/auth/v1/refreshToken'];

export class ApiBusinessError<T = unknown> extends Error {
  readonly code: number;
  readonly result: T;
  readonly httpStatus: number;

  constructor(envelope: ApiEnvelope<T>, httpStatus = 200) {
    super(envelope.msg || '请求失败');
    this.name = 'ApiBusinessError';
    this.code = envelope.code;
    this.result = envelope.result;
    this.httpStatus = httpStatus;
  }
}

/**
 * 非信封/畸形响应错误：仍保留 HTTP 状态，供上层（如刷新逻辑）分类决策。
 * 例如刷新接口返回 HTTP 401 但响应体为空时，auth-store 仍应判定 refresh token 失效。
 */
export class HttpResponseError extends Error {
  readonly httpStatus: number;

  constructor(message: string, httpStatus: number) {
    super(message);
    this.name = 'HttpResponseError';
    this.httpStatus = httpStatus;
  }
}

function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function getStoredToken(): string | null {
  return getStorage()?.getItem(TOKEN_STORAGE_KEY) ?? null;
}

export function clearStoredAuth(): void {
  const s = getStorage();
  if (!s) return;
  s.removeItem(TOKEN_STORAGE_KEY);
  s.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  s.removeItem(USER_INFO_STORAGE_KEY);
}

export interface ApiClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  getToken?: () => string | null;
  /** 登录失效时的通知（默认实现做硬跳转到 /login） */
  onUnauthorized?: () => void;
}

export type TokenRefresher = () => Promise<boolean>;

function defaultBaseUrl(): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    return env?.VITE_API_BASE_URL ?? '/api';
  } catch {
    return '/api';
  }
}

function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return base.replace(/\/$/, '') + (path.startsWith('/') ? path : `/${path}`);
}

const isOwnErrorEndpoint = (path: string) =>
  AUTH_OWN_ERROR_ENDPOINTS.some((endpoint) => path.includes(endpoint));

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = options.baseUrl ?? defaultBaseUrl();
  const timeoutMs = options.timeoutMs ?? 10000;
  let tokenRefresher: TokenRefresher | null = null;
  /** 正在进行中的刷新：并发 401 共用一次，避免重复刷新触发 refresh token 轮换竞态 */
  let inflightRefresh: Promise<boolean> | null = null;

  function refreshOnce(): Promise<boolean> {
    if (inflightRefresh) return inflightRefresh;
    const p = (async () => {
      try {
        return tokenRefresher ? await tokenRefresher() : false;
      } catch {
        return false;
      } finally {
        inflightRefresh = null;
      }
    })();
    inflightRefresh = p;
    return p;
  }

  function notifyUnauthorized(): void {
    if (options.onUnauthorized) {
      options.onUnauthorized();
      return;
    }
    try {
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    } catch {
      /* 非浏览器环境忽略 */
    }
  }

  /** 本次请求实际使用的取 token 方式（与请求头携带保持一致） */
  const readToken = () => (options.getToken ? options.getToken() : getStoredToken());

  async function request<T>(path: string, init: RequestInit & { _retry?: boolean } = {}): Promise<T> {
    const headers = new Headers(init.headers);
    const token = readToken();
    if (token) headers.set(TOKEN_HEADER, token);
    const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
    if (!isFormData && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const controller = new AbortController();
    // 超时覆盖整个请求（含响应体读取）：fetch 在收到响应头后即 resolve，
    // 若此时清 timer，后续 body stall 会无限等待。放到 finally 保证解析完成后才清。
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(joinUrl(baseUrl, path), { ...init, headers, signal: controller.signal });

      // 401 自动刷新 + 重放一次（登录/刷新接口自身除外；并发 401 共用一次刷新）
      if (res.status === 401 && !isOwnErrorEndpoint(path)) {
        if (!init._retry) {
          const refreshed = await refreshOnce();
          if (refreshed) {
            return request<T>(path, { ...init, _retry: true });
          }
          // 刷新失败：auth-store 仅在确认 refresh token 失效时才清除凭证。
          // 凭证仍在 → 瞬时故障（超时/网络/5xx），不踢回登录，
          // 抛错让页面展示可重试的错误状态，会话得以保留。
          if (readToken()) {
            throw new Error(`刷新访问令牌失败: ${path}`);
          }
        } else {
          // 重放后依然 401：新令牌也被拒绝，登录态确实失效，不再尝试刷新
          clearStoredAuth();
        }
        notifyUnauthorized();
        throw new ApiBusinessError({ code: 10109, msg: '登录已过期，请重新登录', result: null }, 401);
      }

      const text = await res.text();
      let data: ApiEnvelope<T> | null = null;
      if (text) {
        try {
          data = JSON.parse(text) as ApiEnvelope<T>;
        } catch {
          data = null;
        }
      }
      if (!data || typeof data.code !== 'number') {
        if (res.ok && !text) return undefined as T;
        throw new HttpResponseError(`接口返回格式异常: ${path}`, res.status);
      }
      if (data.code === 1) return data.result;
      if (AUTH_EXPIRED_CODES.includes(data.code)) {
        clearStoredAuth();
        notifyUnauthorized();
      }
      throw new ApiBusinessError<T>(data, res.status);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    request,
    get: <T>(path: string, init?: RequestInit) => request<T>(path, { ...init, method: 'GET' }),
    post: <T>(path: string, body?: unknown, init?: RequestInit) =>
      request<T>(path, {
        ...init,
        method: 'POST',
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    put: <T>(path: string, body?: unknown, init?: RequestInit) =>
      request<T>(path, {
        ...init,
        method: 'PUT',
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    patch: <T>(path: string, body?: unknown, init?: RequestInit) =>
      request<T>(path, {
        ...init,
        method: 'PATCH',
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    delete: <T>(path: string, init?: RequestInit) => request<T>(path, { ...init, method: 'DELETE' }),
    setTokenRefresher(fn: TokenRefresher | null) {
      tokenRefresher = fn;
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** 默认单例：baseUrl 取 VITE_API_BASE_URL，默认为 '/api'（dev 下由 vite 反代到后端） */
export const api = createApiClient();
