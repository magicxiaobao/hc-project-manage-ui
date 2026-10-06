import { requestAccessRefresh } from '../../access/service';
/**
 * 系统管理域·用户分配角色 react-query hooks（P5 p5-user-roles 垂直切片）。
 *
 * 约定（沿用 useUsers）：
 * - queryKey 一律走 queryKeys.system.*，不手写数组；
 * - 成功变更后失效 system 域全部缓存（user-roles 列表、候选列表、用户详情同步刷新）。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { systemApi } from '../../api/system';
import type { AssignUserRolesPayload } from '../../api/system-types';
import { queryKeys } from '../keys';

/**
 * 用户已分配角色：GET /user/v1/roles/{userId}。
 * 返回该用户当前全部已分配角色（含已禁用的），弹窗回显用。
 */
export function useUserRoles(userId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.system.list({ kind: 'userRoles', userId: userId ?? 0 }),
    queryFn: () => systemApi.user.getUserRoles(userId as number),
    enabled: enabled && userId != null,
  });
}

/**
 * 角色多选候选：GET /role/v1/list?keyword=。
 * keyword 对 roleName/roleCode LIKE；OR 未分组，调用方须再次过滤 enabled=true。
 * keyword 为空时不传（发空串 keyword 后端会按 LIKE 兜底，仍返回全部启用角色，
 * 但归一化 key 保持同一语义）。
 */
export function useRoleOptions(keyword = '', enabled = true) {
  const normalized = keyword.trim();
  return useQuery({
    queryKey: queryKeys.system.list({ kind: 'roleOptions', keyword: normalized }),
    queryFn: () => systemApi.role.list(normalized || undefined),
    enabled,
  });
}

/**
 * 分配角色：POST /user/v1/assignRoles { userId, roleIds }（全量替换）。
 * 成功后失效 system 域全部缓存。
 */
export function useAssignUserRoles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AssignUserRolesPayload) => systemApi.user.assignRoles(data),
    onSuccess: () => {
      requestAccessRefresh('authorization-change');
      void queryClient.invalidateQueries({ queryKey: queryKeys.system.all });
    },
  });
}
