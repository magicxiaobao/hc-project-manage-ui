/**
 * 需求域 react-query hooks（P1：p1-requirement-list 垂直切片）。
 *
 * 约定（沿用 useProjects.ts）：
 * - queryKey 一律走 queryKeys.requirement.*，不手写数组
 * - 请求参数在 hook 内归一化（默认值 page=1、pageSize=20、bean={}），
 *   保证同一语义的查询 key 形状一致，缓存不被拆散
 * - 列表 hook 的 projectId 为 null/undefined 时 disabled，不发起请求
 *   （需求列表始终按项目过滤，p1-requirement-list 的 bean.projectId 必传）
 */
import { useQuery } from '@tanstack/react-query';
import { requirementApi } from '../../api/requirement';
import type { RequirementOption, RequirementQueryRequest } from '../../api/requirement-types';
import { useAuthStore } from '../../api/auth-store';
import { queryKeys } from '../keys';

export interface RequirementListParams {
  page?: number;
  pageSize?: number;
  bean?: Omit<RequirementQueryRequest, 'projectId'>;
  /** 所属项目 id；null/undefined 时不发起请求（调用方等待 projectKey→id 解析） */
  projectId?: number | null;
}

function normalizeListParams(params: RequirementListParams = {}) {
  return {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 20,
    bean: { ...params.bean, projectId: params.projectId ?? 0 },
  };
}

/** 需求列表（分页）：走 POST /requirement/v1/findByPage；筛选=标题/类型/优先级/状态 */
export function useRequirementList(params: RequirementListParams = {}) {
  const { projectId } = params;
  const normalized = normalizeListParams(params);
  return useQuery({
    queryKey: queryKeys.requirement.list(normalized),
    queryFn: () => requirementApi.findByPage(normalized),
    enabled: typeof projectId === 'number' && Number.isFinite(projectId),
  });
}

/** 需求选项（类型/优先级/状态选项）：走 types/priorities/statuses 三个接口一次取齐 */
export interface RequirementOptions {
  types: RequirementOption[];
  priorities: RequirementOption[];
  statuses: RequirementOption[];
}

export function useRequirementOptions() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  return useQuery({
    queryKey: queryKeys.requirement.enums(),
    queryFn: async (): Promise<RequirementOptions> => {
      const [types, priorities, statuses] = await Promise.all([
        requirementApi.getRequirementTypes(),
        requirementApi.getRequirementPriorities(),
        requirementApi.getRequirementStatuses(),
      ]);
      return { types, priorities, statuses };
    },
    enabled: isAuthenticated,
  });
}
