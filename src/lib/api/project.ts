/**
 * 项目 API。契约忠实于 hc-project-manage 老前端 frontend/src/api/project.ts：
 * - POST /project/v1/findByPage，请求体为标准分页格式 { page, pageSize, bean }
 */
import { api } from './client';
import type { PageRequest, PageResult, ProjectQuery, ProjectResponse } from './types';

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
};
