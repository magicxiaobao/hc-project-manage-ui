/**
 * 项目 API。契约忠实于 hc-project-manage 老前端 frontend/src/api/project.ts：
 * - POST /project/v1/findByPage，请求体为标准分页格式 { page, pageSize, bean }
 * - POST /project/v1/createProject → number（新建项目 id）
 * - GET /project/v1/findById/{id} → 项目详情
 * - POST /project/v1/checkKeyExists { projectKey, excludeId? } → boolean
 * - GET /project/v1/enums → ProjectEnums
 * - POST /project/v1/updateProject → string
 */
import { api } from './client';
import type {
  PageRequest,
  PageResult,
  ProjectCreatePayload,
  ProjectEnums,
  ProjectQuery,
  ProjectResponse,
  ProjectUpdatePayload,
} from './types';

export const projectApi = {
  /** 分页查询项目 */
  findByPage: (params: PageRequest<ProjectQuery>) =>
    api.post<PageResult<ProjectResponse>>('/project/v1/findByPage', params),

  /** 项目列表（垂直切片）：默认第 1 页、每页 100 条 */
  getProjectList: (params?: { page?: number; pageSize?: number; bean?: ProjectQuery }) =>
    projectApi.findByPage({
      page: params?.page ?? 1,
      pageSize: params?.pageSize ?? 100,
      bean: params?.bean ?? {},
    }),

  /** 创建项目：后端返回新建项目 id */
  createProject: (data: ProjectCreatePayload) =>
    api.post<number>('/project/v1/createProject', data),

  /** 按 id 查询项目详情 */
  findById: (id: number) =>
    api.get<ProjectResponse>(`/project/v1/findById/${id}`),

  /** 检查项目标识 key 是否已存在；编辑场景传 excludeId 排除自身 */
  checkKeyExists: (projectKey: string, excludeId?: number) =>
    api.post<boolean>('/project/v1/checkKeyExists', { projectKey, excludeId }),

  /** 项目枚举：类型/状态/优先级选项 */
  getEnums: () =>
    api.get<ProjectEnums>('/project/v1/enums'),

  /** 更新项目 */
  updateProject: (data: ProjectUpdatePayload) =>
    api.post<string>('/project/v1/updateProject', data),
};
