/**
 * 系统管理域 API。契约忠实于 hc-project-manage 后端 project-manage-system-biz：
 * - `user/v1`（UserController，类级 @PreAuthorize("hasAuthority('system:admin')"），
 *   例外：`options`/`profile/avatar`/`{userId}/avatar/content` 为 isAuthenticated()；
 *   注意 `changePassword` 无方法级 @PreAuthorize，继承类级 system:admin（已实读
 *   UserController.java:180-186 确认，非管理员调用会被拦截器 403）
 * - `role/v1`（RoleController）、`permission/v1`（PermissionBasicController）、
 *   `menu/v1`（MenuController）、`dictionary/v1`（DictionaryController）、
 *   `dictionaryItem/v1`（DictionaryItemController）、`systemConfig/v1`（SystemConfigController）
 * - `/system/permission/v1` 是运行时校验 API（check/refresh/cache），无管理 UI 需求，不建模
 * - 状态变更一律 POST；分页统一 POST findByPage + PageRequestWrapper{page,pageSize,bean}
 * - dictionary/v1 无删除端点（仅 valid/invalid），不建模删除（老前端 deleteDictionary 必 404）
 * - 头像内容 GET {userId}/avatar/content 返回原始字节流（非 Result 信封），
 *   无头像时服务端抛错 → 按非 2xx 降级
 */
import { api, HttpResponseError } from './client';
import type { PageRequest, PageResult } from './types';
import type {
  AssignRolePermissionsPayload,
  AssignUserRolesPayload,
  ChangePasswordPayload,
  DictionaryCreatePayload,
  DictionaryItemCreatePayload,
  DictionaryItemQuery,
  DictionaryItemResponse,
  DictionaryItemUpdatePayload,
  DictionaryQuery,
  DictionaryResponse,
  DictionaryUpdatePayload,
  MenuCreatePayload,
  MenuQuery,
  MenuResponse,
  MenuUpdatePayload,
  PermissionCreatePayload,
  PermissionQuery,
  PermissionResponse,
  PermissionUpdatePayload,
  RoleCreatePayload,
  RoleQuery,
  RoleResponse,
  RoleUpdatePayload,
  SystemConfigCreatePayload,
  SystemConfigQuery,
  SystemConfigResponse,
  SystemConfigUpdatePayload,
  UserCreatePayload,
  UserOptionResponse,
  UserQuery,
  UserResponse,
  UserUpdatePayload,
} from './system-types';

/** 构建头像上传的 multipart 表单（后端 @RequestParam("file")，不走 JSON） */
function avatarFormData(file: File | Blob): FormData {
  const form = new FormData();
  form.append('file', file);
  return form;
}

/** 拼查询参数（keyword 等可选 GET 参数） */
function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return qs ? `${path}?${qs}` : path;
}

