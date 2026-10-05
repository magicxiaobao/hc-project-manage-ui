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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requirementApi } from '../../api/requirement';
import { requirementTraceApi } from '../../api/trace';
import { normalizeMatrixParams } from '../../trace-matrix';
import { isPositiveSafeId } from '../../task-dependencies-live';
import type {
  CommentCreatePayload,
  RequirementImpact,
  RequirementMatrixQuery,
  RequirementOption,
  RequirementQueryRequest,
  RequirementResponse,
  RequirementTrace,
  RequirementTransitionPayload,
} from '../../api/requirement-types';
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

/** 需求详情：走 GET /requirement/v1/findById/{id}；id 无效时 disabled */
export function useRequirementDetail(id: number | null | undefined) {
  return useQuery({
    queryKey: queryKeys.requirement.detail(id ?? 0),
    queryFn: () => requirementApi.findById(id as number),
    enabled: typeof id === 'number' && Number.isFinite(id) && id > 0,
  });
}

/**
 * 允许的状态流转：走 GET /requirement/v1/status/allowed/{id}/{status}。
 * currentStatus 仅占位路由参数，后端按 requirementId 权威计算；
 * key 里仍带上当前状态，保证状态变化后缓存不串。
 */
export function useAllowedTransitions(
  requirementId: number | null | undefined,
  currentStatus: string | null | undefined,
) {
  const validId = typeof requirementId === 'number' && Number.isFinite(requirementId) && requirementId > 0;
  const validStatus = typeof currentStatus === 'string' && currentStatus.length > 0;
  return useQuery({
    queryKey: queryKeys.requirement.allowed(requirementId ?? 0, currentStatus ?? ''),
    queryFn: () => requirementApi.getAllowedTransitions(requirementId as number, currentStatus as string),
    enabled: validId && validStatus,
  });
}

/** 状态流转历史：走 GET /requirement/v1/status/history/{id}（含当前状态与允许流转） */
export function useTransitionHistory(requirementId: number | null | undefined) {
  return useQuery({
    queryKey: queryKeys.requirement.history(requirementId ?? 0),
    queryFn: () => requirementApi.getTransitionHistory(requirementId as number),
    enabled: typeof requirementId === 'number' && Number.isFinite(requirementId) && requirementId > 0,
  });
}

/**
 * 执行状态流转：走 POST /requirement/v1/status/transition。
 * 成功后失效需求域全部缓存（详情/允许流转/历史/列表全部变脏）。
 */
export function useTransitionRequirement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: RequirementTransitionPayload) => requirementApi.executeStatusTransition(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.requirement.all });
    },
  });
}

/** 需求评论分页：走 POST /comment/v1/target/REQUIREMENT/{id}/find（请求体仅 { page, pageSize }） */
export function useRequirementComments(
  requirementId: number | null | undefined,
  page: number = 1,
  pageSize: number = 50,
) {
  const params = { page, pageSize };
  return useQuery({
    queryKey: queryKeys.requirement.comments(requirementId ?? 0, params),
    queryFn: () => requirementApi.findComments(requirementId as number, params),
    enabled: typeof requirementId === 'number' && Number.isFinite(requirementId) && requirementId > 0,
  });
}

/**
 * 发表需求评论（或回复：传 parentId）：走 POST /comment/v1/target/REQUIREMENT/{id}/create。
 * 成功后失效该需求的评论缓存（前缀匹配，覆盖所有分页）。
 */
export function useCreateRequirementComment(requirementId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CommentCreatePayload) => requirementApi.createComment(requirementId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.requirement.all, 'comments', requirementId],
      });
    },
  });
}

/**
 * 目标状态决定的流转表单字段要求（纯函数，可独立测试）。
 *
 * 忠实于后端 RequirementWorkflowServiceImpl 的权威校验：
 * - → IN_DEVELOPMENT：assigneeId + actualStartDate 必填
 * - → COMPLETED：actualEndDate 必填
 * - 其它目标态：无附加必填字段（reason/comment 均为可选）
 */
