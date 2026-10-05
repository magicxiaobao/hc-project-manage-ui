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
    // 跨域投影（Codex review 4183634372/4183634379/4183634386）：任务的流转/
    // 新建/改派/依赖等写入散落在任务域各 mutation，逐个补失效既漏不全、也会
    // 打断看板自身的乐观刷新协调。改为进入页面时总是重取，不吃 30s staleTime。
    refetchOnMount: 'always',
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
    refetchOnMount: 'always', // 跨域投影：进入页面总是重取（见 useSprintList）
  });
}

/**
 * 燃尽图数据：GET /sprint/v1/burndownChart/{id}（后端真实实现，
 * 返回 {dates, values, dailyHours}；冲刺不存在时返回空 Map，
 * 调用方用 normalizeBurndownData 防御归一）。id 无效时 disabled。
 * ⚠️ 不接 TODO 空壳的 /burndown/{sprintId}
 */
export function useSprintBurndown(id: number | null | undefined) {
  return useQuery({
    queryKey: [...queryKeys.sprint.all, 'burndown', id ?? 0] as const,
    queryFn: () => sprintApi.getBurndownChart(id as number),
    enabled: typeof id === 'number' && Number.isFinite(id) && id > 0,
    refetchOnMount: 'always', // 跨域投影：进入页面总是重取（见 useSprintList）
  });
}

/**
 * 冲刺回顾：GET /sprint/v1/retrospective/{sprintId}，返回回顾文本字符串
 * （后端 Result<String>，可能为 null；冲刺不存在时报业务码 NotFind）。
 * id 无效时 disabled。
 */
export function useSprintRetrospective(sprintId: number | null | undefined) {
  return useQuery({
    queryKey: [...queryKeys.sprint.all, 'retrospective', sprintId ?? 0] as const,
    queryFn: () => sprintApi.getRetrospective(sprintId as number),
    enabled: typeof sprintId === 'number' && Number.isFinite(sprintId) && sprintId > 0,
  });
}

/**
 * 保存冲刺回顾：POST /sprint/v1/retrospective/{sprintId}，
 * 请求体 { retrospective }（后端读 body.get("retrospective")，存入
 * retrospective_summary TEXT 列；冲刺不存在时报业务码 NotFind）。
 * 成功后失效该冲刺的回顾缓存。
 */
export function useUpdateRetrospective() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sprintId, retrospective }: { sprintId: number; retrospective: string }) =>
      sprintApi.updateRetrospective(sprintId, retrospective),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.sprint.all, 'retrospective', variables.sprintId],
      });
    },
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
 * 返回任务页仍显示旧所属冲刺。冲刺看板的 columnsWithTasks 按 sprint_id
 * 取卡片，看板域同样失效（同 useUpdateTaskSprint）。
 */
export function useCompleteSprint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: SprintCompletePayload }) =>
      sprintApi.completeSprint(id, data),
    onSuccess: () => {
      invalidateSprintDomain(queryClient);
      void queryClient.invalidateQueries({ queryKey: queryKeys.task.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.board.all });
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

/**
 * 项目全部冲刺（全页循环，供 Backlog 规划等需要全量口径的页面使用）：
 * POST /sprint/v1/project/{projectId}/findByPage 循环拉取（pageSize=200，
 * 直到某页不足一页，避免 total 超单页时静默漏数）。
 * bean 的 status 只有单值 eq，无法表达多状态，因此不带 status 条件，
 * 可挂载过滤在前端完成（见 filterMountableSprints）。
 */
const ALL_SPRINTS_FETCH_PAGE_SIZE = 200;

/** 可挂载状态：后端 TaskServiceImpl.validateMountTarget 只允许挂载到这两种状态 */
const MOUNTABLE_STATUSES = new Set(['PLANNING', 'ACTIVE']);

/** 拉取项目全部冲刺（分页循环，供测试与 hook 共用）。 */
export async function fetchAllProjectSprints(projectId: number): Promise<SprintResponse[]> {
  const all: SprintResponse[] = [];
  let page = 1;
  for (;;) {
    const pageResult = await sprintApi.findByProject(projectId, {
      page,
      pageSize: ALL_SPRINTS_FETCH_PAGE_SIZE,
      bean: { projectId },
    });
    all.push(...pageResult.list);
    if (pageResult.list.length < ALL_SPRINTS_FETCH_PAGE_SIZE) break;
    page += 1;
  }
  return all;
}

export function useProjectAllSprints(params: { projectId?: number | null }) {
  const { projectId } = params;
  return useQuery({
    queryKey: queryKeys.sprint.list({
      allSprints: true,
      pageSize: ALL_SPRINTS_FETCH_PAGE_SIZE,
      projectId: projectId ?? 0,
    }),
    queryFn: () => fetchAllProjectSprints(projectId as number),
    enabled: typeof projectId === 'number' && Number.isFinite(projectId),
  });
}

/**
 * 可挂载冲刺（供 Backlog 规划选择目标使用）：status ∈ {PLANNING, ACTIVE}。
 * 后端实读依据：TaskServiceImpl.validateMountTarget 只允许挂载到
 * 规划中/进行中的冲刺（须同项目、有效），其它状态后端报业务码
 * （"只有规划中或进行中的冲刺可以挂载任务"）；这里把过滤前置，
 * 避免用户选出后端必拒绝的目标。纯函数，可独立测试。
 */
export function filterMountableSprints(sprints: SprintResponse[]): SprintResponse[] {
  return sprints.filter((sprint) => MOUNTABLE_STATUSES.has(sprint.status));
}

/** 可挂载冲刺排序：ACTIVE 在前，其次 PLANNING，同状态按 id 升序。纯函数，可独立测试。 */
export function sortMountableSprints(sprints: SprintResponse[]): SprintResponse[] {
  const rank = (status: string) => (status === 'ACTIVE' ? 0 : 1);
  return [...sprints].sort((a, b) => rank(a.status) - rank(b.status) || a.id - b.id);
}
