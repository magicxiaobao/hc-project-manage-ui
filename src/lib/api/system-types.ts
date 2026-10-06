/**
 * 系统管理域类型（忠实于 hc-project-manage 后端 project-manage-system-biz）。
 *
 * 域前缀约定：`user/v1`、`role/v1`、`permission/v1`、`menu/v1`、`dictionary/v1`、
 * `dictionaryItem/v1`、`systemConfig/v1`。`/system/permission/v1` 是运行时权限
 * 校验 API（check/refresh/cache），无管理 UI 需求，不在此建模。
 *
 * 约定（与既有 *-types.ts 一致）：
 * - Response 含 `id/createdAt/updatedAt`（来自 AbstractResponse），标量字段为 `T | null`；
 * - 请求载荷字段忠实于后端 Request DTO：create 用必填构造、update 含 id；
 * - validStatus 等后端 Integer 枚举保持 number（勿按字符串比较）；
 * - 状态变更一律 POST；分页统一 POST findByPage + { page, pageSize, bean }。
 */

/** 用户（忠实于后端 UserResponse） */
export interface UserResponse {
  id: number;
  username: string | null;
  cnName: string | null;
  email: string | null;
  phone: string | null;
  departmentId: number | null;
  positionId: number | null;
  departmentName: string | null;
  positionName: string | null;
  admin: boolean | null;
  enabled: boolean | null;
  /** 最后登录时间：'YYYY-MM-DDTHH:mm:ss' */
  lastLoginTime: string | null;
  createdAt: number | null;
  updatedAt: number | null;
}

/** 用户轻量选择项（忠实于后端 UserOptionResponse：为任务/需求/测试/项目成员选择器提供） */
export interface UserOptionResponse {
  id: number;
  username: string | null;
  cnName: string | null;
  avatar: string | null;
}

/** 用户查询条件（忠实于后端 UserQueryRequest） */
export interface UserQuery {
  username?: string;
  cnName?: string;
  email?: string;
  departmentId?: number;
  positionId?: number;
  admin?: boolean;
  enabled?: boolean;
}

/** 新建用户载荷（忠实于后端 UserCreateRequest） */
export interface UserCreatePayload {
  username: string;
  password: string;
  cnName?: string | null;
  email?: string | null;
  phone?: string | null;
  departmentId?: number | null;
  positionId?: number | null;
  departmentName?: string | null;
  positionName?: string | null;
  admin?: boolean | null;
  enabled?: boolean | null;
}

/** 更新用户载荷（忠实于后端 UserUpdateRequest；password 留空表示不修改） */
export interface UserUpdatePayload {
  id: number;
  username?: string | null;
  password?: string | null;
  cnName?: string | null;
  email?: string | null;
  phone?: string | null;
  departmentId?: number | null;
  positionId?: number | null;
  departmentName?: string | null;
  positionName?: string | null;
  admin?: boolean | null;
  enabled?: boolean | null;
}

/** 修改密码载荷（忠实于后端 ChangePasswordRequest：{ id, oldPassword, newPassword }） */
export interface ChangePasswordPayload {
  id: number;
  oldPassword: string;
  newPassword: string;
}

/** 分配角色载荷（后端 assignRoles 读 Map body 的 userId/roleIds） */
export interface AssignUserRolesPayload {
  userId: number;
  roleIds: number[];
}

/** 角色（忠实于后端 RoleResponse） */
export interface RoleResponse {
  id: number;
  roleName: string | null;
  roleCode: string | null;
  description: string | null;
  enabled: boolean | null;
  createdAt: number | null;
  updatedAt: number | null;
}

/** 角色查询条件（忠实于后端 RoleQueryRequest） */
export interface RoleQuery {
  roleName?: string;
  roleCode?: string;
  enabled?: boolean;
}

/** 新建角色载荷（忠实于后端 RoleCreateRequest） */
export interface RoleCreatePayload {
  roleName: string;
  roleCode: string;
  description?: string | null;
  enabled?: boolean | null;
}

/** 更新角色载荷（忠实于后端 RoleUpdateRequest） */
export interface RoleUpdatePayload {
  id: number;
  roleName?: string | null;
  roleCode?: string | null;
  description?: string | null;
  enabled?: boolean | null;
}

/** 分配权限载荷（后端 assignPermissions 读 Map body 的 roleId/permissionIds） */
export interface AssignRolePermissionsPayload {
  roleId: number;
  permissionIds: number[];
}

/** 权限点（忠实于后端 PermissionResponse） */
export interface PermissionResponse {
  id: number;
  permissionName: string | null;
  permissionCode: string | null;
  permissionType: string | null;
  groupName: string | null;
  description: string | null;
  enabled: boolean | null;
  createdAt: number | null;
  updatedAt: number | null;
}

/** 权限点查询条件（忠实于后端 PermissionQueryRequest） */
export interface PermissionQuery {
  permissionName?: string;
  permissionCode?: string;
  permissionType?: string;
  enabled?: boolean;
}

/** 新建权限点载荷（忠实于后端 PermissionCreateRequest） */
export interface PermissionCreatePayload {
  permissionName: string;
  permissionCode: string;
  permissionType?: string | null;
  groupName?: string | null;
  description?: string | null;
  enabled?: boolean | null;
}

/** 更新权限点载荷（忠实于后端 PermissionUpdateRequest） */
export interface PermissionUpdatePayload {
  id: number;
  permissionName?: string | null;
  permissionCode?: string | null;
  permissionType?: string | null;
  groupName?: string | null;
  description?: string | null;
  enabled?: boolean | null;
}

