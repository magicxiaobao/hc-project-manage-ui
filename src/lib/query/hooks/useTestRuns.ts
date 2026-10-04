/**
 * 测试轮域 react-query hooks（P2：p2-testrun-workspace 垂直切片）。
 *
 * 约定（沿用 useTestSuites.ts）：
 * - queryKey 一律走 queryKeys.testRun.*，不手写数组
 * - 请求参数在 hook 内归一化（默认值 page=1、pageSize=20、bean={}），
 *   保证同一语义的查询 key 形状一致，缓存不被拆散
 * - 列表 hook 在 projectId 与 versionId 均无效时 disabled，不发起请求
 *   （后端 findByPage 显式校验"projectId/versionId 至少一个有效"，前端
 *   fail-closed，不发出必被拒绝的请求）
 * - 轮生命周期：start（CREATED→RUNNING）/ complete（RUNNING→COMPLETED，
 *   仅无请求体）/ cancel（CREATED|RUNNING→CANCELLED，请求体 { reason }，
 *   reason 先 trim）
 * - 执行生命周期（/testExecution/v1）：start（attempt NOT_STARTED）/
 *   complete（RUNNING→COMPLETED，result 必填）/ retry（最新 attempt
 *   COMPLETED 且 FAILED/BLOCKED，开新 attempt，{ reason } 先 trim）/
 *   defects（失败/阻塞 attempt 建缺陷）/ defect-links（关联已有缺陷）
 * - 所有变更成功后失效 testRun 域全部缓存（轮详情 cases 含最新 attempt
 *   与缺陷摘要，列表与工作台一致）；执行建缺陷额外失效 defect 域
 *   （缺陷列表会出现新缺陷），与缺陷域联动
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { testExecutionApi } from '../../api/testExecution';
import { testRunApi } from '../../api/testRun';
import type {
  CompleteExecutionPayload,
  CreateExecutionDefectPayload,
  LinkExistingDefectPayload,
  RetryExecutionPayload,
} from '../../api/testExecution-types';
import type {
  CancelTestRunPayload,
  CreateAdHocRunPayload,
  CreateFullRegressionPayload,
  CreateTargetedRetestPayload,
  TestRunQueryRequest,
} from '../../api/testRun-types';
import { queryKeys } from '../keys';

export interface TestRunListParams {
  page?: number;
  pageSize?: number;
  bean?: Omit<TestRunQueryRequest, 'projectId' | 'versionId'>;
  /** 列表始终按项目过滤；null/undefined 时退化为按 versionId（均无效时 disabled） */
  projectId?: number | null;
  versionId?: number | null;
}

function isPositiveId(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value > 0 &&
    Number.isSafeInteger(value)
  );
}

export function normalizeTestRunListParams(params: TestRunListParams = {}) {
  const bean: TestRunQueryRequest = { ...(params.bean ?? {}) };
  if (isPositiveId(params.projectId)) bean.projectId = params.projectId;
  if (isPositiveId(params.versionId)) bean.versionId = params.versionId;
  return {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 20,
    bean,
  };
}

/**
 * 测试轮列表（分页）：走 POST /testRun/v1/findByPage；
 * 筛选=轮类型 / 状态。bean 至少携带 projectId 或 versionId 之一。
 */
export function useTestRunList(params: TestRunListParams = {}) {
  const { projectId, versionId } = params;
  const normalized = normalizeTestRunListParams(params);
  const hasScope = isPositiveId(projectId) || isPositiveId(versionId);
  return useQuery({
    queryKey: queryKeys.testRun.list(normalized),
    queryFn: () => testRunApi.findByPage(normalized),
    enabled: hasScope,
  });
}

/** 测试轮详情（执行工作台）：走 GET /testRun/v1/{id}，返回 run + cases */
export function useTestRunDetail(id: number | null | undefined) {
  return useQuery({
    queryKey: queryKeys.testRun.detail(id ?? 0),
    queryFn: () => testRunApi.getDetail(id as number),
    enabled: isPositiveId(id),
  });
}

/**
 * 测试报告（只读聚合视图）：走 GET /testRun/v1/{id}/report，返回 run +
 * summary + resultCounts + cases + defects。
 * 报告只在轮详情页内按需展开加载，不随详情自动请求。
 */
