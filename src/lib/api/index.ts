/**
 * Phase 0 API 层入口。
 *
 * 约定：
 * - 所有后端调用走这里的 typed API 模块，不在组件里手写 fetch/URL。
 * - 契约（路径、请求体、响应信封）忠实于 hc-project-manage 老前端，
 *   变更契约前先更新契约测试（src/lib/api/__tests__/contract.test.ts）。
 */
export * from './types';
export * from './client';
export { authApi } from './auth';
export { projectApi } from './project';
export { useAuthStore } from './auth-store';
