/**
 * P2 发布环境契约类型。
 *
 * 忠实映射 hc-project-manage 后端 ReleaseEnvironmentController（release-environment/v1）：
 * - category 四类：DEVELOPMENT（开发环境）/TESTING（测试环境）/
 *   STAGING（预发布环境）/PRODUCTION（生产环境）
 * - status 两态：ACTIVE（启用）/INACTIVE（已停用）；停用为状态机式操作，禁用后不删除
 * - 响应 JSON 的排序字段名为 `order`（record 组件名；后端实体内部字段 displayOrder）
 * - create 返回响应对象（不是 id）；update 也返回响应对象
 * - disable 请求体必填（后端 @RequestBody 必填，reason 可为空字符串），id 拼在路径上
 * - listByProject 为 GET，返回数组
 */

/** 发布环境分类（四类） */
export const RELEASE_ENVIRONMENT_CATEGORIES = [
  'DEVELOPMENT',
  'TESTING',
  'STAGING',
  'PRODUCTION',
] as const;
export type ReleaseEnvironmentCategory = (typeof RELEASE_ENVIRONMENT_CATEGORIES)[number];

/** 发布环境分类中文文案（忠实老前端 environmentCategoryLabels） */
export const RELEASE_ENVIRONMENT_CATEGORY_LABELS: Record<ReleaseEnvironmentCategory, string> = {
  DEVELOPMENT: '开发环境',
  TESTING: '测试环境',
  STAGING: '预发布环境',
  PRODUCTION: '生产环境',
};

/** 发布环境状态（两态） */
export const RELEASE_ENVIRONMENT_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type ReleaseEnvironmentStatus = (typeof RELEASE_ENVIRONMENT_STATUSES)[number];

/** 发布环境状态中文文案 */
export const RELEASE_ENVIRONMENT_STATUS_LABELS: Record<ReleaseEnvironmentStatus, string> = {
  ACTIVE: '启用',
  INACTIVE: '已停用',
};

/** 新建发布环境载荷（忠实于后端 ReleaseEnvironmentCreateRequest；五项全送） */
export interface ReleaseEnvironmentCreatePayload {
  projectId: number;
  name: string;
  category: ReleaseEnvironmentCategory;
  order: number;
  approvalRequired: boolean;
}

/** 更新发布环境载荷（忠实于后端 ReleaseEnvironmentUpdateRequest：id 必填，其余可选） */
export interface ReleaseEnvironmentUpdatePayload {
  id: number;
  name?: string;
  order?: number;
  approvalRequired?: boolean;
}

/** 停用发布环境载荷（忠实于后端 ReleaseReasonRequest；请求体必填） */
export interface ReleaseEnvironmentDisablePayload {
  reason: string;
}

/** 发布环境响应（忠实于后端 ReleaseEnvironmentResponse record；order 为 JSON 字段名） */
export interface ReleaseEnvironmentResponse {
  id: number;
  projectId: number;
  name: string;
  category: ReleaseEnvironmentCategory;
  order: number;
  approvalRequired: boolean;
  status: ReleaseEnvironmentStatus;
}
