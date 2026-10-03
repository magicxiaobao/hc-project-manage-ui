/**
 * Phase 0 API 契约类型。
 *
 * 忠实映射 hc-project-manage 老前端（frontend/src/types/）的接口定义，
 * 字段名与语义和后端保持一致，不发明字段。
 */

/** 后端统一响应信封：{ code, msg, result }，成功时 code === 1 */
export interface ApiEnvelope<T = unknown> {
  code: number;
  msg: string;
  result: T;
}

/** 分页请求（老前端统一分页契约） */
export interface PageRequest<T> {
  page: number;
  pageSize: number;
  bean: T;
  sorts?: Record<string, string>;
}

/** 分页响应 */
export interface PageResult<T> {
  list: T[];
  total: number;
  pageNumber: number;
  pageSize: number;
}

/** 登录请求 */
export interface LoginRequest {
  username: string;
  password: string;
  forceLogin?: boolean;
}

/** 已认证用户（登录响应中的 userInfo） */
export interface AuthenticatedUser {
  userId: string;
  userName: string;
  cnName: string | null;
  extraInfo: Record<string, string>;
  roles: string[];
  authorities: string[];
}

/** 登录响应（信封 result 部分） */
export interface LoginResponse {
  token: string;
  username: string;
  expireSec: number;
  refreshToken: string;
  refreshExpire: number;
  userInfo: AuthenticatedUser;
}

/** 登出请求：必须携带 refreshToken，后端凭持有吊销会话 */
export interface LogoutRequest {
  refreshToken: string;
}

/** 刷新令牌响应 */
export interface RefreshTokenResponse {
  token: string;
  expireSec: number;
  userId: string;
  refreshToken: string;
  refreshExpire: number;
}

/** 项目查询条件 */
export interface ProjectQuery {
  projectName?: string;
  projectKey?: string;
  projectType?: string;
  status?: string;
}

/** 项目（列表项） */
export interface ProjectResponse {
  id: number;
  projectName: string;
  projectKey: string;
  description: string | null;
  projectType: string;
  status: string;
  isArchived?: boolean | null;
  startDate: number | null;
  endDate: number | null;
  projectManagerId: number | null;
  memberCount: number | null;
  projectManagerName: string | null;
  createdAt: number;
  updatedAt: number;
}

/** 项目创建类型（忠实于老前端 frontend/src/types/project.ts） */
export const PROJECT_CREATE_TYPES = ['agile', 'waterfall', 'maintenance', 'hybrid'] as const;
export type ProjectCreateType = (typeof PROJECT_CREATE_TYPES)[number];

/** 项目状态 */
export const PROJECT_STATUSES = ['planning', 'in_progress', 'completed', 'paused', 'cancelled'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** 创建项目载荷（忠实于老前端 ProjectCreatePayload） */
export interface ProjectCreatePayload {
  projectName: string;
  projectKey: string;
  description: string;
  projectType: ProjectCreateType;
  startDate: number | null;
  endDate: number | null;
  projectManagerId: number;
}

/** 更新项目载荷（忠实于老前端 ProjectUpdatePayload：日期为后端接受的 string） */
export interface ProjectUpdatePayload extends Omit<ProjectCreatePayload, 'startDate' | 'endDate'> {
  id: number;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
}

/** 枚举选项 */
export interface ProjectEnumOption {
  value: string;
  label: string;
}

/** 项目枚举（类型/状态/优先级） */
export interface ProjectEnums {
  projectTypes: ProjectEnumOption[];
  statuses: ProjectEnumOption[];
  priorities: ProjectEnumOption[];
}
