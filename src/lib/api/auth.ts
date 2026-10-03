/**
 * 认证 API。契约忠实于 hc-project-manage 老前端 frontend/src/api/auth.ts：
 * - POST /auth/v1/login
 * - POST /auth/v1/refreshToken（wire 格式 userId 为 number）
 * - POST /auth/v1/logout（请求体必须携带 refreshToken）
 * - GET  /auth/v1/me
 */
import { api } from './client';
import type {
  AuthenticatedUser,
  LoginRequest,
  LoginResponse,
  LogoutRequest,
  RefreshTokenResponse,
} from './types';

interface RefreshTokenWireRequest {
  refreshToken: string;
  userId: number;
}

interface RefreshTokenWireResponse {
  token: string;
  expireSec: number;
  userId: number;
  refreshToken: string;
  refreshExpire: number;
}

const CANONICAL_DECIMAL_USER_ID = /^(?:0|[1-9]\d*)$/;

/**
 * 与 toWireUserId 同约束的规范十进制用户 ID 校验（供持久化恢复用）。
 * 刷新接口 wire 层要求 userId 为 number：非法持久化 ID 会在请求前抛出普通
 * Error，被误判为瞬时故障而保留僵尸会话；因此 hydrate 阶段就必须拒绝它。
 */
export function isCanonicalUserId(userId: unknown): userId is string {
  if (typeof userId !== 'string') return false;
  if (!CANONICAL_DECIMAL_USER_ID.test(userId)) return false;
  return Number.isSafeInteger(Number(userId));
}

function toWireUserId(userId: string): number {
  if (!CANONICAL_DECIMAL_USER_ID.test(userId)) {
    throw new Error('用户ID必须是规范的十进制字符串');
  }
  const numericUserId = Number(userId);
  if (!Number.isSafeInteger(numericUserId)) {
    throw new Error('用户ID超出安全整数范围');
  }
  return numericUserId;
}

function normalizeWireUserId(userId: unknown): string {
  if (typeof userId !== 'number' || !Number.isSafeInteger(userId) || userId < 0) {
    throw new Error('刷新响应中的用户ID无效');
  }
  return userId.toString(10);
}

export const authApi = {
  /** 用户登录 */
  login: (data: LoginRequest) => api.post<LoginResponse>('/auth/v1/login', data),

  /** 刷新令牌（wire 层 userId 为 number，返回层归一为 string） */
  refreshToken: async (refreshToken: string, userId: string): Promise<RefreshTokenResponse> => {
    const wire = await api.post<RefreshTokenWireResponse>('/auth/v1/refreshToken', {
      refreshToken,
      userId: toWireUserId(userId),
    } satisfies RefreshTokenWireRequest);
    return { ...wire, userId: normalizeWireUserId(wire.userId) };
  },

  /** 用户登出（必携带刷新令牌；后端凭持有吊销，不依赖访问令牌） */
  logout: (data: LogoutRequest) => api.post<void>('/auth/v1/logout', data),

  /** 获取当前用户信息 */
  getCurrentUser: () => api.get<AuthenticatedUser>('/auth/v1/me'),
};
