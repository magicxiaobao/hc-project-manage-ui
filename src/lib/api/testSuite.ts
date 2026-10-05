/**
 * 测试套件 API。契约忠实于 hc-project-manage 后端 TestSuiteController（testSuite/v1）：
 * - createTestSuite/updateTestSuite/valid/{id}/invalid/{id}/findByPage 全部为 POST；
 *   findById 为 GET
 * - ⚠️ 不 port 老前端（frontend/src/api/testSuite.ts）的遗留路径 `/test-suite/*`：
 *   listTestSuitesByProject、getTestSuiteStatistics、copyTestSuite、batchDeleteTestSuites
 *   等能力在后端 `testSuite/v1` 无对应端点，P2 不建模（copy/statistic 后端无端点）
 */
import { api } from './client';
import type { PageRequest, PageResult } from './types';
import type {
  TestSuiteCreatePayload,
  TestSuiteQueryRequest,
  TestSuiteResponse,
  TestSuiteUpdatePayload,
} from './testSuite-types';

export const testSuiteApi = {
  /** 创建套件：后端返回新建套件 id */
  createTestSuite: (data: TestSuiteCreatePayload) =>
    api.post<number>('/testSuite/v1/createTestSuite', data),

  /** 更新套件：载荷含 id 的字段级更新 */
  updateTestSuite: (data: TestSuiteUpdatePayload) =>
    api.post<string>('/testSuite/v1/updateTestSuite', data),

  /** 启用套件：id 拼在路径上 */
  validTestSuite: (id: number) =>
    api.post<string>(`/testSuite/v1/valid/${id}`),

  /** 归档套件：id 拼在路径上 */
  invalidTestSuite: (id: number) =>
    api.post<string>(`/testSuite/v1/invalid/${id}`),

  /** 按 id 查询套件详情 */
  findById: (id: number) =>
    api.get<TestSuiteResponse>(`/testSuite/v1/findById/${id}`),

  /** 分页查询套件：标准分页请求体 { page, pageSize, bean } */
  findByPage: (params: PageRequest<TestSuiteQueryRequest>) =>
    api.post<PageResult<TestSuiteResponse>>('/testSuite/v1/findByPage', params),
};
