/**
 * 任务 API。契约忠实于 hc-project-manage 后端：
 * - TaskController（task/v1）：createTask/updateTask/updateStatus/assign/
 *   valid/{id}/invalid/{id}/findById/{id}/findByPage
 * - CommentController（comment/v1）：target/{targetType}/{targetId}/create|find、
 *   findById/{id}、updateComment、invalid/{id}（任务评论的 targetType = TASK）
 */
import { api } from './client';
import type { PageRequest, PageResult } from './types';
import type {
  CommentCreatePayload,
  CommentUpdatePayload,
  CommentView,
} from './requirement-types';
import type {
  TaskAssignPayload,
  TaskCreatePayload,
  TaskQueryRequest,
  TaskResponse,
  TaskStatus,
  TaskTransitionPayload,
  TaskUpdatePayload,
} from './task-types';

export const taskApi = {
  /** 创建任务：后端返回新建任务 id */
  createTask: (data: TaskCreatePayload) =>
    api.post<number>('/task/v1/createTask', data),

  /**
   * 唯一编辑入口：字段级局部更新（未提交字段不变，显式 null 表示清空）。
   * 执行人变化在同一事务内经改派工作流，需提供 reason。
   */
  updateTask: (data: TaskUpdatePayload) =>
    api.post<string>('/task/v1/updateTask', data),

  /** 启用任务（只动有效标识，不改生命周期 status） */
  validTask: (id: number) =>
    api.post<string>(`/task/v1/valid/${id}`),

  /** 禁用任务（只动有效标识，不改生命周期 status） */
  invalidTask: (id: number) =>
    api.post<string>(`/task/v1/invalid/${id}`),

  /** 按 id 查询任务 */
  findById: (id: number) =>
    api.get<TaskResponse>(`/task/v1/findById/${id}`),

  /** 分页查询任务：标准分页请求体 { page, pageSize, bean } */
  findByPage: (params: PageRequest<TaskQueryRequest>) =>
    api.post<PageResult<TaskResponse>>('/task/v1/findByPage', params),

  /** 任务列表（垂直切片）：默认第 1 页、每页 100 条 */
  getTaskList: (params?: { page?: number; pageSize?: number; bean?: TaskQueryRequest }) =>
    taskApi.findByPage({
      page: params?.page ?? 1,
      pageSize: params?.pageSize ?? 100,
      bean: params?.bean ?? {},
    }),

  /**
   * 变更任务状态：生命周期流转经后端状态机统一门面。
   * context = { assigneeId?, reason?, deliverables?, qualityApproved? }；
   * 暂停/取消/重开需 reason，完成需 deliverables 或说明。
   */
  updateTaskStatus: (
    taskId: number,
    status: TaskStatus,
    context?: Omit<TaskTransitionPayload, 'taskId' | 'status'>,
  ) =>
    api.post<string>('/task/v1/updateStatus', { taskId, status, ...context }),

  /** 分配任务：经状态机改派工作流重新指派执行人（reason 必填） */
  assignTask: (data: TaskAssignPayload) =>
    api.post<string>('/task/v1/assign', data),

  /** 在任务上创建评论（或回复：传 parentId） */
  createComment: (taskId: number, data: CommentCreatePayload) =>
    api.post<number>(`/comment/v1/target/TASK/${taskId}/create`, data),

  /** 分页读取任务评论 */
  findComments: (taskId: number, params: { page: number; pageSize: number }) =>
    api.post<PageResult<CommentView>>(`/comment/v1/target/TASK/${taskId}/find`, params),

  /** 按评论 id 读取 */
  findCommentById: (id: number) =>
    api.get<CommentView>(`/comment/v1/findById/${id}`),

  /** 修改评论正文 */
  updateComment: (data: CommentUpdatePayload) =>
    api.post<CommentView>('/comment/v1/updateComment', data),

  /** 逻辑删除评论 */
  invalidComment: (id: number) =>
    api.post<string>(`/comment/v1/invalid/${id}`),
};
