/**
 * 缺陷域 react-query hooks（P2：p2-defect-list-create 垂直切片；
 * p2-defect-detail-flow 追加详情/流转/严重度/更新）。
 *
 * 约定（沿用 useRequirements.ts / useTasks.ts）：
 * - queryKey 一律走 queryKeys.defect.*，不手写数组
 * - 请求参数在 hook 内归一化（默认值 page=1、pageSize=20、bean={}），
 *   保证同一语义的查询 key 形状一致，缓存不被拆散
 * - 列表 hook 的 projectId 为 null/undefined 时 disabled，不发起请求
 *   （缺陷列表始终按项目过滤，bean.projectId 必传）
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { defectApi } from '../../api/defect';
import type {
  DefectBoardResponse,
  DefectCreatePayload,
  DefectQueryRequest,
  DefectSeverityChangePayload,
  DefectStatisticsResponse,
  DefectStatus,
  DefectStatusOption,
  DefectTransitionPayload,
  DefectUpdatePayload,
} from '../../api/defect-types';
import { useAuthStore } from '../../api/auth-store';
import { queryKeys } from '../keys';

export interface DefectListParams {
  page?: number;
  pageSize?: number;
  bean?: Omit<DefectQueryRequest, 'projectId'>;
  /** 所属项目 id；null/undefined 时不发起请求（调用方等待 projectKey→id 解析） */
  projectId?: number | null;
}

export function normalizeListParams(params: DefectListParams = {}) {
  return {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 20,
    bean: { ...params.bean, projectId: params.projectId ?? 0 },
  };
}

/** 缺陷列表（分页）：走 POST /defect/v1/findByPage；筛选=标题/状态/严重度/优先级 */
export function useDefectList(params: DefectListParams = {}) {
  const { projectId } = params;
  const normalized = normalizeListParams(params);
  return useQuery({
    queryKey: queryKeys.defect.list(normalized),
    queryFn: () => defectApi.findByPage(normalized),
    enabled: typeof projectId === 'number' && Number.isFinite(projectId),
  });
}

/**
 * 缺陷状态选项（十态枚举元数据）：走 GET /defect/v1/statusOptions。
 * value=状态机枚举名，label=中文文案，供列表筛选、看板列、流转选择；
 * 登录态才可请求。
 */
export function useDefectStatusOptions() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  return useQuery({
    queryKey: queryKeys.defect.enums(),
    queryFn: (): Promise<DefectStatusOption[]> => defectApi.getStatusOptions(),
    enabled: isAuthenticated,
  });
}

/**
 * 缺陷看板数据：走 GET /defect/v1/board?projectId=（全量，非分页），
 * 返回 defectsByStatus（按状态分组，空状态键缺失，消费端按 Partial 处理）与
 * columns（后端 DefectBoardColumnCatalog 给出的十列顺序/中文名/颜色）。
 * projectId 无效（非正整数）时 disabled（看板始终按项目过滤）。
 */
export function useDefectBoard(projectId: number | null | undefined) {
  return useQuery({
    queryKey: queryKeys.defect.board(projectId ?? null),
    queryFn: (): Promise<DefectBoardResponse> => defectApi.getDefectBoardData(projectId as number),
    enabled: typeof projectId === 'number' && Number.isInteger(projectId) && projectId > 0,
  });
}

/**
 * 缺陷统计：走 GET /defect/v1/statistics?projectId=。
 * 注意三种分布的 key 口径不统一（severityStats 中文标签 / priorityStats 英文
 * identity / typeStats 原始字符串），见 defect-types.ts 说明。
 */
export function useDefectStatistics(projectId: number | null | undefined) {
  return useQuery({
    queryKey: queryKeys.defect.statistics(projectId ?? null),
    queryFn: (): Promise<DefectStatisticsResponse> => defectApi.getDefectStatistics(projectId as number),
    enabled: typeof projectId === 'number' && Number.isInteger(projectId) && projectId > 0,
  });
}

