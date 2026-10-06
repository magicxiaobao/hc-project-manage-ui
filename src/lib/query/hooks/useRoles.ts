import { requestAccessRefresh } from '../../access/service';
import { hasSystemAdmin, useAuthStore } from '../../api/auth-store';
/**
 * 系统管理域·角色 react-query hooks（P5 p5-role-list 垂直切片）。
 *
 * 约定（沿用 useUsers / useUserRoles）：
 * - queryKey 一律走 queryKeys.system.*，不手写数组；
 * - 请求参数在 hook 内归一化，保证同一语义的查询 key 形状一致；
 * - 状态变更（新建/更新/启用/禁用）成功后失效 system 域全部缓存，列表自动刷新；
 * - 角色分页 key 用 { kind: 'roleList', ... } 命名空间：useUsers 的
 *   useUserList 归一化后也是 { page, pageSize, bean }，不加 kind 会和用户
 *   分页撞 key（30s 有效期内先看 /sys/users 再进 /sys/roles 会读到用户行）。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { systemApi } from '../../api/system';
import type {
  RoleCreatePayload,
  RoleQuery,
  RoleResponse,
  RoleUpdatePayload,
} from '../../api/system-types';
import { queryKeys } from '../keys';

export interface RoleListParams {
  page?: number;
  pageSize?: number;
  roleName?: string;
  roleCode?: string;
}

/**
 * 搜索表单 → 后端 RoleQuery 映射。
 *
 * - roleName/roleCode：非空才填入 bean；为空不传，避免把全表过滤掉；
 * - 注意：2026-10-05 实读后端确认 RoleServiceImpl.findByPage 完全不读
 *   bean（服务端空操作），故列表页不走本映射+服务端分页，改走
 *   useRoleListAll 拉全量 + filterRolesLocal 本地过滤；本函数保留供
 *   "服务端分页 hook"（useRoleList）等其它场景使用，载荷契约不变。
 */
export function buildRoleQuery(roleName = '', roleCode = ''): RoleQuery {
  const bean: RoleQuery = {};
  const name = roleName.trim();
  const code = roleCode.trim();
  if (name) bean.roleName = name;
  if (code) bean.roleCode = code;
  return bean;
}

export function normalizeRoleListParams(params: RoleListParams = {}) {
  return {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 20,
    bean: buildRoleQuery(params.roleName ?? '', params.roleCode ?? ''),
  };
}

/** 角色列表（分页）：走 POST /role/v1/findByPage，载荷 { page, pageSize, bean } */
export function useRoleList(params: RoleListParams = {}) {
  const normalized = normalizeRoleListParams(params);
  const allowed = useAuthStore((state) => state.isAuthenticated && hasSystemAdmin(state.user?.authorities));
  return useQuery({
    enabled: allowed,
    queryKey: queryKeys.system.list({ kind: 'roleList', ...normalized }),
    queryFn: () => systemApi.role.findByPage(normalized),
  });
}

/**
 * 角色全量列表（循环分页，供本地筛选+本地分页使用）：走 POST /role/v1/findByPage。
 *
 * 2026-10-05 实读后端 RoleServiceImpl.findByPage（:93-99）确认：后端建空
 * LambdaQueryWrapper 直接 selectPage，完全不读 bean——roleName/roleCode
 * 是服务端空操作，前端传 bean 只是"非空透传"的假象。因此"仅过滤当前页"
 * 不能代替服务端筛选（翻页后筛选结果不完整）：必须循环拉取所有页直到某页
 * 返回不足一页（沿用 board 轨道 run148-r4-P2-7 的 useBoardListAll 先例），
 * 再在本地按 roleName/roleCode 全量过滤（见 filterRolesLocal）。
 *
 * key 用 list({ kind: 'roleListAll', ... }) 与分页查询区分；失效走
 * queryKeys.system.all 全域（新建/更新/启用/禁用后自动刷新）。
 */
const ROLE_LIST_ALL_PAGE_SIZE = 100;

