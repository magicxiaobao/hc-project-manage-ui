/**
 * 发布环境域 react-query hooks（P2：p2-release-env 垂直切片）。
 *
 * 约定（沿用 useVersions.ts）：
 * - queryKey 一律走 queryKeys.releaseEnvironment.*，不手写数组
 * - 列表 hook 的 projectId 为 null/undefined 时 disabled，不发起请求
 *   （环境列表始终按项目过滤，GET /release-environment/v1/project/{projectId}）
 * - 变更成功后失效发布环境域全部缓存
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { releaseEnvironmentApi } from '../../api/releaseEnvironment';
import type {
  ReleaseEnvironmentCreatePayload,
  ReleaseEnvironmentDisablePayload,
  ReleaseEnvironmentResponse,
  ReleaseEnvironmentUpdatePayload,
} from '../../api/releaseEnvironment-types';
import { queryKeys } from '../keys';

export interface ReleaseEnvironmentListParams {
  /** 所属项目 id；null/undefined 时不发起请求（调用方等待 projectKey→id 解析） */
  projectId?: number | null;
}

/**
 * 发布环境列表：走 GET /release-environment/v1/project/{projectId}，
 * 返回项目环境数组（后端按 displayOrder asc, id asc 排序）。
 */
export function useReleaseEnvironmentList(params: ReleaseEnvironmentListParams = {}) {
  const { projectId } = params;
  return useQuery({
    queryKey: queryKeys.releaseEnvironment.list({ projectId: projectId ?? 0 }),
    queryFn: () =>
      releaseEnvironmentApi.listByProject(projectId as number),
    enabled: typeof projectId === 'number' && Number.isFinite(projectId),
  });
}

/** 发布环境域变更的缓存失效：发布环境域（列表变脏，下次读取即出现新环境/新状态） */
function invalidateReleaseEnvironmentDomain(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.releaseEnvironment.all });
}

/**
 * 创建发布环境：走 POST /release-environment/v1/create（返回环境响应对象）。
 * 成功后失效发布环境域全部缓存。
 */
export function useCreateReleaseEnvironment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ReleaseEnvironmentCreatePayload) =>
      releaseEnvironmentApi.createEnvironment(data),
    onSuccess: () => invalidateReleaseEnvironmentDomain(queryClient),
  });
}

/**
 * 更新发布环境：走 POST /release-environment/v1/update（id/name/order 必填；
 * approvalRequired 随状态：ACTIVE 环境必填、INACTIVE 环境必须省略）。
 * 成功后失效发布环境域全部缓存。
 */
export function useUpdateReleaseEnvironment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ReleaseEnvironmentUpdatePayload) =>
      releaseEnvironmentApi.updateEnvironment(data),
    onSuccess: () => invalidateReleaseEnvironmentDomain(queryClient),
  });
}

/**
 * 停用发布环境：走 POST /release-environment/v1/{id}/disable
 * （请求体 { reason } 必填；需 project:admin）。
 * 成功后失效发布环境域全部缓存。
 */
export function useDisableReleaseEnvironment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      environmentId,
      data,
    }: {
      environmentId: number;
      data: ReleaseEnvironmentDisablePayload;
    }) => releaseEnvironmentApi.disableEnvironment(environmentId, data),
    onSuccess: () => invalidateReleaseEnvironmentDomain(queryClient),
  });
}

export type { ReleaseEnvironmentResponse };