/**
 * 创建缺陷：走 POST /defect/v1/createDefect（后端返回新建缺陷 id）。
 * 成功后失效缺陷域全部缓存（列表变脏，下次读取即出现新缺陷）。
 * Codex review 4175337096（任务侧先例）：新建并关联需求后，需求追溯图/影响范围/矩阵
 * 要看到新缺陷，一并失效需求域；否则 30 秒 stale 窗口内追溯页展示旧图。
 */
export function useCreateDefect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DefectCreatePayload) => defectApi.createDefect(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.defect.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.requirement.all });
    },
  });
}

/**
 * 缺陷状态流转拓扑（纯函数，可独立测试）。
 *
 * 忠实于后端 DefectStateMachineConfig（拓扑唯一权威）与老前端
 * frontend/src/types/defect.ts 的 DEFECT_TRANSITIONS_BY_STATUS（两者一致）：
 * - 指派边（→ASSIGNED / →NEW）：必需 assigneeId（后端 fail-fast），原因可选
 * - IN_PROGRESS→TESTING：必需 testerId；→VERIFIED：必需 verifierId
 * - 原因必填：→REJECTED / →REOPEN / →CLOSED / →PENDING_VERIFICATION /
 *   →RESOLVED，以及 TESTING→IN_PROGRESS（返回开发原因）
 */
export const DEFECT_TRANSITIONS_BY_STATUS: Record<DefectStatus, DefectStatus[]> = {
  NEW: ['ASSIGNED', 'REJECTED'],
  ASSIGNED: ['IN_PROGRESS'],
  IN_PROGRESS: ['PENDING_VERIFICATION', 'TESTING'],
  PENDING_VERIFICATION: ['RESOLVED', 'REJECTED'],
  TESTING: ['RESOLVED', 'REJECTED', 'IN_PROGRESS'],
  RESOLVED: ['CLOSED', 'VERIFIED', 'REOPEN'],
  CLOSED: ['REOPEN'],
  REOPEN: ['IN_PROGRESS'],
  VERIFIED: ['CLOSED', 'REOPEN'],
  REJECTED: ['REOPEN', 'NEW'],
};

/** 从 from 状态可达的目标状态（未知状态 → 空列表，不渲染流转按钮） */
export function defectTransitionTargets(from: string | null | undefined): DefectStatus[] {
  if (from == null) return [];
  return (DEFECT_TRANSITIONS_BY_STATUS as Record<string, DefectStatus[]>)[from] ?? [];
}

/**
 * 流转原因必填规则（忠实于后端 DefectWorkflowService.transitionDefect）：
 * →REJECTED/→REOPEN/→CLOSED/→PENDING_VERIFICATION/→RESOLVED 必填，
 * TESTING→IN_PROGRESS（返回开发）必填；指派边（→ASSIGNED/→NEW）原因可选。
 */
const DEFECT_REASON_STATUSES: ReadonlySet<DefectStatus> = new Set([
  'REJECTED',
  'REOPEN',
  'CLOSED',
  'PENDING_VERIFICATION',
  'RESOLVED',
]);

export function defectNeedsReason(from: string, to: string): boolean {
  return DEFECT_REASON_STATUSES.has(to as DefectStatus) ||
    (to === 'IN_PROGRESS' && from === 'TESTING');
}

/** 流转目标需要的执行人字段（忠实于后端 requireAssignee/requireTester/requireVerifier） */
export type DefectActorField = 'assignee' | 'tester' | 'verifier';

export function defectNeedsActor(to: string): DefectActorField | null {
  if (to === 'ASSIGNED' || to === 'NEW') return 'assignee';
  if (to === 'TESTING') return 'tester';
  if (to === 'VERIFIED') return 'verifier';
  return null;
}