export function useRoleListAll() {
  const allowed = useAuthStore((state) => state.isAuthenticated && hasSystemAdmin(state.user?.authorities));
  return useQuery({
    enabled: allowed,
    queryKey: queryKeys.system.list({
      kind: 'roleListAll',
      pageSize: ROLE_LIST_ALL_PAGE_SIZE,
      bean: {},
    }),
    queryFn: async () => {
      const all: RoleResponse[] = [];
      let page = 1;
      let actualSize: number | null = null;
      for (;;) {
        const pageResult = await systemApi.role.findByPage({
          page,
          pageSize: ROLE_LIST_ALL_PAGE_SIZE,
          bean: {},
        });
        if (
          !Number.isSafeInteger(pageResult.pageSize) ||
          pageResult.pageSize <= 0 ||
          !Array.isArray(pageResult.list) ||
          pageResult.list.length > pageResult.pageSize
        )
          throw new Error('角色分页响应异常，请重新加载');
        if (actualSize !== null && actualSize !== pageResult.pageSize)
          throw new Error('角色分页大小发生变化，请重新加载');
        actualSize = pageResult.pageSize;
        all.push(...pageResult.list);
        if (pageResult.list.length < actualSize) break;
        page += 1;
      }
      return all;
    },
  });
}

/**
 * 本地全量过滤：按 roleName/roleCode 子串匹配（不区分大小写）。
 *
 * 口径说明（沿用 useRoleListAll 注释的后端实读结论）：
 * - 后端 findByPage 不读 bean，故真正的筛选语义只能在前端做；必须在全量
 *   数据上过滤，仅过滤当前页不能代替服务端筛选；
 * - MySQL LIKE 在 utf8mb4_unicode_ci 下不区分大小写，前端用不区分大小写
 *   的子串匹配近似该语义；
 * - 唯一性预检（isRoleCodeTaken）是另一套口径（精确匹配），不受本函数影响。
 */
export function filterRolesLocal(
  roles: RoleResponse[],
  roleName = '',
  roleCode = '',
): RoleResponse[] {
  const name = roleName.trim().toLowerCase();
  const code = roleCode.trim().toLowerCase();
  return roles.filter((role) => {
    if (name && !(role.roleName ?? '').toLowerCase().includes(name)) return false;
    if (code && !(role.roleCode ?? '').toLowerCase().includes(code)) return false;
    return true;
  });
}

function useInvalidateSystemDomain() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.system.all });
  };
}

/**
 * 角色详情：走 GET /role/v1/findById/{id}（编辑弹窗回填用）。
 *
 * key 命名空间：用 list({ kind: 'roleDetail', roleId }) 而不是 detail(id)——
 * 后者与用户详情共享 ['hc','system','detail',id]，用户 id 与角色 id 可能撞号，
 * 会把用户数据喂给角色表单（沿用 useUserRoles 的 userRoles 命名空间先例）。
 */
export function useRoleDetail(id: number | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.system.list({ kind: 'roleDetail', roleId: id ?? 0 }),
    queryFn: () => systemApi.role.findById(id as number),
    enabled: enabled && id != null,
  });
}

/** 新建角色：走 POST /role/v1/createRole → 新建角色 id */
export function useCreateRole() {
  const invalidate = useInvalidateSystemDomain();
  return useMutation({
    mutationFn: (data: RoleCreatePayload) => systemApi.role.createRole(data),
    onSuccess: () => invalidate(),
  });
}

/** 更新角色：走 POST /role/v1/updateRole */
export function useUpdateRole() {
  const invalidate = useInvalidateSystemDomain();
  return useMutation({
    mutationFn: (data: RoleUpdatePayload) => systemApi.role.updateRole(data),
    onSuccess: () => {
      invalidate();
      requestAccessRefresh('authorization-change');
    },
  });
}

/** 启用角色：走 POST /role/v1/valid/{id} */
export function useValidRole() {
  const invalidate = useInvalidateSystemDomain();
  return useMutation({
    mutationFn: (id: number) => systemApi.role.validRole(id),
    onSuccess: () => {
      invalidate();
      requestAccessRefresh('authorization-change');
    },
  });
}

/** 禁用角色：走 POST /role/v1/invalid/{id} */
export function useInvalidRole() {
  const invalidate = useInvalidateSystemDomain();
  return useMutation({
    mutationFn: (id: number) => systemApi.role.invalidRole(id),
    onSuccess: () => {
      invalidate();
      requestAccessRefresh('authorization-change');
    },
  });
}
