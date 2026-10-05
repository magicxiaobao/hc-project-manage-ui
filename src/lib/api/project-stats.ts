import { api } from './client';
import type { PageRequest, PageResult } from './types';
import type {
  ProjectDashboardVO,
  ProjectGanttVO,
  ProjectStatisticsVO,
  StatisticsProjectOptionQuery,
  StatisticsProjectOptionResponse,
} from './project-stats-types';

/** 项目统计专用端点；各方法权限范围由后端判定。 */
export const projectStatsApi = {
  getDashboard: (projectId: number) =>
    api.get<ProjectDashboardVO>(`/project/v1/dashboard/${projectId}`),
  getProgress: (projectId: number) => api.get<ProjectGanttVO>(`/project/v1/progress/${projectId}`),
  /** 后端过滤 null、去重后要求 1–50 个项目，并逐项目校验访问权限。 */
  compareDashboards: (projectIds: number[]) => {
    const query = new URLSearchParams();
    projectIds.forEach((id) => query.append('projectIds', String(id)));
    return api.get<ProjectDashboardVO[]>(`/project/v1/dashboard/compare?${query}`);
  },
  getStatistics: () => api.get<ProjectStatisticsVO>('/project/v1/statistics'),
  findStatisticsProjectOptions: (page: PageRequest<StatisticsProjectOptionQuery>) =>
    api.post<PageResult<StatisticsProjectOptionResponse>>('/project/v1/statistics/options', page),
};