export const systemApi = {
  /** 用户域 */
  user: {
    /** 新建用户：POST /user/v1/createUser → 新建用户 id */
    createUser: (data: UserCreatePayload) =>
      api.post<number>('/user/v1/createUser', data),

    /** 更新用户：POST /user/v1/updateUser（password 留空=不修改） */
    updateUser: (data: UserUpdatePayload) =>
      api.post<string>('/user/v1/updateUser', data),

    /** 启用用户：POST /user/v1/valid/{id} */
    validUser: (id: number) => api.post<string>(`/user/v1/valid/${id}`),

    /** 禁用用户：POST /user/v1/invalid/{id} */
    invalidUser: (id: number) => api.post<string>(`/user/v1/invalid/${id}`),

    /** 删除用户：POST /user/v1/delete/{id} */
    deleteUser: (id: number) => api.post<string>(`/user/v1/delete/${id}`),

    /** 用户详情：GET /user/v1/findById/{id} */
    findById: (id: number) => api.get<UserResponse>(`/user/v1/findById/${id}`),

    /** 用户分页：POST /user/v1/findByPage */
    findByPage: (params: PageRequest<UserQuery>) =>
      api.post<PageResult<UserResponse>>('/user/v1/findByPage', params),

    /** 用户选择项：POST /user/v1/options（PageRequestWrapper<UserQueryRequest> → 分页选项，供其它域复用） */
    options: (params: PageRequest<UserQuery>) =>
      api.post<PageResult<UserOptionResponse>>('/user/v1/options', params),

    /** 修改密码：POST /user/v1/changePassword { id, oldPassword, newPassword } */
    changePassword: (data: ChangePasswordPayload) =>
      api.post<string>('/user/v1/changePassword', data),

    /** 本人头像上传：POST /user/v1/profile/avatar（multipart file）→ Result<Void> */
    uploadProfileAvatar: (file: File | Blob) =>
      api.request<void>('/user/v1/profile/avatar', {
        method: 'POST',
        body: avatarFormData(file),
      }),

    /** 管理员代传用户头像：POST /user/v1/{userId}/avatar（multipart file） */
    uploadUserAvatar: (userId: number, file: File | Blob) =>
      api.request<void>(`/user/v1/${userId}/avatar`, {
        method: 'POST',
        body: avatarFormData(file),
      }),

    /**
     * 读取头像内容：GET /user/v1/{userId}/avatar/content。
     * 后端返回原始字节流（非 Result 信封）；无头像时服务端抛错（非 2xx），
     * 调用方按 HttpResponseError 降级为占位头像。
     */
    getAvatarContent: async (userId: number): Promise<Blob> => {
      const res = await api.raw(`/user/v1/${userId}/avatar/content`);
      if (!res.ok) {
        throw new HttpResponseError(`头像不可用: userId=${userId}`, res.status);
      }
      return res.blob();
    },

    /** 用户列表：GET /user/v1/list?keyword=（轻量选择器用） */
    list: (keyword?: string) =>
      api.get<UserResponse[]>(withQuery('/user/v1/list', { keyword })),

    /** 用户已分配角色：GET /user/v1/roles/{userId} */
    getUserRoles: (userId: number) =>
      api.get<RoleResponse[]>(`/user/v1/roles/${userId}`),

    /** 分配角色：POST /user/v1/assignRoles { userId, roleIds } */
    assignRoles: (data: AssignUserRolesPayload) =>
      api.post<string>('/user/v1/assignRoles', data),

    /** 项目经理用户列表：GET /user/v1/project-managers */
    getProjectManagers: () => api.get<UserResponse[]>('/user/v1/project-managers'),
  },

  /** 角色域 */
  role: {
    /** 新建角色：POST /role/v1/createRole → 新建角色 id */
    createRole: (data: RoleCreatePayload) =>
      api.post<number>('/role/v1/createRole', data),

    /** 更新角色：POST /role/v1/updateRole */
    updateRole: (data: RoleUpdatePayload) =>
      api.post<string>('/role/v1/updateRole', data),

    /** 启用角色：POST /role/v1/valid/{id} */
    validRole: (id: number) => api.post<string>(`/role/v1/valid/${id}`),

    /** 禁用角色：POST /role/v1/invalid/{id} */
    invalidRole: (id: number) => api.post<string>(`/role/v1/invalid/${id}`),

    /** 角色详情：GET /role/v1/findById/{id} */
    findById: (id: number) => api.get<RoleResponse>(`/role/v1/findById/${id}`),

    /** 角色分页：POST /role/v1/findByPage */
    findByPage: (params: PageRequest<RoleQuery>) =>
      api.post<PageResult<RoleResponse>>('/role/v1/findByPage', params),

    /** 角色列表：GET /role/v1/list?keyword= */
    list: (keyword?: string) =>
      api.get<RoleResponse[]>(withQuery('/role/v1/list', { keyword: keyword?.trim() || undefined })),

    /** 角色已分配权限 id：GET /role/v1/permissions/{roleId} → List<Long> */
    getRolePermissions: (roleId: number) =>
      api.get<number[]>(`/role/v1/permissions/${roleId}`),

    /** 分配权限：POST /role/v1/assignPermissions { roleId, permissionIds } */
    assignPermissions: (data: AssignRolePermissionsPayload) =>
      api.post<string>('/role/v1/assignPermissions', data),
  },

  /** 权限点域（PermissionBasicController @RequestMapping("permission/v1")） */
  permission: {
    /** 新建权限点：POST /permission/v1/createPermission → 新建权限 id */
    createPermission: (data: PermissionCreatePayload) =>
      api.post<number>('/permission/v1/createPermission', data),

    /** 更新权限点：POST /permission/v1/updatePermission */
    updatePermission: (data: PermissionUpdatePayload) =>
      api.post<string>('/permission/v1/updatePermission', data),

    /** 启用权限点：POST /permission/v1/valid/{id} */
    validPermission: (id: number) => api.post<string>(`/permission/v1/valid/${id}`),

    /** 禁用权限点：POST /permission/v1/invalid/{id} */
    invalidPermission: (id: number) => api.post<string>(`/permission/v1/invalid/${id}`),

    /** 删除权限点：POST /permission/v1/delete/{id} */
    deletePermission: (id: number) => api.post<string>(`/permission/v1/delete/${id}`),

    /** 权限点详情：GET /permission/v1/findById/{id} */
    findById: (id: number) =>
      api.get<PermissionResponse>(`/permission/v1/findById/${id}`),

    /** 权限点分页：POST /permission/v1/findByPage */
    findByPage: (params: PageRequest<PermissionQuery>) =>
      api.post<PageResult<PermissionResponse>>('/permission/v1/findByPage', params),

    /** 全部权限点：GET /permission/v1/findAll */
    findAll: () => api.get<PermissionResponse[]>('/permission/v1/findAll'),

    /**
     * 权限树：GET /permission/v1/tree。注意后端只返回 enabled=true 的权限；
     * 后端异常时会被吞掉并返回成功空列表——空树无法区分"无数据"与"接口异常"，
     * 后续 UI 不应把空树直接认定为无数据。
     */
    tree: () => api.get<PermissionResponse[]>('/permission/v1/tree'),
  },

  /** 菜单域 */
  menu: {
    /** 新建菜单：POST /menu/v1/createMenu → 新建菜单 id */
    createMenu: (data: MenuCreatePayload) =>
      api.post<number>('/menu/v1/createMenu', data),

    /** 更新菜单：POST /menu/v1/updateMenu */
    updateMenu: (data: MenuUpdatePayload) =>
      api.post<string>('/menu/v1/updateMenu', data),

    /** 启用菜单：POST /menu/v1/valid/{id} */
    validMenu: (id: number) => api.post<string>(`/menu/v1/valid/${id}`),

    /** 禁用菜单：POST /menu/v1/invalid/{id} */
    invalidMenu: (id: number) => api.post<string>(`/menu/v1/invalid/${id}`),

    /** 菜单详情：GET /menu/v1/findById/{id} */
    findById: (id: number) => api.get<MenuResponse>(`/menu/v1/findById/${id}`),

    /** 菜单分页：POST /menu/v1/findByPage */
    findByPage: (params: PageRequest<MenuQuery>) =>
      api.post<PageResult<MenuResponse>>('/menu/v1/findByPage', params),

    /** 菜单树：GET /menu/v1/getMenuTree */
    getMenuTree: () => api.get<MenuResponse[]>('/menu/v1/getMenuTree'),

    /** 按用户取菜单树：GET /menu/v1/getMenuTreeByUser?userId=（校验分配效果） */
    getMenuTreeByUser: (userId: number, init?: RequestInit) => {
      if (!Number.isSafeInteger(userId) || userId < 0) throw new Error('用户 ID 无效');
      return api.get<MenuResponse[]>(withQuery('/menu/v1/getMenuTreeByUser', { userId }), init);
    },

    /** 按父级取子菜单：GET /menu/v1/getChildrenByParentId?parentId= */
    getChildrenByParentId: (parentId: number) =>
      api.get<MenuResponse[]>(withQuery('/menu/v1/getChildrenByParentId', { parentId })),

    /** 校验菜单权限：GET /menu/v1/checkMenuPermission?userId=&permission= */
    checkMenuPermission: (userId: number, permission: string) =>
      api.get<boolean>(
        withQuery('/menu/v1/checkMenuPermission', { userId, permission }),
      ),
  },

  /** 字典域（无 delete 端点，仅 valid/invalid） */
  dictionary: {
    /** 新建字典：POST /dictionary/v1/createDictionary → 新建字典 id */
    createDictionary: (data: DictionaryCreatePayload) =>
      api.post<number>('/dictionary/v1/createDictionary', data),

    /** 更新字典：POST /dictionary/v1/updateDictionary */
    updateDictionary: (data: DictionaryUpdatePayload) =>
      api.post<string>('/dictionary/v1/updateDictionary', data),

    /** 启用字典：POST /dictionary/v1/valid/{id} */
    validDictionary: (id: number) => api.post<string>(`/dictionary/v1/valid/${id}`),

    /** 禁用字典：POST /dictionary/v1/invalid/{id} */
    invalidDictionary: (id: number) =>
      api.post<string>(`/dictionary/v1/invalid/${id}`),

    /** 字典详情：GET /dictionary/v1/findById/{id} */
    findById: (id: number) =>
      api.get<DictionaryResponse>(`/dictionary/v1/findById/${id}`),

    /** 字典分页：POST /dictionary/v1/findByPage */
    findByPage: (params: PageRequest<DictionaryQuery>) =>
      api.post<PageResult<DictionaryResponse>>('/dictionary/v1/findByPage', params),

    /** 按编码取字典：GET /dictionary/v1/findByCode?code= */
    findByCode: (code: string) =>
      api.get<DictionaryResponse>(withQuery('/dictionary/v1/findByCode', { code })),

    /** 全部有效字典：GET /dictionary/v1/getAllValidDictionaries（供其它域下拉复用） */
    getAllValidDictionaries: () =>
      api.get<DictionaryResponse[]>('/dictionary/v1/getAllValidDictionaries'),

    /** 编码是否已存在：GET /dictionary/v1/existsByCode?code=（表单唯一性预检） */
    existsByCode: (code: string) =>
      api.get<boolean>(withQuery('/dictionary/v1/existsByCode', { code })),

    /** 按字典编码取字典项：GET /dictionary/v1/getDictionaryItemsByCode?code= */
    getDictionaryItemsByCode: (code: string) =>
      api.get<DictionaryItemResponse[]>(
        withQuery('/dictionary/v1/getDictionaryItemsByCode', { code }),
      ),

    /** 校验字典哈希：GET /dictionary/v1/validateHashCode?code=&hashCode= */
    validateHashCode: (code: string, hashCode: string) =>
      api.get<boolean>(
        withQuery('/dictionary/v1/validateHashCode', { code, hashCode }),
      ),

    /** 取字典哈希：GET /dictionary/v1/getHashCode?code= */
    getHashCode: (code: string) =>
      api.get<string>(withQuery('/dictionary/v1/getHashCode', { code })),

    /** 批量校验哈希：POST /dictionary/v1/batchValidateHashCode { code: hashCode } */
    batchValidateHashCode: (codeHashCodeMap: Record<string, string>) =>
      api.post<Record<string, boolean>>(
        '/dictionary/v1/batchValidateHashCode',
        codeHashCodeMap,
      ),
  },

  /** 字典项域 */
  dictionaryItem: {
    /** 新建字典项：POST /dictionaryItem/v1/createDictionaryItem → 新建字典项 id */
    createDictionaryItem: (data: DictionaryItemCreatePayload) =>
      api.post<number>('/dictionaryItem/v1/createDictionaryItem', data),

    /** 更新字典项：POST /dictionaryItem/v1/updateDictionaryItem */
    updateDictionaryItem: (data: DictionaryItemUpdatePayload) =>
      api.post<string>('/dictionaryItem/v1/updateDictionaryItem', data),

    /** 启用字典项：POST /dictionaryItem/v1/valid/{id} */
    validDictionaryItem: (id: number) =>
      api.post<string>(`/dictionaryItem/v1/valid/${id}`),

    /** 禁用字典项：POST /dictionaryItem/v1/invalid/{id} */
    invalidDictionaryItem: (id: number) =>
      api.post<string>(`/dictionaryItem/v1/invalid/${id}`),

    /** 字典项详情：GET /dictionaryItem/v1/findById/{id} */
    findById: (id: number) =>
      api.get<DictionaryItemResponse>(`/dictionaryItem/v1/findById/${id}`),

    /** 字典项分页：POST /dictionaryItem/v1/findByPage */
    findByPage: (params: PageRequest<DictionaryItemQuery>) =>
      api.post<PageResult<DictionaryItemResponse>>('/dictionaryItem/v1/findByPage', params),

    /** 按字典 id 取字典项：GET /dictionaryItem/v1/findByDictId?dictId= */
    findByDictId: (dictId: number) =>
      api.get<DictionaryItemResponse[]>(
        withQuery('/dictionaryItem/v1/findByDictId', { dictId }),
      ),

    /** 按字典编码取字典项：GET /dictionaryItem/v1/findByDictCode?dictCode= */
    findByDictCode: (dictCode: string) =>
      api.get<DictionaryItemResponse[]>(
        withQuery('/dictionaryItem/v1/findByDictCode', { dictCode }),
      ),

    /** 按字典 id 取有效字典项：GET /dictionaryItem/v1/findValidByDictId?dictId= */
    findValidByDictId: (dictId: number) =>
      api.get<DictionaryItemResponse[]>(
        withQuery('/dictionaryItem/v1/findValidByDictId', { dictId }),
      ),

    /** 按字典编码取有效字典项：GET /dictionaryItem/v1/findValidByDictCode?dictCode= */
    findValidByDictCode: (dictCode: string) =>
      api.get<DictionaryItemResponse[]>(
        withQuery('/dictionaryItem/v1/findValidByDictCode', { dictCode }),
      ),

    /** 字典项值是否已存在：GET /dictionaryItem/v1/existsByValue?dictId=&value=（表单唯一性预检） */
    existsByValue: (dictId: number, value: string) =>
      api.get<boolean>(withQuery('/dictionaryItem/v1/existsByValue', { dictId, value })),
  },

  /** 系统配置域 */
  systemConfig: {
    /** 新建配置：POST /systemConfig/v1/createSystemConfig → 新建配置 id */
    createSystemConfig: (data: SystemConfigCreatePayload) =>
      api.post<number>('/systemConfig/v1/createSystemConfig', data),

    /** 更新配置：POST /systemConfig/v1/updateSystemConfig */
    updateSystemConfig: (data: SystemConfigUpdatePayload) =>
      api.post<string>('/systemConfig/v1/updateSystemConfig', data),

    /** 启用配置：POST /systemConfig/v1/valid/{id} */
    validSystemConfig: (id: number) =>
      api.post<string>(`/systemConfig/v1/valid/${id}`),

    /** 禁用配置：POST /systemConfig/v1/invalid/{id} */
    invalidSystemConfig: (id: number) =>
      api.post<string>(`/systemConfig/v1/invalid/${id}`),

    /** 配置详情：GET /systemConfig/v1/findById/{id} */
    findById: (id: number) =>
      api.get<SystemConfigResponse>(`/systemConfig/v1/findById/${id}`),

    /** 配置分页：POST /systemConfig/v1/findByPage */
    findByPage: (params: PageRequest<SystemConfigQuery>) =>
      api.post<PageResult<SystemConfigResponse>>('/systemConfig/v1/findByPage', params),

    /** 按 key 取配置值：GET /systemConfig/v1/getConfigValue?configKey=（配置不存在时后端返回 Result.success(null)） */
    getConfigValue: (configKey: string) =>
      api.get<string | null>(withQuery('/systemConfig/v1/getConfigValue', { configKey })),

    /** 按 key 取配置：GET /systemConfig/v1/getConfigByKey?configKey=（配置不存在/未启用时后端返回 Result.success(null)） */
    getConfigByKey: (configKey: string) =>
      api.get<SystemConfigResponse | null>(
        withQuery('/systemConfig/v1/getConfigByKey', { configKey }),
      ),

    /** 全部有效配置：GET /systemConfig/v1/getAllValidConfigs */
    getAllValidConfigs: () =>
      api.get<SystemConfigResponse[]>('/systemConfig/v1/getAllValidConfigs'),

    /** 批量取配置值：POST /systemConfig/v1/getConfigValues [configKey...] */
    getConfigValues: (configKeys: string[]) =>
      api.post<Record<string, string>>('/systemConfig/v1/getConfigValues', configKeys),

    /** key 是否已存在：GET /systemConfig/v1/existsByConfigKey?configKey=（表单唯一性预检） */
    existsByConfigKey: (configKey: string) =>
      api.get<boolean>(withQuery('/systemConfig/v1/existsByConfigKey', { configKey })),

    /** 按类型取配置：GET /systemConfig/v1/getConfigsByType?configType= */
    getConfigsByType: (configType: string) =>
      api.get<SystemConfigResponse[]>(
        withQuery('/systemConfig/v1/getConfigsByType', { configType }),
      ),

    /** 校验配置值：GET /systemConfig/v1/validateConfigValue?configKey=&configValue= */
    validateConfigValue: (configKey: string, configValue: string) =>
      api.get<boolean>(
        withQuery('/systemConfig/v1/validateConfigValue', { configKey, configValue }),
      ),
  },
};
