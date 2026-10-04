/**
 * 执行记录 API。契约忠实于 hc-project-manage 后端 TestExecutionController（/testExecution/v1）：
 * - POST /testExecution/v1/{executionId}/start（无请求体，返回本次 attempt 快照）
 * - POST /testExecution/v1/{executionId}/complete（载荷字段级可选）
 * - POST /testExecution/v1/{executionId}/retry（请求体 { reason }，reason 先 trim，老前端一致）
 * - POST /testExecution/v1/{executionId}/defects（执行中建缺陷；项目/报告人由服务端可信事实填充）
 * - POST /testExecution/v1/{executionId}/defect-links（关联已有缺陷，请求体 { defectId }）
 */
import { api } from './client';
import type {
  CompleteExecutionPayload,
  CreateExecutionDefectPayload,
  ExecutionDefectResponse,
  LinkExistingDefectPayload,
  RetryExecutionPayload,
} from './testExecution-types';
import type { TestExecutionResponse } from './testRun-types';

export const testExecutionApi = {
  /** 开始执行：id 拼在路径上，无请求体 */
  startExecution: (executionId: number) =>
    api.post<TestExecutionResponse>(`/testExecution/v1/${executionId}/start`),

  /** 完成执行：字段级可选载荷 */
  completeExecution: (executionId: number, data: CompleteExecutionPayload) =>
    api.post<TestExecutionResponse>(
      `/testExecution/v1/${executionId}/complete`,
      data,
    ),

  /** 重试执行：请求体 { reason }，reason 先 trim（老前端一致） */
  retryExecution: (executionId: number, data: RetryExecutionPayload) =>
    api.post<TestExecutionResponse>(`/testExecution/v1/${executionId}/retry`, {
      reason: data.reason.trim(),
    }),

  /** 执行中建缺陷：返回 ExecutionDefectResponse（含 operation 三态） */
  createDefectFromExecution: (
    executionId: number,
    data: CreateExecutionDefectPayload,
  ) =>
    api.post<ExecutionDefectResponse>(
      `/testExecution/v1/${executionId}/defects`,
      data,
    ),

  /** 关联已有缺陷：请求体 { defectId }，后端返回 LINKED / ALREADY_LINKED */
  linkExistingDefect: (executionId: number, data: LinkExistingDefectPayload) =>
    api.post<ExecutionDefectResponse>(
      `/testExecution/v1/${executionId}/defect-links`,
      data,
    ),
};
