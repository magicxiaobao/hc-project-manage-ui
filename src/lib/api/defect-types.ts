/**
 * P2 缺陷契约类型。
 *
 * 忠实映射 hc-project-manage 后端 DefectController 与老前端（frontend/src/types/defect.ts）：
 * - status 为状态机枚举名字符串，十态：NEW/ASSIGNED/IN_PROGRESS/PENDING_VERIFICATION/
 *   RESOLVED/CLOSED/REOPEN/REJECTED/VERIFIED/TESTING（DefectStatusEnum @JsonValue，拓扑唯一权威在状态机）
 * - severity JSON identity 为 'BLOCKER'|'CRITICAL'|'MAJOR'|'NORMAL'|'MINOR'|'TRIVIAL'
 *   （DefectSeverityEnum @JsonValue；未知值后端应用服务映射为业务码，不在前端造新值）
 * - priority JSON identity 为 'HIGH'|'MEDIUM'|'LOW'（PriorityEnum 三档冻结）
 * - 缺陷域的 POST 语义：createDefect/updateDefect/updateStatus/{defectId}/severity/
 *   findByPage/advancedSearch 全部为 POST；findById/statistics/board/statusOptions 为 GET
 * - 日期（foundDate/estimatedFixDate/actualFixDate/closedDate）后端为 LocalDateTime，
 *   老前端收发格式为 'YYYY-MM-DDTHH:mm:ss' 字符串，此处类型化为 string，不做毫秒时间戳
 * - 批量操作（batchUpdateStatus/batch/advancedSearchList）与 xlsx 导出不在 P2 范围，
 *   不在此建模
 */

/** 缺陷状态（状态机枚举名，十态） */
export const DEFECT_STATUSES = [
  'NEW',
  'ASSIGNED',
  'IN_PROGRESS',
  'PENDING_VERIFICATION',
  'RESOLVED',
  'CLOSED',
  'REOPEN',
  'REJECTED',
  'VERIFIED',
  'TESTING',
] as const;
export type DefectStatus = (typeof DEFECT_STATUSES)[number];

/** 缺陷严重度（JSON identity 六档） */
export const DEFECT_SEVERITIES = [
  'BLOCKER',
  'CRITICAL',
  'MAJOR',
  'NORMAL',
  'MINOR',
  'TRIVIAL',
] as const;
export type DefectSeverity = (typeof DEFECT_SEVERITIES)[number];

/** 缺陷优先级（JSON identity 三档，与 PriorityEnum 一致） */
export const DEFECT_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type DefectPriority = (typeof DEFECT_PRIORITIES)[number];

/** 缺陷查询条件（忠实于后端 DefectQueryRequest） */
export interface DefectQueryRequest {
  title?: string;
  defectType?: string;
  severity?: DefectSeverity;
  priority?: DefectPriority;
  status?: DefectStatus;
  projectId?: number;
  reporterId?: number;
  assigneeId?: number;
}

/** 缺陷（忠实于后端 DefectResponse；日期为 'YYYY-MM-DDTHH:mm:ss' 字符串） */
export interface DefectResponse {
  id: number;
  title: string;
  description: string | null;
  defectType: string;
  severity: DefectSeverity;
  priority: DefectPriority;
  status: DefectStatus;
  statusLabel: string | null;
  projectId: number;
  reporterId: number | null;
  assigneeId: number | null;
  testerId: number | null;
  foundDate: string | null;
  estimatedFixDate: string | null;
  actualFixDate: string | null;
  closedDate: string | null;
  reproductionSteps: string | null;
  expectedResult: string | null;
  actualResult: string | null;
  environment: string | null;
  attachments: string | null;
  tags: string | null;
  createdAt: number | null;
  updatedAt: number | null;
}

/**
 * 创建缺陷载荷（忠实于后端 DefectCreateRequest）。
 * affectedRequirementIds/foundInTaskIds 默认空数组；日期为 'YYYY-MM-DDTHH:mm:ss'。
 */
