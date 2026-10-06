import { hasSystemAdmin, useAuthStore } from '../../api/auth-store';
/**
 * 系统管理域·用户 react-query hooks（P5 p5-user-list 垂直切片）。
 *
 * 约定（沿用 useProjects）：
 * - queryKey 一律走 queryKeys.system.*，不手写数组
 * - 请求参数在 hook 内归一化，保证同一语义的查询 key 形状一致
 * - 状态变更（启用/禁用/删除）成功后失效 system 域全部缓存，列表自动刷新
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { systemApi } from '../../api/system';
import type { UserCreatePayload, UserQuery, UserUpdatePayload } from '../../api/system-types';
import { queryKeys } from '../keys';

export type UserEnabledFilter = 'all' | 'enabled' | 'disabled';

export interface UserListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  enabledFilter?: UserEnabledFilter;
}

/**
 * 搜索表单 → 后端 UserQuery 映射。
 *
 * 修复老前端 UserList.vue 的搜索表单死代码：它收集了 keyword/status，
 * 却从不传给 findByPage，搜索/重置按钮形同虚设。
 *
 * - keyword：后端 UserServiceImpl.findByPage 中 username 与 cnName 取同值时
 *   按"用户名 LIKE OR 姓名 LIKE"处理，故 keyword 同时填入两字段；
 *   为空则不传，避免 username='' 把全表过滤掉；
 * - 状态筛选（r4 P1-2）：不再发送 bean.enabled——后端 UserQueryRequest 虽声明
 *   了 enabled，但 request2Query（MapStruct 同名映射）的目标 UserQuery /
 *   BaseUserQuery 根本没有 enabled 字段（只有 validStatus），该值被静默丢弃；
 *   且 findByPage 无条件 eq validStatus=VALID（UserServiceImpl.java:150），
 *   从不读取筛选值。发送 enabled 只会制造"筛选生效"的假象，故不再发送。
 *   参数保留（命名 _enabledFilter）以兼容调用签名，当前仅影响 queryKey 归一化。
 */
export function buildUserQuery(keyword = '', _enabledFilter: UserEnabledFilter = 'all'): UserQuery {
  const kw = keyword.trim();
  const bean: UserQuery = {};
  if (kw) {
    bean.username = kw;
    bean.cnName = kw;
  }
  // _enabledFilter 故意不映射进 bean（见上方注释）；保留参数以兼容调用签名。
  return bean;
}

export function normalizeUserListParams(params: UserListParams = {}) {
  return {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 20,
    bean: buildUserQuery(params.keyword ?? '', params.enabledFilter ?? 'all'),
  };
}

/** 用户列表（分页）：走 POST /user/v1/findByPage，载荷 { page, pageSize, bean } */
export function useUserList(params: UserListParams = {}) {
  const normalized = normalizeUserListParams(params);
  const allowed = useAuthStore((state) => state.isAuthenticated && hasSystemAdmin(state.user?.authorities));
  return useQuery({
    enabled: allowed,
    queryKey: queryKeys.system.list(normalized),
    queryFn: () => systemApi.user.findByPage(normalized),
  });
}

function useInvalidateSystemDomain() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.system.all });
  };
}

/** 启用用户：走 POST /user/v1/valid/{id} */
export function useValidUser() {
  const invalidate = useInvalidateSystemDomain();
  return useMutation({
    mutationFn: (id: number) => systemApi.user.validUser(id),
    onSuccess: () => invalidate(),
  });
}

/** 禁用用户：走 POST /user/v1/invalid/{id} */
export function useInvalidUser() {
  const invalidate = useInvalidateSystemDomain();
  return useMutation({
    mutationFn: (id: number) => systemApi.user.invalidUser(id),
    onSuccess: () => invalidate(),
  });
}

/**
 * 新建用户：走 POST /user/v1/createUser → 新建用户 id。
 * 载荷只含 checklist 约定字段（username/password/cnName/email/phone/
 * departmentId/positionId/departmentName），不传 status/enabled/admin/roles/memo。
 * 用户名重复时后端无应用层检查：DB 唯一约束触发 → HTTP 500 + Result 10112，
 * 调用方（user-form-dialog）用提交前预检 + 把 10112 挂到用户名字段下处理。
 */
export function useCreateUser() {
  const invalidate = useInvalidateSystemDomain();
  return useMutation({
    mutationFn: (data: UserCreatePayload) => systemApi.user.createUser(data),
    onSuccess: () => invalidate(),
  });
}

/**
 * 更新用户：走 POST /user/v1/updateUser。
 * password 留空=不修改（载荷中省略，后端 updater 忽略 null 字段）。
 */
export function useUpdateUser() {
  const invalidate = useInvalidateSystemDomain();
  return useMutation({
    mutationFn: (data: UserUpdatePayload) => systemApi.user.updateUser(data),
    onSuccess: () => invalidate(),
  });
}

/** 用户详情：走 GET /user/v1/findById/{id}（编辑弹窗回填用） */
export function useUserDetail(id: number | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.system.detail(id ?? 0),
    queryFn: () => systemApi.user.findById(id as number),
    enabled: enabled && id != null,
  });
}
/**
 * 删除用户：走 POST /user/v1/delete/{id}。
 * 后端并非物理删除：deleteUser 直接调 deactivateUser（UserServiceImpl.java:105-107），
 * 与 invalidUser 同路径（逻辑停用 validStatus=INVALID，见 :109-126），故删除后
 * 用户不再出现在列表（findByPage 只查 VALID），且当前无恢复入口。
 */
export function useDeleteUser() {
  const invalidate = useInvalidateSystemDomain();
  return useMutation({
    mutationFn: (id: number) => systemApi.user.deleteUser(id),
    onSuccess: () => invalidate(),
  });
}
