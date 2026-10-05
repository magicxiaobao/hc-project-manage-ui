/**
 * P4 project-stats 契约：依据 spec §3.1 / §3.7 的后端 DTO/VO。
 * 请求无 JsonProperty 别名或 Submitted 协议；CRUD/查询可选字段不代表业务接受空对象。
 * 仅 undefined 在 JSON 序列化时省略，null 不保证显式清空能力；false/0/空串原样保留。
 * LocalDate: YYYY-MM-DD；LocalDateTime: YYYY-MM-DDTHH:mm:ss；Instant: 带时区 ISO-8601。
 * 响应保留 null；createdAt/updatedAt 为 Long → number，时间戳单位不作推断。
 */

export interface StatisticsProjectOptionQuery {
  projectName?: string | null;
  projectKey?: string | null;
  projectType?: string | null;
  status?: string | null;
}

export interface ProjectDashboardVO {
  projectId: number | null;
  projectName: string | null;
  progressPercent: number | null;
  memberCount: number | null;
  taskCount: number | null;
  requirementCount: number | null;
  bugCount: number | null;
  versionCount: number | null;
  totalTasks: number | null;
  completedTasks: number | null;
  inProgressTasks: number | null;
  pendingTasks: number | null;
  pausedTasks: number | null;
  cancelledTasks: number | null;
  unfinishedTasks: number | null;
  milestoneProgress: number | null;
  startDate: string | null;
  endDate: string | null;
  progress: number | null;
}

/** startDate/endDate 为 Java Long → number，时间戳单位待联调确认；不是日期字符串。 */
export interface ProjectGanttVO {
  projectId: number | null;
  projectName: string | null;
  startDate: number | null;
  endDate: number | null;
  tasks: GanttTaskItem[] | null;
}

/** start/end 为 LocalDate，格式 YYYY-MM-DD。 */
export interface GanttTaskItem {
  id: number | null;
  name: string | null;
  start: string | null;
  end: string | null;
  type: string | null;
  status: string | null;
}

export interface ProjectStatisticsVO {
  totalCount: number | null;
  runningCount: number | null;
  completedCount: number | null;
  archivedCount: number | null;
  pausedCount: number | null;
}

export interface StatisticsProjectOptionResponse {
  id: number;
  projectName: string | null;
}
