/**
 * P2 版本契约类型。
 *
 * 忠实映射 hc-project-manage 后端 VersionController（version/v1）+ VersionStatus/VersionEvent 枚举：
 * - status 六态：PLANNING（规划中）/DEVELOPMENT（开发中）/TESTING（测试中）/
 *   FROZEN（已冻结）/RELEASED（已发布）/DEPRECATED（已废弃）
 * - transition 事件→目标状态拓扑：START_DEVELOPMENT（PLANNING→DEVELOPMENT）/
 *   RETURN_TO_PLANNING（DEVELOPMENT→PLANNING，需原因）/START_TESTING（DEVELOPMENT→TESTING）/
 *   RETURN_TO_DEVELOPMENT（TESTING→DEVELOPMENT，需原因）/FREEZE（TESTING→FROZEN）/
 *   REOPEN_TESTING（FROZEN→TESTING，需原因）/DEPRECATE（任意→DEPRECATED，需原因）；
 *   RELEASED 只允许发布结果命令内部写入，人工事件不可达
 * - transition 的 expectedStatus 是状态字段上的乐观并发预期（后端 CAS 比对
 *   stored.status；并发冲突抛 VersionConcurrentConflict），不是数字版本号
 * - findByPage 的 bean.projectId 必填（后端无项目域直接拒绝，findByPage 需分页包装）
 * - 日期用 'YYYY-MM-DDTHH:mm:ss' 字符串（LocalDateTime 序列化口径，沿用 testSuite 惯例）
 * - versionType 四个中文值（老前端常量；后端为 String 不做白名单校验，P5 字典统一前沿用前端常量）
 */

/** 版本状态（六态） */
export const VERSION_STATUSES = [
  'PLANNING',
  'DEVELOPMENT',
  'TESTING',
  'FROZEN',
  'RELEASED',
  'DEPRECATED',
] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];

/** 版本状态中文文案（忠实老前端 versionStatusLabels） */
export const VERSION_STATUS_LABELS: Record<VersionStatus, string> = {
  PLANNING: '规划中',
  DEVELOPMENT: '开发中',
  TESTING: '测试中',
  FROZEN: '已冻结',
  RELEASED: '已发布',
  DEPRECATED: '已废弃',
};

/** 版本人工流转事件（七个公共事件） */
export const VERSION_EVENTS = [
  'START_DEVELOPMENT',
  'RETURN_TO_PLANNING',
  'START_TESTING',
  'RETURN_TO_DEVELOPMENT',
  'FREEZE',
  'REOPEN_TESTING',
  'DEPRECATE',
] as const;
export type VersionEvent = (typeof VERSION_EVENTS)[number];

/** 版本事件中文文案（忠实老前端 versionEventLabels） */
export const VERSION_EVENT_LABELS: Record<VersionEvent, string> = {
  START_DEVELOPMENT: '开始开发',
  RETURN_TO_PLANNING: '退回规划',
  START_TESTING: '开始测试',
  RETURN_TO_DEVELOPMENT: '退回开发',
  FREEZE: '冻结版本',
  REOPEN_TESTING: '重新测试',
  DEPRECATE: '废弃版本',
};

/**
 * 事件→允许的来源状态拓扑（忠实后端 VersionEvent(from→to)；
 * DEPRECATE 的 from 为 null 表示任意非 DEPRECATED 状态均可触发）。
 * 目标状态一律由服务端按事件解析，前端不计算、不硬编码目标。
 */
export const VERSION_EVENT_SOURCES: Record<VersionEvent, VersionStatus | null> = {
  START_DEVELOPMENT: 'PLANNING',
  RETURN_TO_PLANNING: 'DEVELOPMENT',
  START_TESTING: 'DEVELOPMENT',
  RETURN_TO_DEVELOPMENT: 'TESTING',
  FREEZE: 'TESTING',
  REOPEN_TESTING: 'FROZEN',
  DEPRECATE: null,
};

/** 需要原因的事件（忠实后端 VersionEvent.requiresReason；原因缺失/空白直接拒绝） */
export const VERSION_EVENTS_REQUIRING_REASON: readonly VersionEvent[] = [
  'RETURN_TO_PLANNING',
  'RETURN_TO_DEVELOPMENT',
  'REOPEN_TESTING',
  'DEPRECATE',
];

/** 版本类型（老前端常量；后端为 String 不校验） */
export const VERSION_TYPES = ['主版本', '次版本', '补丁版本', '预发布版本'] as const;
export type VersionType = (typeof VERSION_TYPES)[number];

/** 新建版本载荷（忠实于后端 VersionCreateRequest；projectId 必填） */
export interface VersionCreatePayload {
  projectId: number;
  name: string;
  versionNumber: string;
  description: string;
  versionType: VersionType;
  assigneeId?: number;
  plannedStartDate?: string;
  plannedEndDate?: string;
  plannedReleaseDate?: string;
  tags?: string;
}

/** 更新版本载荷（忠实于后端 VersionUpdateRequest：含 id 的字段级更新） */
export interface VersionUpdatePayload extends Omit<VersionCreatePayload, 'projectId'> {
  id: number;
}

/**
 * 版本流转载荷（忠实于后端 VersionTransitionRequest）：
 * - event：触发事件（必填）
 * - expectedStatus：乐观并发预期 = 调用方眼中的当前状态（必填；后端 CAS 比对 status，
 *   冲突抛 VersionConcurrentConflict；不是数字版本号，绝不与乐观锁 version 字段混淆）
 * - reason：原因（RETURN_TO_PLANNING/RETURN_TO_DEVELOPMENT/REOPEN_TESTING/DEPRECATE 必填，
 *   后端 strip 后为空同样拒绝；非必填事件下传则落入审计日志）
 */
export interface VersionTransitionPayload {
  event: VersionEvent;
  expectedStatus: VersionStatus;
  reason?: string;
}

/** 版本分页查询条件（忠实于后端 VersionQueryRequest；projectId 必填且为正数） */
export interface VersionQueryRequest {
  projectId: number;
  name?: string;
  versionNumber?: string;
  versionType?: VersionType;
  status?: VersionStatus;
  assigneeId?: number;
}

/** 版本响应（忠实于后端 VersionResponse + AbstractResponse 的 id/createdAt/updatedAt） */
export interface VersionResponse {
  id: number;
  createdAt: number;
  updatedAt: number;
  name: string;
  versionNumber: string;
  description: string | null;
  versionType: VersionType;
  status: VersionStatus;
  projectId: number;
  assigneeId: number | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  plannedReleaseDate: string | null;
  tags: string | null;
}
