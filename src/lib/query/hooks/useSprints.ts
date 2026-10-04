/**
 * 冲刺域 react-query hooks（P3：p3-sprint-list 冲刺列表与生命周期管理）。
 *
 * 约定（沿用 useBoards.ts）：
 * - queryKey 一律走 queryKeys.sprint.*，不手写数组
 * - 请求参数在 hook 内归一化（默认值 page=1、pageSize=20、bean={}），
 *   保证同一语义的查询 key 形状一致，缓存不被拆散
 * - 列表 hook 的 projectId 为 null/undefined 时 disabled，不发起请求
 * - 状态变更一律 POST：开始=POST /sprint/v1/start/{id}、
 *   完成=POST /sprint/v1/complete/{id}（请求体 {disposition, targetSprintId?}）、
 *   取消=POST /sprint/v1/cancel/{id}、逻辑删=POST /sprint/v1/invalid/{id}
 *
 * 后端筛选行为（实读 SprintServiceImpl.getSprintsByProject:401-429）：
 * project/{projectId}/findByPage 的 bean 条件是服务端生效的
 * （sprintName like、status eq、sprintNumber/scrumMasterId/productOwnerId eq），
 * 因此筛选直接下推后端，无需前端本地过滤；分页正常用 page/pageSize。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sprintApi } from '../../api/sprint';
import type {
  SprintCompletePayload,
  SprintCreatePayload,
  SprintQueryRequest,
  SprintResponse,
  SprintUpdatePayload,
} from '../../api/sprint-types';
import { queryKeys } from '../keys';

export interface SprintListParams {
  page?: number;
  pageSize?: number;
  bean?: Omit<SprintQueryRequest, 'projectId'>;
  /** 所属项目 id；null/undefined 时不发起请求（调用方等待 projectKey→id 解析） */
  projectId?: number | null;
}

export function normalizeSprintListParams(params: SprintListParams = {}) {
  return {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 20,
    bean: { ...params.bean, projectId: params.projectId ?? 0 },
  };
}

/**
 * 冲刺分页列表：POST /sprint/v1/project/{projectId}/findByPage；
 * 筛选=冲刺名称（服务端 like）/状态（服务端 eq）。
 */
export function useSprintList(params: SprintListParams = {}) {
  const { projectId } = params;
  const normalized = normalizeSprintListParams(params);
  return useQuery({
    queryKey: queryKeys.sprint.list(normalized),
    queryFn: () => sprintApi.findByProject(projectId as number, normalized),
    enabled: typeof projectId === 'number' && Number.isFinite(projectId),
  });
}

/**
 * 同项目规划中冲刺（供"完成冲刺→移入目标冲刺"选择器使用）：
 * bean { projectId, status: 'PLANNING' } 服务端过滤；
 * 循环拉取所有页（直到某页不足一页），避免 total 超过单页大小时静默漏数。
 */
const PLANNING_FETCH_PAGE_SIZE = 200;

export function usePlanningSprints(params: { projectId?: number | null }) {
  const { projectId } = params;
  return useQuery({
    queryKey: queryKeys.sprint.list({
      planning: true,
      pageSize: PLANNING_FETCH_PAGE_SIZE,
      projectId: projectId ?? 0,
    }),
    queryFn: async () => {
      const all: SprintResponse[] = [];
      let page = 1;
      for (;;) {
        const pageResult = await sprintApi.findByProject(projectId as number, {
          page,
          pageSize: PLANNING_FETCH_PAGE_SIZE,
          bean: { projectId: projectId as number, status: 'PLANNING' },
        });
        all.push(...pageResult.list);
        if (pageResult.list.length < PLANNING_FETCH_PAGE_SIZE) break;
        page += 1;
      }
      return all;
    },
    enabled: typeof projectId === 'number' && Number.isFinite(projectId),
  });
}

/** 冲刺详情：走 GET /sprint/v1/findById/{id}；id 无效时 disabled */
export function useSprintDetail(id: number | null | undefined) {
  return useQuery({
    queryKey: queryKeys.sprint.detail(id ?? 0),
    queryFn: () => sprintApi.getById(id as number),
    enabled: typeof id === 'number' && Number.isFinite(id) && id > 0,
  });
}

/** 冲刺域变更的缓存失效：失效冲刺域全部缓存（列表变脏，下次读取即刷新） */
function invalidateSprintDomain(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.sprint.all });
}

/**
 * 新建冲刺：POST /sprint/v1/createSprint（后端返回新建冲刺 id）。
 * 成功后失效冲刺域全部缓存。
 */
export function useCreateSprint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SprintCreatePayload) => sprintApi.createSprint(data),
    onSuccess: () => invalidateSprintDomain(queryClient),
  });
}

/** 更新冲刺：POST /sprint/v1/updateSprint（字段级更新，id 必传） */
export function useUpdateSprint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SprintUpdatePayload) => sprintApi.updateSprint(data),
    onSuccess: () => invalidateSprintDomain(queryClient),
  });
}

/**
 * 开始冲刺：POST /sprint/v1/start/{id}（无请求体）。
 * 后端守卫：仅"规划中 + 有效 + 计划日期齐全 + 项目无其它活跃冲刺"；
 * 并发冲突/项目已有活跃冲刺时报业务码，调用方透出 toUserMessage。
 */
export function useStartSprint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => sprintApi.startSprint(id),
    onSuccess: () => invalidateSprintDomain(queryClient),
  });
}

/**
 * 完成冲刺：POST /sprint/v1/complete/{id}，
 * 请求体 { disposition: 'BACKLOG' | 'TARGET_SPRINT', targetSprintId? }；
 * disposition 必填，TARGET_SPRINT 时 targetSprintId 必填（须同项目、规划中）。
 * 成功后失效冲刺域全部缓存。
 *
 * r14 F4：后端 SprintServiceImpl.completeSprint → taskRepository
 * .moveUnfinishedTasksToSprint 会改写未完成任务的 sprint_id（BACKLOG 与
 * TARGET_SPRINT 都走），因此同步失效任务域缓存，避免 30s staleTime 内
 * 返回任务页仍显示旧所属冲刺。
 */
export function useCompleteSprint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: SprintCompletePayload }) =>
      sprintApi.completeSprint(id, data),
    onSuccess: () => {
      invalidateSprintDomain(queryClient);
      void queryClient.invalidateQueries({ queryKey: queryKeys.task.all });
    },
  });
}

/**
 * 取消冲刺：POST /sprint/v1/cancel/{id}（无请求体）。
 * 后端守卫：仅 PLANNING/ACTIVE（按 canTransitionTo(CANCELLED) 转换表）。
 */
export function useCancelSprint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => sprintApi.cancelSprint(id),
    onSuccess: () => invalidateSprintDomain(queryClient),
  });
}

/**
 * 删除冲刺（逻辑删）：POST /sprint/v1/invalid/{id}。
 * 后端 SprintServiceImpl.invalidSprint 是真正的逻辑删（validStatus 置失效），
 * 记录不再出现在分页查询中（查询统一过滤 validStatus=0），无 UI 恢复入口。
 * 成功后失效冲刺域缓存。
 */
export function useInvalidSprint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => sprintApi.invalidSprint(id),
    onSuccess: () => invalidateSprintDomain(queryClient),
  });
}