export function useTestRunReport(
  id: number | null | undefined,
  enabled: boolean = true,
) {
  return useQuery({
    queryKey: queryKeys.testRun.report(id ?? 0),
    queryFn: () => testRunApi.getReport(id as number),
    enabled: isPositiveId(id) && enabled,
  });
}

/** 测试轮域变更的缓存失效：失效测试轮域全部缓存 */
function invalidateTestRunDomain(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.testRun.all });
}

/** 缺陷域缓存失效（执行建缺陷会产生新缺陷记录，与缺陷域联动） */
function invalidateDefectDomain(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.defect.all });
}

/** 全量回归建轮：走 POST /testRun/v1/full-regressions */
export function useCreateFullRegression() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateFullRegressionPayload) =>
      testRunApi.createFullRegression(data),
    onSuccess: () => invalidateTestRunDomain(queryClient),
  });
}

/** 即席建轮：走 POST /testRun/v1/ad-hoc-runs */
export function useCreateAdHocRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAdHocRunPayload) => testRunApi.createAdHocRun(data),
    onSuccess: () => invalidateTestRunDomain(queryClient),
  });
}

/** 定向复测建轮：走 POST /testRun/v1/targeted-retests */
export function useCreateTargetedRetest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTargetedRetestPayload) =>
      testRunApi.createTargetedRetest(data),
    onSuccess: () => invalidateTestRunDomain(queryClient),
  });
}

/** 启动测试轮：POST /testRun/v1/{id}/start（仅 CREATED 轮合法） */
export function useStartTestRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => testRunApi.startRun(id),
    onSuccess: () => invalidateTestRunDomain(queryClient),
  });
}

/** 完成测试轮：POST /testRun/v1/{id}/complete（仅 RUNNING 轮合法） */
export function useCompleteTestRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => testRunApi.completeRun(id),
    onSuccess: () => invalidateTestRunDomain(queryClient),
  });
}

/** 取消测试轮：POST /testRun/v1/{id}/cancel，reason 必填（1–500，先 trim） */
export function useCancelTestRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; data: CancelTestRunPayload }) =>
      testRunApi.cancelRun(input.id, input.data),
    onSuccess: () => invalidateTestRunDomain(queryClient),
  });
}

/** 开始执行 attempt：POST /testExecution/v1/{id}/start（仅 NOT_STARTED 合法） */
export function useStartExecution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (executionId: number) =>
      testExecutionApi.startExecution(executionId),
    onSuccess: () => invalidateTestRunDomain(queryClient),
  });
}

/** 完成执行 attempt：POST /testExecution/v1/{id}/complete（result 必填） */
export function useCompleteExecution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { executionId: number; data: CompleteExecutionPayload }) =>
      testExecutionApi.completeExecution(input.executionId, input.data),
    onSuccess: () => invalidateTestRunDomain(queryClient),
  });
}

/**
 * 重试执行：POST /testExecution/v1/{id}/retry（最新 attempt 必须为
 * COMPLETED 且 FAILED/BLOCKED，开新 attempt；reason 必填 1–500，先 trim）
 */
export function useRetryExecution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { executionId: number; data: RetryExecutionPayload }) =>
      testExecutionApi.retryExecution(input.executionId, input.data),
    onSuccess: () => invalidateTestRunDomain(queryClient),
  });
}

/**
 * 执行中建缺陷：POST /testExecution/v1/{id}/defects（失败/阻塞 attempt；
 * 项目与报告人由服务端可信事实填充）。成功后同时失效缺陷域缓存。
 */
export function useCreateDefectFromExecution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      executionId: number;
      data: CreateExecutionDefectPayload;
    }) => testExecutionApi.createDefectFromExecution(input.executionId, input.data),
    onSuccess: () => {
      invalidateTestRunDomain(queryClient);
      invalidateDefectDomain(queryClient);
    },
  });
}

/**
 * 关联已有缺陷：POST /testExecution/v1/{id}/defect-links（失败/阻塞 attempt；
 * 请求体 { defectId }）。成功后失效测试轮域（轮详情 cases 带缺陷摘要）。
 */
export function useLinkExistingDefect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      executionId: number;
      data: LinkExistingDefectPayload;
    }) => testExecutionApi.linkExistingDefect(input.executionId, input.data),
    onSuccess: () => {
      invalidateTestRunDomain(queryClient);
      invalidateDefectDomain(queryClient);
    },
  });
}