export interface DefectCreatePayload {
  title: string;
  description?: string | null;
  defectType?: string | null;
  severity: DefectSeverity;
  priority?: DefectPriority | null;
  projectId: number;
  reporterId?: number | null;
  assigneeId?: number | null;
  foundDate?: string | null;
  estimatedFixDate?: string | null;
  reproductionSteps?: string | null;
  expectedResult?: string | null;
  actualResult?: string | null;
  environment?: string | null;
  attachments?: string | null;
  tags?: string | null;
  affectedRequirementIds?: number[] | null;
  foundInTaskIds?: number[] | null;
}

/**
 * 更新缺陷载荷（忠实于后端 DefectUpdateRequest）。
 * 注意：严重度不在此入口（专用 CAS 端点 {defectId}/severity），
 * 状态流转不在此入口（updateStatus），assigneeId 也不在此入口（走状态机指派）。
 */
export interface DefectUpdatePayload {
  id: number;
  title?: string;
  description?: string | null;
  defectType?: string | null;
  priority?: DefectPriority;
  reporterId?: number | null;
  foundDate?: string | null;
  estimatedFixDate?: string | null;
  reproductionSteps?: string | null;
  expectedResult?: string | null;
  actualResult?: string | null;
  environment?: string | null;
  attachments?: string | null;
  tags?: string | null;
}

/**
 * 缺陷状态流转请求（忠实于后端 DefectStatusUpdateRequest）。
 * 目标状态为 DefectStatus 枚举名；reason 落到 solution/closeReason/rejectReason/
 * reopenReason 等具体语义；NEW→ASSIGNED 与 REJECTED→NEW 两条 ASSIGN 边必需 assigneeId，
 * IN_PROGRESS→TESTING 必需 testerId，→VERIFIED 必需 verifierId（缺失后端 fail-fast）。
 */
export interface DefectTransitionPayload {
  id: number;
  status: DefectStatus;
  reason?: string;
  comment?: string;
  assigneeId?: number | null;
  testerId?: number | null;
  verifierId?: number | null;
}

/**
 * 缺陷严重度重定级请求（忠实于后端 DefectSeverityChangeRequest：CAS 命令）。
 * expectedSeverity 为客户端已读取的当前严重度（旧值校验），reason 去空白后 1～500 字符。
 */
export interface DefectSeverityChangePayload {
  expectedSeverity: DefectSeverity;
  targetSeverity: DefectSeverity;
  reason: string;
}

/** 严重度重定级结果（忠实于后端 DefectSeverityChangeResponse） */
export interface DefectSeverityChangeResult {
  defectId: number;
  previousSeverity: DefectSeverity;
  currentSeverity: DefectSeverity;
}

/** 缺陷状态选项（忠实于后端 DefectStatusOption：value=枚举名，label=中文） */
export interface DefectStatusOption {
  value: DefectStatus;
  label: string;
}

/** 缺陷看板列（忠实于后端 DefectBoardResponse.BoardColumn） */
export interface DefectBoardColumn {
  id: string;
  name: string;
  status: DefectStatus;
  color: string;
  count: number;
}

/** 缺陷看板数据（忠实于后端 DefectBoardResponse） */
export interface DefectBoardResponse {
  defectsByStatus: Record<DefectStatus, DefectResponse[]>;
  columns: DefectBoardColumn[];
}

/** 缺陷统计（忠实于后端 DefectStatisticsResponse） */
export interface DefectStatisticsResponse {
  totalDefects: number;
  openDefects: number;
  inProgressDefects: number;
  testingDefects: number;
  resolvedDefects: number;
  closedDefects: number;
  severityStats: Record<string, number>;
  priorityStats: Record<string, number>;
  typeStats: Record<string, number>;
}

/**
 * 缺陷高级查询请求（忠实于后端 DefectAdvancedQueryRequest）。
 * 时间范围为 ISO-8601 字符串；orderBy 默认 'updateTime'，orderDirection 默认 'DESC'。
 */
export interface DefectAdvancedQuery {
  keyword?: string;
  status?: DefectStatus[];
  priority?: DefectPriority[];
  severity?: DefectSeverity[];
  assigneeIds?: number[];
  reporterIds?: number[];
  createTimeStart?: string;
  createTimeEnd?: string;
  updateTimeStart?: string;
  updateTimeEnd?: string;
  projectId?: number;
  defectType?: string[];
  foundDateStart?: string;
  foundDateEnd?: string;
  tags?: string;
  environment?: string;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
}