export interface TransitionFieldRequirements {
  requireAssignee: boolean;
  requireDate: boolean;
  /** 需要日期时对应后端的日期字段；不需要时为 null */
  dateField: 'actualStartDate' | 'actualEndDate' | null;
  /** 日期输入框的中文标签；不需要时为 null */
  dateLabel: string | null;
}

export function transitionFieldRequirements(toStatus: string): TransitionFieldRequirements {
  if (toStatus === 'IN_DEVELOPMENT') {
    return {
      requireAssignee: true,
      requireDate: true,
      dateField: 'actualStartDate',
      dateLabel: '实际开始日期',
    };
  }
  if (toStatus === 'COMPLETED') {
    return {
      requireAssignee: false,
      requireDate: true,
      dateField: 'actualEndDate',
      dateLabel: '实际结束日期',
    };
  }
  return { requireAssignee: false, requireDate: false, dateField: null, dateLabel: null };
}
export interface RequirementOptions {
  types: RequirementOption[];
  priorities: RequirementOption[];
  statuses: RequirementOption[];
}

/** 需求选项（类型/优先级/状态选项）：走 types/priorities/statuses 三个接口一次取齐 */
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

/**
 * 需求追溯图：走 GET /requirement/v1/trace/{id}。
 * 返回追溯分桶（tasks/testCases/testRuns/testExecutions/defects/versions，各带 total/list/truncated）
 * + edges（追溯边）+ generatedAt。id 无效时 disabled。
 */
export function useRequirementTrace(requirementId: number | null | undefined) {
  return useQuery({
    queryKey: queryKeys.requirement.trace(requirementId ?? 0),
    queryFn: () => requirementApi.getTrace(requirementId as number),
    enabled: typeof requirementId === 'number' && Number.isFinite(requirementId) && requirementId > 0,
  });
}

/**
 * 需求影响范围：走 GET /requirement/v1/trace/{id}/impact。
 * 返回 root/nodes/edges 的影响图。id 无效时 disabled。
 */
export function useRequirementImpact(requirementId: number | null | undefined) {
  return useQuery({
    queryKey: queryKeys.requirement.impact(requirementId ?? 0),
    queryFn: () => requirementApi.getImpact(requirementId as number),
    enabled: typeof requirementId === 'number' && Number.isFinite(requirementId) && requirementId > 0,
  });
}

export interface TraceMatrixParams {
  page?: number;
  pageSize?: number;
  bean?: Partial<RequirementMatrixQuery>;
  /** 所属项目 id；null/undefined 时不发起请求（调用方等待 projectKey→id 解析） */
  projectId?: number | null;
}

/**
 * 追溯矩阵分页：走 POST /requirement/v1/trace/matrix/findByPage。
 * bean 默认带 projectId（矩阵始终按项目过滤）；projectId 无效时 disabled。
 */
export function useTraceMatrix(params: TraceMatrixParams = {}) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const normalized = normalizeMatrixParams(params);
  return useQuery({
    queryKey: queryKeys.requirement.matrix(normalized),
    queryFn: () => requirementTraceApi.findMatrix(normalized),
    enabled: isAuthenticated && isPositiveSafeId(params.projectId),
  });
}

/** 子需求列表：走 GET /requirement/v1/{id}/children；id 无效时 disabled */
export function useRequirementChildren(requirementId: number | null | undefined) {
  return useQuery({
    queryKey: queryKeys.requirement.children(requirementId ?? 0),
    queryFn: () => requirementApi.getChildRequirements(requirementId as number),
    enabled: typeof requirementId === 'number' && Number.isFinite(requirementId) && requirementId > 0,
  });
}

/** 需求层级树：走 GET /requirement/v1/hierarchy?projectId=；projectId 无效时 disabled */
export function useRequirementHierarchy(projectId: number | null | undefined) {
  return useQuery({
    queryKey: queryKeys.requirement.hierarchy(projectId ?? null),
    queryFn: () => requirementApi.getRequirementHierarchy(projectId ?? undefined),
    enabled: typeof projectId === 'number' && Number.isFinite(projectId),
  });
}
