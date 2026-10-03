/**
 * Phase 1 react-query 数据层入口。
 *
 * 约定：
 * - 所有后端数据获取走这里的 hooks，不在组件里手写 useQuery + fetch/URL。
 * - queryKey 一律走 queryKeys.* 工厂，不手写数组。
 * - 错误展示用 toUserMessage(err) 转中文文案；登录失效用 isAuthExpiredError 识别。
 */
export { createQueryClient, isRetryableQueryError } from './client';
export { queryKeys } from './keys';
export { isAuthExpiredError, toUserMessage } from './error';
export { useProjectDetail, useProjectEnums, useProjectList } from './hooks/useProjects';
export type { ProjectListParams } from './hooks/useProjects';
