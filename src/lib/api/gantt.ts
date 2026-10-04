/**
 * 甘特图/里程碑 API。契约忠实于 hc-project-manage 后端：
 * - TaskController（/task/v1）：GET gantt/{projectId}/dependencies/{taskId}/
 *   criticalPath/{projectId}/criticalPath/tasks/{projectId}/floats/{projectId}；
 *   POST batchUpdate（整批原子更新标题/计划起止日/进度，不接受状态字段）
 * - MilestoneController（/milestone，无 /v1）：POST /create//update//delete/{id}/
 *   /page；GET /{id}/list/{projectId}
 * - ⚠️ GET /milestone/statistics/{projectId} 为统计域，P3 甘特图内不接线，不建模
 * - ⚠️ 老前端 TaskGantt.vue 的关键路径是前端本地算；此处走后端
 *   criticalPath/{projectId}，不做前端本地算
 */
import { api } from './client';
import type { PageRequest, PageResult } from './types';
import type {
  CriticalPathData,
  GanttBatchUpdatePayload,
  GanttData,
  MilestoneCreatePayload,
  MilestoneQueryRequest,
  MilestoneResponse,
  MilestoneUpdatePayload,
  TaskGanttDependencies,
} from './gantt-types';

export const ganttApi = {
  /** 甘特图数据：GET，返回后端拼装的 Map（含 tasks + links） */
  getGanttData: (projectId: number) =>
    api.get<GanttData>(`/task/v1/gantt/${projectId}`),

  /**
   * 批量更新任务（甘特图拖拽改期/拖进度）：POST，请求体 { tasks: Item[] }；
   * Item{id, text?, startDate?, endDate?, progress?}，整批原子落标题/计划起止日/
   * 进度（0–100），不接受状态字段（进度不驱动状态）
   */
  batchUpdateTasks: (data: GanttBatchUpdatePayload) =>
    api.post<string>('/task/v1/batchUpdate', data),

  /** 任务依赖关系：GET，返回 { 前置/后置键: TaskVO[] } 的 Map */
  getTaskDependencies: (taskId: number) =>
    api.get<TaskGanttDependencies>(`/task/v1/dependencies/${taskId}`),

  /** 关键路径：GET /criticalPath/{projectId}（后端计算，老前端本地算已废弃） */
  getCriticalPath: (projectId: number) =>
    api.get<CriticalPathData>(`/task/v1/criticalPath/${projectId}`),

  /** 任务浮动时间：GET，返回 Map<任务 id, 浮动天数> */
  getTaskFloats: (projectId: number) =>
    api.get<Record<number, number>>(`/task/v1/floats/${projectId}`),
};

export const milestoneApi = {
  /** 新建里程碑：POST /milestone/create，返回新建里程碑 id */
  createMilestone: (data: MilestoneCreatePayload) =>
    api.post<number>('/milestone/create', data),

  /**
   * 更新里程碑：POST /milestone/update，"字段 + xxxSubmitted"显式提交模式；
   * 只写置位了 xxxSubmitted 的字段，未置位后端忽略
   */
  updateMilestone: (data: MilestoneUpdatePayload) =>
    api.post<void>('/milestone/update', data),

  /** 删除里程碑：POST /milestone/delete/{id}（硬删除） */
  deleteMilestone: (id: number) => api.post<void>(`/milestone/delete/${id}`),

  /** 里程碑分页查询：POST /milestone/page，标准分页请求体 */
  findByPage: (params: PageRequest<MilestoneQueryRequest>) =>
    api.post<PageResult<MilestoneResponse>>('/milestone/page', params),

  /** 里程碑详情：GET /milestone/{id} */
  getById: (id: number) => api.get<MilestoneResponse>(`/milestone/${id}`),

  /** 项目里程碑列表：GET /milestone/list/{projectId} */
  listByProject: (projectId: number) =>
    api.get<MilestoneResponse[]>(`/milestone/list/${projectId}`),
};
