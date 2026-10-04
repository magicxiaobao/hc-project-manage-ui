/**
 * 版本域 react-query hooks（P2：p2-version-slices 垂直切片）。
 *
 * 约定（沿用 useDefects.ts）：
 * - queryKey 一律走 queryKeys.version.*，不手写数组
 * - 请求参数在 hook 内归一化（默认值 page=1、pageSize=20、bean={}），
 *   保证同一语义的查询 key 形状一致，缓存不被拆散
 * - 列表 hook 的 projectId 为 null/undefined 时 disabled，不发起请求
 *   （版本列表始终按项目过滤，bean.projectId 必传，后端无项目域直接拒绝）
 *
 * 流转拓扑（纯函数，可独立测试；忠实于 src/lib/api/version-types.ts 的
 * VERSION_EVENT_SOURCES，后端 VersionEvent 枚举是唯一权威）：
 * - versionTransitionEvents(status)：某状态可触发的人工事件
 * - versionEventRequiresReason(event)：是否必填原因
 * （后端在 RETURN_TO_PLANNING / RETURN_TO_DEVELOPMENT / REOPEN_TESTING /
 * DEPRECATE 上 strip 后为空直接拒绝）
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { versionApi } from '../../api/version';
import type {
  VersionCreatePayload,
  VersionQueryRequest,
  VersionResponse,
  VersionTransitionPayload,
  VersionUpdatePayload,
} from '../../api/version-types';
import {
  VERSION_EVENTS,
  VERSION_EVENTS_REQUIRING_REASON,
  VERSION_EVENT_SOURCES,
  VERSION_STATUSES,
} from '../../api/version-types';
import type { VersionEvent, VersionStatus } from '../../api/version-types';
import { queryKeys } from '../keys';

export interface VersionListParams {
  page?: number;
  pageSize?: number;
  bean?: Omit<VersionQueryRequest, 'projectId'>;
  /** 所属项目 id；null/undefined 时不发起请求（调用方等待 projectKey→id 解析） */
  projectId?: number | null;
}

export function normalizeVersionListParams(params: VersionListParams = {}) {
  return {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 20,
    bean: { ...params.bean, projectId: params.projectId ?? 0 },
  };
}

/** 版本列表（分页）：走 POST /version/v1/findByPage；筛选=名称/版本号/类型/状态 */
export function useVersionList(params: VersionListParams = {}) {
  const { projectId } = params;
  const normalized = normalizeVersionListParams(params);
  return useQuery({
    queryKey: queryKeys.version.list(normalized),
    queryFn: () => versionApi.findByPage(normalized),
    enabled: typeof projectId === 'number' && Number.isFinite(projectId),
  });
}

/** 版本详情：走 GET /version/v1/findById/{id}；id 无效时 disabled */
export function useVersionDetail(id: number | null | undefined) {
  return useQuery({
    queryKey: queryKeys.version.detail(id ?? 0),
    queryFn: () => versionApi.findById(id as number),
    enabled: typeof id === 'number' && Number.isFinite(id) && id > 0,
  });
}

/** 版本域变更的缓存失效：版本域（列表变脏，下次读取即出现新版本/新状态） */
function invalidateVersionDomain(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.version.all });
}

/**
 * 创建版本：走 POST /version/v1/createVersion（后端返回新建版本 id）。
 * 成功后失效版本域全部缓存。
 */
export function useCreateVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: VersionCreatePayload) => versionApi.createVersion(data),
    onSuccess: () => invalidateVersionDomain(queryClient),
  });
}

/**
 * 更新版本：走 POST /version/v1/updateVersion（载荷含 id 的字段级更新；
 * null = 保留原值，项目归属不允许变更）。
 * DEPRECATED 版本后端拒绝一切更新，调用方应在渲染层隐藏入口。
 */
export function useUpdateVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: VersionUpdatePayload) => versionApi.updateVersion(data),
    onSuccess: () => invalidateVersionDomain(queryClient),
  });
}

/**
 * 版本状态流转可用事件（纯函数）。
 * 忠实于 VERSION_EVENT_SOURCES：事件的来源状态 == 当前状态即可触发；
 * DEPRECATE 的来源为 null = 任意非 DEPRECATED 状态均可触发。
 * 未知状态 → 空列表（不渲染流转按钮；沿用 defectTransitionTargets 的防御语义）。
 */
export function versionTransitionEvents(from: string | null | undefined): VersionEvent[] {
  if (from == null || from === 'DEPRECATED') return [];
  if (!(VERSION_STATUSES as readonly string[]).includes(from)) return [];
  return VERSION_EVENTS.filter((event) => {
    const source = VERSION_EVENT_SOURCES[event];
    return source === null || source === from;
  });
}

/** 流转事件是否必填原因（忠实于后端 VersionEvent.requiresReason） */
export function versionEventRequiresReason(event: VersionEvent): boolean {
  return (VERSION_EVENTS_REQUIRING_REASON as readonly string[]).includes(event);
}

/**
 * 版本状态流转：走 POST /version/v1/{id}/transition
 * （{ event, expectedStatus, reason? }；expectedStatus 为调用方已读取的
 * 当前状态，乐观并发；后端按事件解析目标状态，前端不硬编码）。
 *
 * mutation options 抽为纯函数以便独立测试 onError 行为。
 */
export function buildTransitionVersionOptions(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  return {
    mutationFn: ({ versionId, data }: { versionId: number; data: VersionTransitionPayload }) =>
      versionApi.transitionVersion(versionId, data),
    onSuccess: () => invalidateVersionDomain(queryClient),
    onError: (
      _error: unknown,
      variables: { versionId: number; data: VersionTransitionPayload },
    ) => {
      // expectedStatus 乐观并发冲突后必须回取最新状态，否则页面内再次提交
      // 必然重复冲突；弹窗文案「请刷新后重试」依赖的就是这次失效
      void queryClient.invalidateQueries({
        queryKey: queryKeys.version.detail(variables.versionId),
      });
    },
  };
}

export function useTransitionVersion() {
  const queryClient = useQueryClient();
  return useMutation(buildTransitionVersionOptions(queryClient));
}

export type { VersionResponse, VersionStatus, VersionEvent };
