/**
 * P4 worklog 契约：依据 spec §3.1 / §3.7 的后端 DTO/VO。
 * 请求无 JsonProperty 别名或 Submitted 协议；CRUD/查询可选字段不代表业务接受空对象。
 * 仅 undefined 在 JSON 序列化时省略，null 不保证显式清空能力；false/0/空串原样保留。
 * LocalDate: YYYY-MM-DD；LocalDateTime: YYYY-MM-DDTHH:mm:ss；Instant: 带时区 ISO-8601。
 * 响应保留 null；createdAt/updatedAt 为 Long → number，时间戳单位不作推断。
 */

/** 创建时 userId 替换为当前用户，清除 status/approvalStatus/approverId/approvalTime/approvalComment；无 workType 默认值保证。 */
export interface WorkLogCreatePayload {
  taskId?: number | null;
  userId?: number | null;
  projectId?: number | null;
  sprintId?: number | null;
  workDescription?: string | null;
  workType?: string | null;
  workDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  hoursSpent?: number | null;
  remainingHours?: number | null;
  progressPercentage?: number | null;
  status?: string | null;
  isBillable?: boolean | null;
  billingRate?: number | null;
  workLocation?: string | null;
  tags?: string | null;
  isOvertime?: boolean | null;
  approvalStatus?: string | null;
  approverId?: number | null;
  approvalTime?: string | null;
  approvalComment?: string | null;
}

/** id 为前端定位必填（DTO 无 @NotNull）。后端忽略 taskId/projectId/sprintId/userId/status/approvalStatus/approverId/approvalTime/approvalComment，保留身份与审批工作流。 */
export interface WorkLogUpdatePayload {
  taskId?: number | null;
  userId?: number | null;
  projectId?: number | null;
  sprintId?: number | null;
  workDescription?: string | null;
  workType?: string | null;
  workDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  hoursSpent?: number | null;
  remainingHours?: number | null;
  progressPercentage?: number | null;
  status?: string | null;
  isBillable?: boolean | null;
  billingRate?: number | null;
  workLocation?: string | null;
  tags?: string | null;
  isOvertime?: boolean | null;
  approvalStatus?: string | null;
  approverId?: number | null;
  approvalTime?: string | null;
  approvalComment?: string | null;
  id: number;
}

export interface WorkLogQueryRequest {
  taskId?: number | null;
  userId?: number | null;
  projectId?: number | null;
  sprintId?: number | null;
  workType?: string | null;
  workDate?: string | null;
  status?: string | null;
  workLocation?: string | null;
  approvalStatus?: string | null;
  approverId?: number | null;
}

/** startDate/endDate 必填（@NotNull），格式 YYYY-MM-DD；endDate ≥ startDate，允许同日。
 * TypeScript 不做运行时日期校验；仅 /analytics 使用 @Valid，其它分析/列表端点未加 @Valid。
 * ID 集合无 @Size；实际筛选与授权以各 Controller 消费范围为准。 */
export interface WorkLogAnalyticsRequest {
  startDate: string;
  endDate: string;
  projectIds?: number[] | null;
  userIds?: number[] | null;
  taskIds?: number[] | null;
}

export interface WorkLogResponse {
  id: number;
  createdAt: number | null;
  updatedAt: number | null;
  taskId: number | null;
  userId: number | null;
  projectId: number | null;
  sprintId: number | null;
  workDescription: string | null;
  workType: string | null;
  workDate: string | null;
  startTime: string | null;
  endTime: string | null;
  hoursSpent: number | null;
  remainingHours: number | null;
  progressPercentage: number | null;
  status: string | null;
  isBillable: boolean | null;
  billingRate: number | null;
  workLocation: string | null;
  tags: string | null;
  isOvertime: boolean | null;
  approvalStatus: string | null;
  approverId: number | null;
  approvalTime: string | null;
  approvalComment: string | null;
}

export interface WorkLogStatisticsResponse {
  dimension: string | null;
  userId: number | null;
  userName: string | null;
  userCnName: string | null;
  projectId: number | null;
  projectName: string | null;
  taskId: number | null;
  taskTitle: string | null;
  sprintId: number | null;
  sprintName: string | null;
  statisticDate: string | null;
  totalHours: number | null;
  effectiveHours: number | null;
  billableHours: number | null;
  overtimeHours: number | null;
  recordCount: number | null;
  completedTasks: number | null;
  avgEfficiency: number | null;
  workTypeHours: Record<string, number> | null;
  workLocationHours: Record<string, number> | null;
  approvalStatusHours: Record<string, number> | null;
  entries: WorkLogEntry[] | null;
  effectiveHoursRatio: number | null;
  billableHoursRatio: number | null;
  overtimeHoursRatio: number | null;
}

