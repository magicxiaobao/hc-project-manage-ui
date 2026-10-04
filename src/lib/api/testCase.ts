/**
 * 测试用例 API。契约忠实于 hc-project-manage 后端 TestCaseController（testCase/v1）
 * 与老前端（frontend/src/api/testCase.ts）：
 * - createTestCase/updateTestCase/valid/{id}/invalid/{id}/findByPage/
 *   deleteTestCase/{id}（软删，老前端称为 archiveTestCase）/
 *   duplicateTestCase/{id}/advancedSearch 全部为 POST（后端语义：状态变更与
 *   “删除”类操作也用 POST）
 * - findById 为 GET
 * - findByPage 的 bean 必须带有效 projectId（后端 validatePageRequest 业务码校验）
 * - 批量删除（batchDeleteTestCase）与高级搜索导出（advancedSearchExport，
 *   返回 JSON Result<List<TestCaseResponse>>，非 xlsx 文件）为 P2 明确排除项，
 *   不建模
 */
import { api } from './client';
import type { PageRequest, PageResult } from './types';
import type {
  TestCaseAdvancedQuery,
  TestCaseCreatePayload,
  TestCaseQueryRequest,
  TestCaseResponse,
  TestCaseUpdatePayload,
} from './testCase-types';

export const testCaseApi = {
  /** 创建用例：后端返回新建用例 id */
  createTestCase: (data: TestCaseCreatePayload) =>
    api.post<number>('/testCase/v1/createTestCase', data),

  /** 更新用例：载荷含 id 的字段级更新 */
  updateTestCase: (data: TestCaseUpdatePayload) =>
    api.post<string>('/testCase/v1/updateTestCase', data),

  /** 启用用例：id 拼在路径上 */
  validTestCase: (id: number) =>
    api.post<string>(`/testCase/v1/valid/${id}`),

  /** 归档用例：id 拼在路径上 */
  invalidTestCase: (id: number) =>
    api.post<string>(`/testCase/v1/invalid/${id}`),

  /** 按 id 查询用例详情 */
  findById: (id: number) =>
    api.get<TestCaseResponse>(`/testCase/v1/findById/${id}`),

  /** 分页查询用例：标准分页请求体 { page, pageSize, bean }，bean.projectId 必填 */
  findByPage: (params: PageRequest<TestCaseQueryRequest>) =>
    api.post<PageResult<TestCaseResponse>>('/testCase/v1/findByPage', params),

  /** 删除用例（软删；老前端称为 archiveTestCase）：id 拼在路径上 */
  deleteTestCase: (id: number) =>
    api.post<string>(`/testCase/v1/deleteTestCase/${id}`),

  /** 复制用例：id 拼在路径上，后端返回新用例 id */
  duplicateTestCase: (id: number) =>
    api.post<number>(`/testCase/v1/duplicateTestCase/${id}`),

  /** 高级搜索（分页）：标准分页请求体 { page, pageSize, bean: TestCaseAdvancedQuery } */
  advancedSearch: (params: PageRequest<TestCaseAdvancedQuery>) =>
    api.post<PageResult<TestCaseResponse>>('/testCase/v1/advancedSearch', params),
};