/**
 * 流转按钮文案（忠实于老前端 getDefectTransitionLabel）：
 * NEW→ASSIGNED=分配、→REJECTED=拒绝、→IN_PROGRESS=开始处理/重新处理、
 * →PENDING_VERIFICATION=提交验证、→TESTING=开始测试、→RESOLVED=解决、
 * →CLOSED=关闭、→VERIFIED=验证、→REOPEN=重新打开、→NEW=重新新建。
 */
export function defectTransitionLabel(
  from: string,
  to: DefectStatus,
  fallback: (status: string) => string,
): string {
  if (from === 'NEW' && to === 'ASSIGNED') return '分配';
  if (to === 'REJECTED') return '拒绝';
  if (to === 'IN_PROGRESS') return from === 'REOPEN' || from === 'TESTING' ? '重新处理' : '开始处理';
  if (to === 'PENDING_VERIFICATION') return '提交验证';
  if (to === 'TESTING') return '开始测试';
  if (to === 'RESOLVED') return '解决';
  if (to === 'CLOSED') return '关闭';
  if (to === 'VERIFIED') return '验证';
  if (to === 'REOPEN') return '重新打开';
  if (to === 'NEW') return '重新新建';
  return fallback(to);
}

/** 缺陷详情：走 GET /defect/v1/findById/{id}；id 无效时 disabled */
export function useDefectDetail(id: number | null | undefined) {
  return useQuery({
    queryKey: queryKeys.defect.detail(id ?? 0),
    queryFn: () => defectApi.findById(id as number),
    enabled: typeof id === 'number' && Number.isFinite(id) && id > 0,
  });
}

/** 缺陷域变更的缓存失效：缺陷域 + 需求域（追溯图/影响范围/矩阵里嵌了缺陷关联与状态）
 * + 测试轮域（工作台展示缺陷标题/严重度摘要；codex r10 P2-10） */
function invalidateDefectDomain(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.defect.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.requirement.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.testRun.all });
}

/**
 * 更新缺陷字段：走 POST /defect/v1/updateDefect。
 * 严重度与状态流转不在此入口（专用 CAS 端点 {defectId}/severity 与 updateStatus）。
 */
export function useUpdateDefect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DefectUpdatePayload) => defectApi.updateDefect(data),
    onSuccess: () => invalidateDefectDomain(queryClient),
  });
}

/**
 * 缺陷状态流转：走 POST /defect/v1/updateStatus
 * （{ id, status, reason?, comment?, assigneeId?, testerId?, verifierId? }）。
 * 非法流转由后端状态机拒绝并经 toUserMessage 展示。
 */
export function useUpdateDefectStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DefectTransitionPayload) => defectApi.updateStatus(data),
    onSuccess: () => invalidateDefectDomain(queryClient),
  });
}

/**
 * 重新评定缺陷严重度：走 POST /defect/v1/{defectId}/severity（CAS 命令，
 * expectedSeverity 为客户端已读取的旧值，远端已变更时后端拒绝并经
 * toUserMessage 展示）。
 *
 * mutation options 抽为纯函数以便独立测试 onError 行为。
 */
export function buildChangeDefectSeverityOptions(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  return {
    mutationFn: ({ defectId, data }: { defectId: number; data: DefectSeverityChangePayload }) =>
      defectApi.changeSeverity(defectId, data),
    onSuccess: () => invalidateDefectDomain(queryClient),
    onError: (
      _error: unknown,
      variables: { defectId: number; data: DefectSeverityChangePayload },
    ) => {
      // CAS 冲突（业务码 10035）后必须回取最新严重度，否则页面内再次提交
      // 必然重复冲突；弹窗文案「请刷新后重试」依赖的就是这次失效
      void queryClient.invalidateQueries({
        queryKey: queryKeys.defect.detail(variables.defectId),
      });
    },
  };
}

export function useChangeDefectSeverity() {
  const queryClient = useQueryClient();
  return useMutation(buildChangeDefectSeverityOptions(queryClient));
}