/** workDate 为 LocalDate（YYYY-MM-DD），区别于 WorkLogResponse 的 LocalDateTime。 */
export interface WorkLogEntry {
  workLogId: number | null;
  workDate: string | null;
  workType: string | null;
  workDescription: string | null;
  hoursSpent: number | null;
  workLocation: string | null;
  approvalStatus: string | null;
  isBillable: boolean | null;
  isOvertime: boolean | null;
}

export interface WorkLogAnalyticsResponse {
  dateRange: DateRange | null;
  userStats: WorkLogStatisticsResponse[] | null;
  dailyTrend: TrendData[] | null;
  weeklyTrend: TrendData[] | null;
  monthlyTrend: TrendData[] | null;
  overview: OverviewStatistics | null;
  efficiency: EfficiencyAnalysis | null;
  teamCollaboration: TeamCollaborationAnalysis | null;
  keyMetricsSummary: Record<string, unknown> | null;
  insights: string[] | null;
}

export interface DateRange {
  startDate: string | null;
  endDate: string | null;
  totalDays: number | null;
  workingDays: number | null;
}

export interface TrendData {
  period: string | null;
  date: string | null;
  hours: number | null;
  effectiveHours: number | null;
  recordCount: number | null;
  userCount: number | null;
  avgHoursPerUser: number | null;
  efficiency: number | null;
}

export interface OverviewStatistics {
  totalHours: number | null;
  effectiveHours: number | null;
  billableHours: number | null;
  overtimeHours: number | null;
  totalRecords: number | null;
  userCount: number | null;
  projectCount: number | null;
  taskCount: number | null;
  avgDailyHours: number | null;
  avgHoursPerUser: number | null;
  avgHoursPerProject: number | null;
  effectiveRatio: number | null;
  billableRatio: number | null;
  overtimeRatio: number | null;
}

export interface EfficiencyAnalysis {
  avgTaskCompletionTime: number | null;
  avgHoursPerTask: number | null;
  typeEfficiency: Record<string, number> | null;
  topPerformers: UserEfficiency[] | null;
  improvementSuggestions: string[] | null;
}

export interface UserEfficiency {
  userId: number | null;
  userName: string | null;
  userCnName: string | null;
  totalHours: number | null;
  completedTasks: number | null;
  efficiency: number | null;
  effectiveRatio: number | null;
  performanceLevel: string | null;
}

export interface TeamCollaborationAnalysis {
  workLocationDistribution: Record<string, number> | null;
  workTypeDistribution: Record<string, number> | null;
  projectCollaborations: ProjectCollaboration[] | null;
  teamEfficiencyScore: number | null;
  collaborationInsights: string[] | null;
}

export interface ProjectCollaboration {
  projectId: number | null;
  projectName: string | null;
  participantCount: number | null;
  totalHours: number | null;
  avgHoursPerUser: number | null;
  taskCompletionRate: number | null;
  collaborationQuality: string | null;
}

/** HTTP 必填参数；执行身份取当前用户，userId 不切换身份。 */
export interface StartWorkParams {
  taskId: number;
  userId: number;
  workDescription: string;
  /** undefined 省略，由后端默认“开发”；显式空值按 Spring defaultValue 处理。 */
  workType?: string;
}

/** approverId 绑定必填，但执行身份取当前用户；comment 无长度/拒绝必填约束。 */
export interface WorkLogApprovalParams {
  approverId: number;
  /** undefined 省略，空串明确发送。 */
  comment?: string;
}

/** 单项目统计的必填 query 日期串。 */
export interface WorkLogProjectStatisticsParams {
  startDate: string;
  endDate: string;
}

/** 单用户统计的必填 query，projectIds 使用重复 key。 */
export interface WorkLogUserStatisticsParams extends WorkLogProjectStatisticsParams {
  projectIds: number[];
}

/** 单任务统计只有必填 projectIds，无日期参数。 */
export interface WorkLogTaskStatisticsParams {
  projectIds: number[];
}
