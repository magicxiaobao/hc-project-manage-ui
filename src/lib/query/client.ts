/**
 * Phase 1 react-query 基础设施：QueryClient 工厂。
 *
 * 默认策略（供 P1 起所有数据获取 hook 使用）：
 * - 30s stale：路由切换回来时复用缓存，不重复打后端
 * - 重试：仅网络错误/超时/5xx/429 自动重试（最多 2 次）；
 *   业务错误（ApiBusinessError，含登录失效类业务码）一律不重试——
 *   后端已明确给出结果，且 401 刷新/登录失效由 api client 统一处理
 * - 切回窗口不自动重取（管理后台多 tab 场景下减少噪声）；断网重连时重取
 * - mutation 默认不重试：避免创建/流转等写操作重复提交
 */
import { QueryClient } from '@tanstack/react-query';
import { ApiBusinessError, HttpResponseError } from '../api/client';

/** 该查询错误是否值得自动重试 */
export function isRetryableQueryError(error: unknown): boolean {
  if (error instanceof ApiBusinessError) return false;
  if (error instanceof HttpResponseError) {
    // 5xx / 429 视为瞬时故障可重试；其它 4xx 为客户端错误不重试
    return error.httpStatus >= 500 || error.httpStatus === 429;
  }
  // TypeError（网络断开/DNS）、超时 Abort 等：可重试
  return true;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: (failureCount, error) =>
          failureCount < 2 && isRetryableQueryError(error),
        refetchOnWindowFocus: false,
        refetchOnReconnect: 'always',
      },
      mutations: {
        retry: false,
      },
    },
  });
}
