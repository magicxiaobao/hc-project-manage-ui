import { api } from './client';
import type { PageRequest, PageResult } from './types';
import type {
  WorkLogCreatePayload,
  WorkLogUpdatePayload,
  WorkLogQueryRequest,
  WorkLogResponse,
  StartWorkParams,
  WorkLogApprovalParams,
  WorkLogAnalyticsRequest,
  WorkLogAnalyticsResponse,
  WorkLogStatisticsResponse,
  WorkLogProjectStatisticsParams,
  WorkLogUserStatisticsParams,
  WorkLogTaskStatisticsParams,
} from './worklog-types';

/** 仅省略 undefined，数组按重复 key 编码；空串/0 原样发送。 */
function withQuery(path: string, params: object): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((item) => query.append(key, String(item)));
    else query.append(key, String(value));
  }
  return `${path}?${query}`;
}

/** 工时身份、审批工作流及访问范围以 Controller 为准。 */
export const workLogApi = {
  createWorkLog: (payload: WorkLogCreatePayload) =>
    api.post<number>('/workLog/v1/createWorkLog', payload),
  updateWorkLog: (payload: WorkLogUpdatePayload) =>
    api.post<string>('/workLog/v1/updateWorkLog', payload),
  validWorkLog: (id: number) => api.post<string>(`/workLog/v1/valid/${id}`),
  invalidWorkLog: (id: number) => api.post<string>(`/workLog/v1/invalid/${id}`),
  getById: (id: number) => api.get<WorkLogResponse>(`/workLog/v1/findById/${id}`),
  findByPage: (page: PageRequest<WorkLogQueryRequest>) =>
    api.post<PageResult<WorkLogResponse>>('/workLog/v1/findByPage', page),
  /** userId 是 HTTP 必填参数，但实际执行身份取当前用户。 */
  startWork: (params: StartWorkParams) =>
    api.post<number>(withQuery('/workLog/v1/startWork', params)),
  completeWork: (id: number) => api.post<string>(`/workLog/v1/complete/${id}`),
  pauseWork: (id: number) => api.post<string>(`/workLog/v1/pause/${id}`),
  /** approverId 是 HTTP 必填参数，但审批人为当前用户。 */
  approveWorkLog: (id: number, params: WorkLogApprovalParams) =>
    api.post<string>(withQuery(`/workLog/v1/approve/${id}`, params)),
  rejectWorkLog: (id: number, params: WorkLogApprovalParams) =>
    api.post<string>(withQuery(`/workLog/v1/reject/${id}`, params)),
  findByUser: (userId: number, page: PageRequest<WorkLogQueryRequest>) =>
    api.post<PageResult<WorkLogResponse>>(`/workLog/v1/user/${userId}/findByPage`, page),
  findByTask: (taskId: number, page: PageRequest<WorkLogQueryRequest>) =>
    api.post<PageResult<WorkLogResponse>>(`/workLog/v1/task/${taskId}/findByPage`, page),
  findByProject: (projectId: number, page: PageRequest<WorkLogQueryRequest>) =>
    api.post<PageResult<WorkLogResponse>>(`/workLog/v1/project/${projectId}/findByPage`, page),
  findBySprint: (sprintId: number, page: PageRequest<WorkLogQueryRequest>) =>
    api.post<PageResult<WorkLogResponse>>(`/workLog/v1/sprint/${sprintId}/findByPage`, page),
  /** 仅此分析端点有 @Valid；实际使用 startDate/endDate/projectIds。 */
  getAnalytics: (payload: WorkLogAnalyticsRequest) =>
    api.post<WorkLogAnalyticsResponse>('/workLog/v1/analytics', payload),
  /** Controller 使用 startDate/endDate/projectIds/userIds。 */
  getUserStatisticsList: (payload: WorkLogAnalyticsRequest) =>
    api.post<WorkLogStatisticsResponse[]>('/workLog/v1/statistics/users', payload),
  /** Controller 使用 startDate/endDate/projectIds。 */
  getProjectStatisticsList: (payload: WorkLogAnalyticsRequest) =>
    api.post<WorkLogStatisticsResponse[]>('/workLog/v1/statistics/projects', payload),
  /** Controller 使用 startDate/endDate/projectIds/taskIds。 */
  getTaskStatisticsList: (payload: WorkLogAnalyticsRequest) =>
    api.post<WorkLogStatisticsResponse[]>('/workLog/v1/statistics/tasks', payload),
  /** POST workLog/v1/batchImport：导入 body 未定型，结果为 String；格式待联调确认。 */
  batchImport: (workLogData: unknown) => api.post<string>('/workLog/v1/batchImport', workLogData),
  /** POST workLog/v1/export：结果为未定型的 Result<Object>；不使用文件流或 api.raw。 */
  exportWorkLogs: (page: PageRequest<WorkLogQueryRequest>) =>
    api.post<unknown>('/workLog/v1/export', page),
  /** POST workLog/v1/analytics/trend：结果未定型，实际使用 startDate/endDate/projectIds。 */
  getTrendAnalysis: (payload: WorkLogAnalyticsRequest) =>
    api.post<unknown>('/workLog/v1/analytics/trend', payload),
  /** POST workLog/v1/analytics/efficiency：结果未定型，不套用综合分析的 EfficiencyAnalysis。 */
  getEfficiencyAnalysis: (payload: WorkLogAnalyticsRequest) =>
    api.post<unknown>('/workLog/v1/analytics/efficiency', payload),
  /** POST workLog/v1/analytics/collaboration：结果未定型，不套用综合分析的 TeamCollaborationAnalysis。 */
  getCollaborationAnalysis: (payload: WorkLogAnalyticsRequest) =>
    api.post<unknown>('/workLog/v1/analytics/collaboration', payload),
  /** GET workLog/v1/statistics/project/{projectId}：单项目统计结果待联调。 */
  getProjectStatistics: (projectId: number, params: WorkLogProjectStatisticsParams) =>
    api.get<unknown>(withQuery(`/workLog/v1/statistics/project/${projectId}`, params)),
  /** GET workLog/v1/statistics/user/{userId}：单用户统计结果待联调；三个 query 参数均必填。 */
  getUserStatistics: (userId: number, params: WorkLogUserStatisticsParams) =>
    api.get<unknown>(withQuery(`/workLog/v1/statistics/user/${userId}`, params)),
  /** GET workLog/v1/statistics/task/{taskId}：单任务统计结果待联调；只有 projectIds query。 */
  getTaskStatistics: (taskId: number, params: WorkLogTaskStatisticsParams) =>
    api.get<unknown>(withQuery(`/workLog/v1/statistics/task/${taskId}`, params)),
};
