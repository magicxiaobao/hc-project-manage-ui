/**
 * 发布环境 API。契约忠实于 hc-project-manage 后端 ReleaseEnvironmentController
 *（release-environment/v1）：
 * - POST create，返回环境响应对象（不是 id）
 * - POST update，id/name/order 必填（name 非空≤100 字、order 非负）；
 *   approvalRequired 随状态：ACTIVE 环境必填、INACTIVE 环境必须省略，返回环境响应对象
 * - POST /release-environment/v1/{id}/disable：请求体 { reason } 必填
 *   （后端 @RequestBody 必填、reason 可为空；需 project:admin）
 * - GET /release-environment/v1/project/{projectId}：返回项目环境数组
 */
import { api } from './client';
import type {
  ReleaseEnvironmentCreatePayload,
  ReleaseEnvironmentDisablePayload,
  ReleaseEnvironmentResponse,
  ReleaseEnvironmentUpdatePayload,
} from './releaseEnvironment-types';

export const releaseEnvironmentApi = {
  /** 创建发布环境：返回环境响应对象 */
  createEnvironment: (data: ReleaseEnvironmentCreatePayload) =>
    api.post<ReleaseEnvironmentResponse>('/release-environment/v1/create', data),

  /** 更新发布环境：id/name/order 必填；approvalRequired 随 ACTIVE/INACTIVE 状态必填/必省 */
  updateEnvironment: (data: ReleaseEnvironmentUpdatePayload) =>
    api.post<ReleaseEnvironmentResponse>('/release-environment/v1/update', data),

  /** 停用发布环境：请求体 { reason } 必填 */
  disableEnvironment: (id: number, data: ReleaseEnvironmentDisablePayload) =>
    api.post<string>(`/release-environment/v1/${id}/disable`, data),

  /** 按项目查询发布环境列表：GET，返回数组 */
  listByProject: (projectId: number) =>
    api.get<ReleaseEnvironmentResponse[]>(`/release-environment/v1/project/${projectId}`),
};
