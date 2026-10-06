import { requestAccessRefresh } from '../../access/service';
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { systemApi } from "../../api/system";
import type { AssignRolePermissionsPayload } from "../../api/system-types";
import { isPermissionId } from "../../role-permissions";
import { queryKeys } from "../keys";

export function permissionTreeOptions(enabled: boolean) {
  return {
    queryKey: queryKeys.system.list({ kind: "permissionTree" }),
    queryFn: () => systemApi.permission.tree(),
    enabled,
  };
}
export function rolePermissionsOptions(roleId: number | null, enabled: boolean) {
  return {
    queryKey: queryKeys.system.list({ kind: "rolePermissions", roleId: roleId ?? 0 }),
    queryFn: () => systemApi.role.getRolePermissions(roleId as number),
    enabled: enabled && isPermissionId(roleId),
  };
}
export function usePermissionTree(enabled: boolean) {
  return useQuery(permissionTreeOptions(enabled));
}
export function useRolePermissions(roleId: number | null, enabled: boolean) {
  return useQuery(rolePermissionsOptions(roleId, enabled));
}
export function useAssignRolePermissions() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: AssignRolePermissionsPayload) =>
      systemApi.role.assignPermissions(payload),
    onSuccess: () => {
      requestAccessRefresh('authorization-change');
      void client.invalidateQueries({ queryKey: queryKeys.system.all });
    },
  });
}
