/**
 * 测试轮 API。契约忠实于 hc-project-manage 后端 TestRunController（/testRun/v1）：
 * - full-regressions / ad-hoc-runs / targeted-retests 三种建轮均为 POST，返回轮摘要
 * - POST /testRun/v1/{testRunId}/start、complete（轮级 start/complete 无请求体）
 * - POST /testRun/v1/{testRunId}/cancel，请求体 { reason }（reason 先 trim，老前端一致）
 * - GET /testRun/v1/{testRunId}：轮详情（run + cases）
 * - POST /testRun/v1/findByPage：标准分页请求体 { page, pageSize, bean }
 * - GET /testRun/v1/{testRunId}/report：测试报告
 * - ⚠️ POST /testRun/v1/{testRunId}/report/export 为导出能力，P2 明确排除，不建模
 * - ⚠️ 老前端 frontend/src/api/testRun.ts 混入的 testExecution 五个能力
 *   （startExecution/completeExecution/retryExecution/createDefect/linkDefect）
 *   拆分到 src/lib/api/testExecution.ts
 */
import { api } from './client';
import type { PageRequest, PageResult } from './types';
import type {
  CancelTestRunPayload,
  CreateAdHocRunPayload,
  CreateFullRegressionPayload,
  CreateTargetedRetestPayload,
  TestRunDetailResponse,
  TestRunQueryRequest,
  TestRunReportResponse,
  TestRunResponse,
} from './testRun-types';

export const testRunApi = {
  /** 全量回归建轮：按版本创建，返回轮摘要 */
  createFullRegression: (data: CreateFullRegressionPayload) =>
    api.post<TestRunResponse>('/testRun/v1/full-regressions', data),

  /** 即席测试轮：按项目创建并带用例/套件选择，返回轮摘要 */
  createAdHocRun: (data: CreateAdHocRunPayload) =>
    api.post<TestRunResponse>('/testRun/v1/ad-hoc-runs', data),

  /** 定向复测：基于旧轮 + 用例选择，返回轮摘要 */
  createTargetedRetest: (data: CreateTargetedRetestPayload) =>
    api.post<TestRunResponse>('/testRun/v1/targeted-retests', data),

  /** 启动测试轮：id 拼在路径上，无请求体 */
  startRun: (testRunId: number) =>
    api.post<TestRunResponse>(`/testRun/v1/${testRunId}/start`),

  /** 完成测试轮：id 拼在路径上，无请求体 */
  completeRun: (testRunId: number) =>
    api.post<TestRunResponse>(`/testRun/v1/${testRunId}/complete`),

  /** 取消测试轮：请求体 { reason }，reason 先 trim（老前端一致） */
  cancelRun: (testRunId: number, data: CancelTestRunPayload) =>
    api.post<TestRunResponse>(`/testRun/v1/${testRunId}/cancel`, {
      reason: data.reason.trim(),
    }),

  /** 轮详情：GET，返回 run + cases */
  getDetail: (testRunId: number) =>
    api.get<TestRunDetailResponse>(`/testRun/v1/${testRunId}`),

  /** 测试轮分页查询：标准分页请求体 { page, pageSize, bean } */
  findByPage: (params: PageRequest<TestRunQueryRequest>) =>
    api.post<PageResult<TestRunResponse>>('/testRun/v1/findByPage', params),

  /** 测试报告：GET，返回 run + summary + resultCounts + cases + defects */
  getReport: (testRunId: number) =>
    api.get<TestRunReportResponse>(`/testRun/v1/${testRunId}/report`),
};
