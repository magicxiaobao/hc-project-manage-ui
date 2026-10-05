/**
 * 冲刺 API。契约忠实于 hc-project-manage 后端 SprintController（/sprint/v1）：
 * - POST createSprint/updateSprint/valid/{id}/invalid/{id}/findByPage/
 *   project/{projectId}/findByPage/start/{id}/complete/{id}/cancel/{id}/
 *   retrospective/{sprintId}；状态变更一律 POST
 * - GET findById/{id}/active/project/{projectId}/burndownChart/{id}/
 *   retrospective/{sprintId}
 * - ⚠️ GET burndown/{sprintId} 与 statistics/{sprintId} 为 Controller TODO 空壳
 *   （直接返回 Map.of()），P3 明确排除，不建模
 * - 完成冲刺请求体为 SprintCompleteRequest{disposition, targetSprintId}；
 *   disposition 必填（BACKEND 校验），老前端 SprintList.vue 固定 BACKLOG，
 *   此处建模 TARGET_SPRINT 供页面补齐选择
 * - 回顾 POST 请求体为 { retrospective: string }（后端读 body.get("retrospective")）
 */
import { api } from './client';
import type { PageRequest, PageResult } from './types';
import type {
  SprintBurndownData,
  SprintCompletePayload,
  SprintCreatePayload,
  SprintQueryRequest,
  SprintResponse,
  SprintUpdatePayload,
} from './sprint-types';

export const sprintApi = {
  /** 新建冲刺：返回新建冲刺 id */
  createSprint: (data: SprintCreatePayload) =>
    api.post<number>('/sprint/v1/createSprint', data),

  /** 更新冲刺：字段级更新，返回后端成功消息 */
  updateSprint: (data: SprintUpdatePayload) =>
    api.post<string>('/sprint/v1/updateSprint', data),

  /** 启用冲刺：id 拼在路径上 */
  validSprint: (id: number) => api.post<string>(`/sprint/v1/valid/${id}`),

  /** 冲刺逻辑删：id 拼在路径上 */
  invalidSprint: (id: number) => api.post<string>(`/sprint/v1/invalid/${id}`),

  /** 冲刺详情：GET */
  getById: (id: number) => api.get<SprintResponse>(`/sprint/v1/findById/${id}`),

  /** 冲刺分页查询：标准分页请求体 { page, pageSize, bean } */
  findByPage: (params: PageRequest<SprintQueryRequest>) =>
    api.post<PageResult<SprintResponse>>('/sprint/v1/findByPage', params),

  /** 项目冲刺分页：projectId 拼在路径上，请求体仍为标准分页 */
  findByProject: (projectId: number, params: PageRequest<SprintQueryRequest>) =>
    api.post<PageResult<SprintResponse>>(
      `/sprint/v1/project/${projectId}/findByPage`,
      params,
    ),

  /** 开始冲刺：id 拼在路径上，无请求体 */
  startSprint: (id: number) => api.post<string>(`/sprint/v1/start/${id}`),

  /**
   * 完成冲刺：id 拼在路径上，请求体 { disposition, targetSprintId? }；
   * disposition 必填（BACKEND 校验），TARGET_SPRINT 时 targetSprintId 必填
   */
  completeSprint: (id: number, data: SprintCompletePayload) =>
    api.post<string>(`/sprint/v1/complete/${id}`, data),

  /** 取消冲刺：id 拼在路径上，无请求体 */
  cancelSprint: (id: number) => api.post<string>(`/sprint/v1/cancel/${id}`),

  /** 项目活跃冲刺：GET */
  getActiveByProject: (projectId: number) =>
    api.get<SprintResponse | null>(`/sprint/v1/active/project/${projectId}`),

  /**
   * 燃尽图数据：GET /burndownChart/{id}（后端真实实现；
   * 注意不是 TODO 空壳的 /burndown/{sprintId}）
   */
  getBurndownChart: (id: number) =>
    api.get<SprintBurndownData>(`/sprint/v1/burndownChart/${id}`),

  /** 冲刺回顾：GET，返回回顾文本字符串 */
  getRetrospective: (sprintId: number) =>
    api.get<string>(`/sprint/v1/retrospective/${sprintId}`),

  /** 保存冲刺回顾：POST，请求体 { retrospective }（后端读 body.get("retrospective")） */
  updateRetrospective: (sprintId: number, retrospective: string) =>
    api.post<string>(`/sprint/v1/retrospective/${sprintId}`, { retrospective }),
};
