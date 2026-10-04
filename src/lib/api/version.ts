/**
 * 版本 API。契约忠实于 hc-project-manage 后端 VersionController（version/v1）：
 * - POST createVersion，返回新建版本 id
 * - POST updateVersion，载荷含 id 的字段级更新（项目归属不允许变更，后端校验）
 * - POST /version/v1/{id}/transition，请求体 { event, expectedStatus, reason? }：
 *   expectedStatus 是状态字段上的乐观并发预期（后端 CAS 比对 status，冲突抛
 *   VersionConcurrentConflict），目标状态由服务端按事件解析；DEPRECATED 版本
 *   拒绝一切更新；reason 由后端 strip 归一化，前端原样透传不预处理
 * - GET findById/{id}，返回版本详情
 * - POST findByPage，标准分页请求体 { page, pageSize, bean }，bean.projectId 必填
 *   （后端无项目域直接拒绝"版本分页查询必须指定项目"）
 */
import { api } from './client';
import type { PageRequest, PageResult } from './types';
import type {
  VersionCreatePayload,
  VersionQueryRequest,
  VersionResponse,
  VersionTransitionPayload,
  VersionUpdatePayload,
} from './version-types';

export const versionApi = {
  /** 创建版本：后端返回新建版本 id */
  createVersion: (data: VersionCreatePayload) =>
    api.post<number>('/version/v1/createVersion', data),

  /** 更新版本：载荷含 id 的字段级更新 */
  updateVersion: (data: VersionUpdatePayload) =>
    api.post<string>('/version/v1/updateVersion', data),

  /**
   * 版本状态流转：id 拼在路径上，请求体 { event, expectedStatus, reason? }。
   * expectedStatus 必须传调用方读到的当前状态（乐观并发），绝不臆造。
   */
  transitionVersion: (id: number, data: VersionTransitionPayload) =>
    api.post<string>(`/version/v1/${id}/transition`, data),

  /** 按 id 查询版本详情 */
  findById: (id: number) =>
    api.get<VersionResponse>(`/version/v1/findById/${id}`),

  /** 分页查询版本：标准分页请求体 { page, pageSize, bean }，bean.projectId 必填 */
  findByPage: (params: PageRequest<VersionQueryRequest>) =>
    api.post<PageResult<VersionResponse>>('/version/v1/findByPage', params),
};
