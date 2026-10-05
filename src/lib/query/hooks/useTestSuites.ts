/**
 * 测试套件域 react-query hooks（P2：p2-testsuite-live 垂直切片）。
 *
 * 约定（沿用 useTestCases.ts）：
 * - queryKey 一律走 queryKeys.testSuite.*，不手写数组
 * - 请求参数在 hook 内归一化（默认值 page=1、pageSize=20、bean={}），
 *   保证同一语义的查询 key 形状一致，缓存不被拆散
 * - 列表 hook 的 projectId 为 null/undefined 时 disabled，不发起请求
 *   （套件列表始终按项目过滤，bean.projectId 必传，后端 TestSuiteServiceImpl
 *   显式校验"测试套件分页查询必须指定项目"）
 * - 启用 = POST /testSuite/v1/valid/{id}；归档 = POST /testSuite/v1/invalid/{id}。
 *   注意这是实体 valid/invalid 开关，与八态 status 枚举字段相互独立。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { testSuiteApi } from '../../api/testSuite';
import type {
  TestSuiteCreatePayload,
  TestSuiteQueryRequest,
  TestSuiteUpdatePayload,
} from '../../api/testSuite-types';
import { queryKeys } from '../keys';

export interface TestSuiteListParams {
  page?: number;
  pageSize?: number;
  bean?: Omit<TestSuiteQueryRequest, 'projectId'>;
  /** 所属项目 id；null/undefined 时不发起请求（调用方等待 projectKey→id 解析） */
  projectId?: number | null;
}

export function normalizeTestSuiteListParams(params: TestSuiteListParams = {}) {
  return {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 20,
    bean: { ...params.bean, projectId: params.projectId ?? 0 },
  };
}

/**
 * 套件列表（分页）：走 POST /testSuite/v1/findByPage；
 * 筛选=套件名称（文本）/ 套件类型 / 状态。
 */
export function useTestSuiteList(params: TestSuiteListParams = {}) {
  const { projectId } = params;
  const normalized = normalizeTestSuiteListParams(params);
  return useQuery({
    queryKey: queryKeys.testSuite.list(normalized),
    queryFn: () => testSuiteApi.findByPage(normalized),
    enabled: typeof projectId === 'number' && Number.isFinite(projectId),
  });
}

/** 套件详情：走 GET /testSuite/v1/findById/{id}；id 无效时 disabled */
export function useTestSuiteDetail(id: number | null | undefined) {
  return useQuery({
    queryKey: queryKeys.testSuite.detail(id ?? 0),
    queryFn: () => testSuiteApi.findById(id as number),
    enabled: typeof id === 'number' && Number.isFinite(id) && id > 0,
  });
}

/** 套件域变更的缓存失效：失效套件域全部缓存 */
function invalidateTestSuiteDomain(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.testSuite.all });
}

/**
 * 新建套件：走 POST /testSuite/v1/createTestSuite（后端返回新建套件 id）。
 * 成功后失效套件域全部缓存（列表变脏，下次读取即出现新套件）。
 */
export function useCreateTestSuite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: TestSuiteCreatePayload) => testSuiteApi.createTestSuite(data),
    onSuccess: () => invalidateTestSuiteDomain(queryClient),
  });
}

/** 更新套件：走 POST /testSuite/v1/updateTestSuite（字段级更新，id 必传） */
export function useUpdateTestSuite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: TestSuiteUpdatePayload) => testSuiteApi.updateTestSuite(data),
    onSuccess: () => invalidateTestSuiteDomain(queryClient),
  });
}

/** 启用套件：走 POST /testSuite/v1/valid/{id} */
export function useValidTestSuite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => testSuiteApi.validTestSuite(id),
    onSuccess: () => invalidateTestSuiteDomain(queryClient),
  });
}

/** 归档套件：走 POST /testSuite/v1/invalid/{id} */
export function useInvalidTestSuite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => testSuiteApi.invalidTestSuite(id),
    onSuccess: () => invalidateTestSuiteDomain(queryClient),
  });
}