/** 菜单（忠实于后端 MenuResponse） */
export interface MenuResponse {
  id: number;
  parentId: number | null;
  name: string | null;
  /** 菜单类型：Integer（1 目录 / 2 菜单 / 3 按钮，以后端枚举为准） */
  type: number | null;
  icon: string | null;
  path: string | null;
  /** 打开方式：Integer */
  openType: number | null;
  uri: string | null;
  permission: string | null;
  sort: number | null;
  keepAlive: boolean | null;
  hidden: boolean | null;
  memo: string | null;
  createdAt: number | null;
  updatedAt: number | null;
}

/** 菜单查询条件（忠实于后端 MenuQueryRequest） */
export interface MenuQuery {
  parentId?: number;
  name?: string;
  type?: number;
  path?: string;
  hidden?: boolean;
}

/** 新建菜单载荷（忠实于后端 MenuCreateRequest；type/openType 为 Integer） */
export interface MenuCreatePayload {
  parentId?: number | null;
  name: string;
  type?: number | null;
  icon?: string | null;
  path?: string | null;
  openType?: number | null;
  uri?: string | null;
  permission?: string | null;
  sort?: number | null;
  keepAlive?: boolean | null;
  hidden?: boolean | null;
  memo?: string | null;
}

/** 更新菜单载荷（忠实于后端 MenuUpdateRequest） */
export interface MenuUpdatePayload {
  id: number;
  parentId?: number | null;
  name?: string | null;
  type?: number | null;
  icon?: string | null;
  path?: string | null;
  openType?: number | null;
  uri?: string | null;
  permission?: string | null;
  sort?: number | null;
  keepAlive?: boolean | null;
  hidden?: boolean | null;
  memo?: string | null;
}

/** 字典（忠实于后端 DictionaryResponse） */
export interface DictionaryResponse {
  id: number;
  code: string | null;
  title: string | null;
  hashCode: string | null;
  valueType: number | null;
  memo: string | null;
  /** 有效状态：Integer（勿按字符串比较，老前端 === 'VALID' 是 bug） */
  validStatus: number | null;
  createdAt: number | null;
  updatedAt: number | null;
}

/** 字典查询条件（忠实于后端 DictionaryQueryRequest） */
export interface DictionaryQuery {
  code?: string;
  title?: string;
  valueType?: number;
  validStatus?: number;
}

/** 新建字典载荷（忠实于后端 DictionaryCreateRequest） */
export interface DictionaryCreatePayload {
  code: string;
  title: string;
  hashCode?: string | null;
  valueType?: number | null;
  memo?: string | null;
  validStatus?: number | null;
}

/** 更新字典载荷（忠实于后端 DictionaryUpdateRequest：无 code 字段） */
export interface DictionaryUpdatePayload {
  id: number;
  title?: string | null;
  hashCode?: string | null;
  valueType?: number | null;
  memo?: string | null;
  validStatus?: number | null;
}

/** 字典项（忠实于后端 DictionaryItemResponse） */
export interface DictionaryItemResponse {
  id: number;
  dictId: number | null;
  dictCode: string | null;
  value: string | null;
  name: string | null;
  attributes: Record<string, unknown> | null;
  sort: number | null;
  memo: string | null;
  /** 有效状态：Integer */
  validStatus: number | null;
  creator: number | null;
  updater: number | null;
  createdAt: number | null;
  updatedAt: number | null;
}

/** 字典项查询条件（忠实于后端 DictionaryItemQueryRequest） */
export interface DictionaryItemQuery {
  dictId?: number;
  dictCode?: string;
  validStatus?: number;
}

/** 新建字典项载荷（忠实于后端 DictionaryItemCreateRequest） */
export interface DictionaryItemCreatePayload {
  dictId: number;
  value: string;
  name?: string | null;
  attributes?: Record<string, unknown> | null;
  sort?: number | null;
  memo?: string | null;
}

/** 更新字典项载荷（忠实于后端 DictionaryItemUpdateRequest：无 dictId 字段） */
export interface DictionaryItemUpdatePayload {
  id: number;
  value?: string | null;
  name?: string | null;
  attributes?: Record<string, unknown> | null;
  sort?: number | null;
  memo?: string | null;
}

/** 系统配置（忠实于后端 SystemConfigResponse） */
export interface SystemConfigResponse {
  id: number;
  name: string | null;
  configKey: string | null;
  configValue: string | null;
  /** 存储类型：STRING|INTEGER|BOOLEAN|JSON；存量未知值原样保留 */
  configType: string | null;
  description: string | null;
  enabled: boolean | null;
  memo: string | null;
  createdAt: number | null;
  updatedAt: number | null;
}

/** 系统配置查询条件（忠实于后端 SystemConfigQueryRequest） */
export interface SystemConfigQuery {
  name?: string;
  configKey?: string;
  configType?: string;
  enabled?: boolean;
}

/** 新建系统配置载荷（忠实于后端 SystemConfigCreateRequest） */
export interface SystemConfigCreatePayload {
  name: string;
  configKey: string;
  configValue?: string | null;
  configType?: string | null;
  description?: string | null;
  enabled?: boolean | null;
  memo?: string | null;
}

/** 更新系统配置载荷（忠实于后端 SystemConfigUpdateRequest） */
export interface SystemConfigUpdatePayload {
  id: number;
  name?: string | null;
  configKey?: string | null;
  configValue?: string | null;
  configType?: string | null;
  description?: string | null;
  enabled?: boolean | null;
  memo?: string | null;
}
