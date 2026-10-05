/**
 * P4 dashboard 契约：依据 spec §3.1 / §3.7 的后端 DTO/VO。
 * 请求无 JsonProperty 别名或 Submitted 协议；CRUD/查询可选字段不代表业务接受空对象。
 * 仅 undefined 在 JSON 序列化时省略，null 不保证显式清空能力；false/0/空串原样保留。
 * LocalDate: YYYY-MM-DD；LocalDateTime: YYYY-MM-DDTHH:mm:ss；Instant: 带时区 ISO-8601。
 * 响应保留 null；createdAt/updatedAt 为 Long → number，时间戳单位不作推断。
 */

/** 创建时后端强制 ownerId=当前用户、dashboardType="项目仪表板"、isDefault=false，清除 status/lastAccessedAt/accessCount。 */
export interface DashboardCreatePayload {
  dashboardName?: string | null;
  description?: string | null;
  dashboardType?: string | null;
  projectId?: number | null;
  ownerId?: number | null;
  dashboardConfig?: string | null;
  isDefault?: boolean | null;
  isPublic?: boolean | null;
  sortOrder?: number | null;
  status?: string | null;
  refreshInterval?: number | null;
  autoRefresh?: boolean | null;
  theme?: string | null;
  accessConfig?: string | null;
  lastAccessedAt?: string | null;
  accessCount?: number | null;
}

/** id 为前端定位必填（DTO 无 @NotNull）。后端忽略 projectId/ownerId/dashboardType/isDefault/status/lastAccessedAt/accessCount，保留身份与生命周期。 */
export interface DashboardUpdatePayload {
  dashboardName?: string | null;
  description?: string | null;
  dashboardType?: string | null;
  projectId?: number | null;
  ownerId?: number | null;
  dashboardConfig?: string | null;
  isDefault?: boolean | null;
  isPublic?: boolean | null;
  sortOrder?: number | null;
  status?: string | null;
  refreshInterval?: number | null;
  autoRefresh?: boolean | null;
  theme?: string | null;
  accessConfig?: string | null;
  lastAccessedAt?: string | null;
  accessCount?: number | null;
  id: number;
}

export interface DashboardQueryRequest {
  dashboardName?: string | null;
  dashboardType?: string | null;
  projectId?: number | null;
  ownerId?: number | null;
  status?: string | null;
}

export interface DashboardWidgetCreatePayload {
  dashboardId?: number | null;
  widgetName?: string | null;
  widgetTitle?: string | null;
  widgetType?: string | null;
  dataSource?: string | null;
  widgetConfig?: string | null;
  positionX?: number | null;
  positionY?: number | null;
  width?: number | null;
  height?: number | null;
  sortOrder?: number | null;
  isVisible?: boolean | null;
  isResizable?: boolean | null;
  isDraggable?: boolean | null;
  refreshInterval?: number | null;
  autoRefresh?: boolean | null;
  styleConfig?: string | null;
  filterConfig?: string | null;
  lastUpdatedAt?: string | null;
}

/** id 为前端定位必填（DTO 无 @NotNull）。 */
export interface DashboardWidgetUpdatePayload {
  dashboardId?: number | null;
  widgetName?: string | null;
  widgetTitle?: string | null;
  widgetType?: string | null;
  dataSource?: string | null;
  widgetConfig?: string | null;
  positionX?: number | null;
  positionY?: number | null;
  width?: number | null;
  height?: number | null;
  sortOrder?: number | null;
  isVisible?: boolean | null;
  isResizable?: boolean | null;
  isDraggable?: boolean | null;
  refreshInterval?: number | null;
  autoRefresh?: boolean | null;
  styleConfig?: string | null;
  filterConfig?: string | null;
  lastUpdatedAt?: string | null;
  id: number;
}

export interface DashboardWidgetQueryRequest {
  dashboardId?: number | null;
  widgetName?: string | null;
  widgetType?: string | null;
  dataSource?: string | null;
}

export interface DashboardResponse {
  id: number;
  createdAt: number | null;
  updatedAt: number | null;
  dashboardName: string | null;
  description: string | null;
  dashboardType: string | null;
  projectId: number | null;
  ownerId: number | null;
  dashboardConfig: string | null;
  isDefault: boolean | null;
  isPublic: boolean | null;
  sortOrder: number | null;
  status: string | null;
  refreshInterval: number | null;
  autoRefresh: boolean | null;
  theme: string | null;
  accessConfig: string | null;
  lastAccessedAt: string | null;
  accessCount: number | null;
}

export interface DashboardWidgetResponse {
  id: number;
  createdAt: number | null;
  updatedAt: number | null;
  dashboardId: number | null;
  widgetName: string | null;
  widgetTitle: string | null;
  widgetType: string | null;
  dataSource: string | null;
  widgetConfig: string | null;
  positionX: number | null;
  positionY: number | null;
  width: number | null;
  height: number | null;
  sortOrder: number | null;
  isVisible: boolean | null;
  isResizable: boolean | null;
  isDraggable: boolean | null;
  refreshInterval: number | null;
  autoRefresh: boolean | null;
  styleConfig: string | null;
  filterConfig: string | null;
  lastUpdatedAt: string | null;
}

/** 外层 code=1 时仍可能 success=false；保留 config/message，不转换失败为默认配置。 */
export interface DashboardConfigResponse {
  config: DashboardConfigVO | null;
  success: boolean | null;
  message: string | null;
}

export interface DashboardConfigVO {
  dashboardId: number | null;
  dashboardName: string | null;
  dashboardType: string | null;
  layout: LayoutItem[] | null;
  theme: ThemeConfig | null;
  refresh: RefreshConfig | null;
  permissions: PermissionConfig | null;
  customConfig: Record<string, unknown> | null;
}

export interface LayoutItem {
  id: string | null;
  type: string | null;
  x: number | null;
  y: number | null;
  w: number | null;
  h: number | null;
  config: Record<string, unknown> | null;
}

export interface ThemeConfig {
  name: string | null;
  primaryColor: string | null;
  backgroundColor: string | null;
  fontSize: string | null;
}

export interface RefreshConfig {
  autoRefresh: boolean | null;
  interval: number | null;
  strategy: string | null;
}

export interface PermissionConfig {
  editable: boolean | null;
  deletable: boolean | null;
  shareable: boolean | null;
  accessPermissions: string[] | null;
}
