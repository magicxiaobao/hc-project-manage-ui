/**
 * 查询/变更错误处理约定：把底层错误转成可直接展示给用户的中文文案。
 *
 * 分层：
 * - ApiBusinessError：后端业务错误，直接用后端返回的 msg
 * - HttpResponseError：非信封/畸形响应，按 HTTP 状态给通用文案
 * - AbortError：api client 的超时（AbortController）→ 超时文案
 * - 其它 Error：透出 message；非 Error 值用兜底文案
 */
import { ApiBusinessError, AUTH_EXPIRED_CODES, HttpResponseError } from '../api/client';

export function toUserMessage(error: unknown, fallback = '请求失败，请稍后重试'): string {
  if (error instanceof ApiBusinessError) {
    return error.message || fallback;
  }
  if (error instanceof HttpResponseError) {
    if (error.httpStatus >= 500) {
      return `服务暂时不可用（${error.httpStatus}），请稍后重试`;
    }
    return error.message || fallback;
  }
  if (error instanceof Error) {
    if (error.name === 'AbortError') return '请求超时，请检查网络后重试';
    return error.message || fallback;
  }
  return fallback;
}

/** 是否为登录失效类错误（业务码 10106/10107/10108/10109/10115）：页面可据此降级为"请重新登录" */
export function isAuthExpiredError(error: unknown): boolean {
  return error instanceof ApiBusinessError && AUTH_EXPIRED_CODES.includes(error.code);
}
