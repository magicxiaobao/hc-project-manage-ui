/**
 * 任务依赖 API。契约忠实于 hc-project-manage 后端
 * TaskDependencyController（/taskDependency/v1）：
 * - POST createTaskDependency/updateTaskDependency/valid/{id}/invalid/{id}/
 *   findByPage/detectConflicts/batchDelete/getStatistics/checkCircularDependency；
 *   状态变更一律 POST
 * - GET findById/{id}/getPredecessors/{taskId}/getSuccessors/{taskId}
 * - detectConflicts/getStatistics 请求体为 { projectId }（后端读 body.get("projectId")）
 * - batchDelete 请求体为 { ids: number[] }
 * - checkCircularDependency 请求体复用创建载荷，后端仅用 predecessorId/successorId
 *   判断，返回 boolean（true=存在循环）
 * - ⚠️ 老前端死代码 taskDependencyApi.export 在 api 层不存在，P3 明确排除，不建模
 */
import { api } from './client';
import type { PageRequest, PageResult } from './types';
import type {
  DependencyConflict,
  DependencyStatistics,
  TaskDependencyCreatePayload,
  TaskDependencyQueryRequest,
  TaskDependencyResponse,
  TaskDependencyUpdatePayload,
} from './task-dependency-types';

export const taskDependencyApi = {
  /** 新建依赖：返回新建依赖 id（后端 Result<Long>） */
  createTaskDependency: (data: TaskDependencyCreatePayload) =>
    api.post<number>('/taskDependency/v1/createTaskDependency', data),

  /** 更新依赖：字段级更新，返回后端成功消息 */
  updateTaskDependency: (data: TaskDependencyUpdatePayload) =>
    api.post<string>('/taskDependency/v1/updateTaskDependency', data),

  /** 启用依赖：id 拼在路径上 */
  validDependency: (id: number) =>
    api.post<string>(`/taskDependency/v1/valid/${id}`),

  /** 依赖逻辑删：id 拼在路径上 */
  invalidDependency: (id: number) =>
    api.post<string>(`/taskDependency/v1/invalid/${id}`),

  /** 依赖详情：GET */
  getById: (id: number) =>
    api.get<TaskDependencyResponse>(`/taskDependency/v1/findById/${id}`),

  /** 依赖分页查询：标准分页请求体 { page, pageSize, bean } */
  findByPage: (params: PageRequest<TaskDependencyQueryRequest>) =>
    api.post<PageResult<TaskDependencyResponse>>(
      '/taskDependency/v1/findByPage',
      params,
    ),

  /** 检测依赖冲突：请求体 { projectId }（后端读 body.get("projectId")） */
  detectConflicts: (projectId: number) =>
    api.post<DependencyConflict[]>('/taskDependency/v1/detectConflicts', {
      projectId,
    }),

  /** 批量删除依赖：请求体 { ids } */
  batchDelete: (ids: number[]) =>
    api.post<string>('/taskDependency/v1/batchDelete', { ids }),

  /** 依赖统计：请求体 { projectId }，返回 Map（实现拼装） */
  getStatistics: (projectId: number) =>
    api.post<DependencyStatistics>('/taskDependency/v1/getStatistics', {
      projectId,
    }),

  /** 任务的前置依赖：GET，返回依赖列表 */
  getPredecessors: (taskId: number) =>
    api.get<TaskDependencyResponse[]>(
      `/taskDependency/v1/getPredecessors/${taskId}`,
    ),

  /** 任务的后置依赖：GET，返回依赖列表 */
  getSuccessors: (taskId: number) =>
    api.get<TaskDependencyResponse[]>(
      `/taskDependency/v1/getSuccessors/${taskId}`,
    ),

  /**
   * 循环依赖检查：请求体复用创建载荷，后端仅用 predecessorId/successorId；
   * 返回 true 表示将形成循环，页面应在提交前拦截
   */
  checkCircularDependency: (data: TaskDependencyCreatePayload) =>
    api.post<boolean>('/taskDependency/v1/checkCircularDependency', data),
};
