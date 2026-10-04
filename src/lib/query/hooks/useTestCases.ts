/**
 * 测试用例域 react-query hooks（P2：p2-testcase-list-detail 垂直切片）。
 *
 * 约定（沿用 useDefects.ts）：
 * - queryKey 一律走 queryKeys.testCase.*，不手写数组
 * - 请求参数在 hook 内归一化（默认值 page=1、pageSize=20、bean={}），
 *   保证同一语义的查询 key 形状一致，缓存不被拆散
 * - 列表 hook 的 projectId 为 null/undefined 时 disabled，不发起请求
 *   （用例列表始终按项目过滤，bean.projectId 必传，后端 validatePageRequest
 *   会直接报业务码）
 * - 归档 = POST /testCase/v1/invalid/{id}（状态→ARCHIVED）。注意 deleteTestCase
 *   是另一条软删端点（老前端称它为 archiveTestCase），本域按 checklist 的
 *   "invalid 归档" 口径走 invalid。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { testCaseApi } from '../../api/testCase';
import type {
  TestCaseCreatePayload,
  TestCaseQueryRequest,
  TestCaseUpdatePayload,
} from '../../api/testCase-types';
import { queryKeys } from '../keys';

export interface TestCaseListParams {
  page?: number;
  pageSize?: number;
  bean?: Omit<TestCaseQueryRequest, 'projectId'>;
  /** 所属项目 id；null/undefined 时不发起请求（调用方等待 projectKey→id 解析） */
  projectId?: number | null;
}

export function normalizeTestCaseListParams(params: TestCaseListParams = {}) {
  return {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 20,
    bean: { ...params.bean, projectId: params.projectId ?? 0 },
  };
}

/**
 * 用例列表（分页）：走 POST /testCase/v1/findByPage；
 * 筛选=标题/编号/类型/优先级/状态。
 */
export function useTestCaseList(params: TestCaseListParams = {}) {
  const { projectId } = params;
  const normalized = normalizeTestCaseListParams(params);
  return useQuery({
    queryKey: queryKeys.testCase.list(normalized),
    queryFn: () => testCaseApi.findByPage(normalized),
    enabled: typeof projectId === 'number' && Number.isFinite(projectId),
  });
}

/** 用例详情：走 GET /testCase/v1/findById/{id}；id 无效时 disabled */
export function useTestCaseDetail(id: number | null | undefined) {
  return useQuery({
    queryKey: queryKeys.testCase.detail(id ?? 0),
    queryFn: () => testCaseApi.findById(id as number),
    enabled: typeof id === 'number' && Number.isFinite(id) && id > 0,
  });
}

/** 用例域变更的缓存失效：只失效用例域（用例不嵌套进需求追溯图，缺陷域无需失效） */
function invalidateTestCaseDomain(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.testCase.all });
}

/**
 * 新建用例：走 POST /testCase/v1/createTestCase（后端返回新建用例 id）。
 * 成功后失效用例域全部缓存（列表变脏，下次读取即出现新用例）。
 */
export function useCreateTestCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: TestCaseCreatePayload) => testCaseApi.createTestCase(data),
    onSuccess: () => invalidateTestCaseDomain(queryClient),
  });
}

/** 更新用例：走 POST /testCase/v1/updateTestCase（字段级更新，id 必传） */
export function useUpdateTestCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: TestCaseUpdatePayload) => testCaseApi.updateTestCase(data),
    onSuccess: () => invalidateTestCaseDomain(queryClient),
  });
}

/**
 * 复制用例：走 POST /testCase/v1/duplicateTestCase/{id}（后端返回新用例 id）。
 * 成功后失效用例域缓存（列表里出现新副本）。
 */
export function useDuplicateTestCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => testCaseApi.duplicateTestCase(id),
    onSuccess: () => invalidateTestCaseDomain(queryClient),
  });
}

/**
 * 归档用例：走 POST /testCase/v1/invalid/{id}（状态→ARCHIVED；老前端确认文案：
 * "归档后将不再出现在默认列表中"）。
 */
export function useArchiveTestCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => testCaseApi.invalidTestCase(id),
    onSuccess: () => invalidateTestCaseDomain(queryClient),
  });
}
