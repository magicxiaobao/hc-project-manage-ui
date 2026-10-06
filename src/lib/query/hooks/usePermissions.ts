import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { systemApi } from "../../api/system";
import type { PermissionCreatePayload, PermissionUpdatePayload } from "../../api/system-types";
import { hasSystemAdmin, useAuthStore } from "../../api/auth-store";
import { requestAccessRefresh } from "../../access/service";
import { PERMISSION_PAGE_SIZE, readAllPermissionPages } from "../../permission-form";
import { isPermissionId } from "../../role-permissions";
import { queryKeys } from "../keys";

export const fetchPermissionListAll = () => readAllPermissionPages(systemApi.permission.findByPage);
export function permissionListAllOptions(enabled: boolean) {
  return {
    queryKey: queryKeys.system.list({
      kind: "permissionListAll",
      pageSize: PERMISSION_PAGE_SIZE,
      bean: {},
    }),
    queryFn: fetchPermissionListAll,
    enabled,
  };
}
export function permissionDetailOptions(permissionId: number | null, enabled: boolean) {
  return {
    queryKey: queryKeys.system.list({ kind: "permissionDetail", permissionId }),
    queryFn: async () => {
      const data = await systemApi.permission.findById(permissionId as number);
      if (!isPermissionId(data.id) || data.id !== permissionId)
        throw new Error("权限详情 ID 不匹配，请重试");
      return data;
    },
    enabled: enabled && isPermissionId(permissionId),
  };
}
function usePermissionAccess() {
  return useAuthStore((state) => state.isAuthenticated && hasSystemAdmin(state.user?.authorities));
}
export function usePermissionListAll(enabled = true) {
  return useQuery(permissionListAllOptions(usePermissionAccess() && enabled));
}
export function usePermissionDetail(id: number | null, enabled: boolean) {
  return useQuery(permissionDetailOptions(id, usePermissionAccess() && enabled));
}
function useInvalidateSystemDomain() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: queryKeys.system.all });
  };
}
export function useCreatePermission() {
  const invalidate = useInvalidateSystemDomain();
  return useMutation({
    mutationFn: (data: PermissionCreatePayload) => systemApi.permission.createPermission(data),
    onSuccess: invalidate,
  });
}
export function useUpdatePermission() {
  const invalidate = useInvalidateSystemDomain();
  return useMutation({
    mutationFn: (data: PermissionUpdatePayload) => systemApi.permission.updatePermission(data),
    onSuccess: () => {
      invalidate();
      requestAccessRefresh('authorization-change');
    },
  });
}
export function useValidPermission() {
  const invalidate = useInvalidateSystemDomain();
  return useMutation({
    mutationFn: (id: number) => systemApi.permission.validPermission(id),
    onSuccess: () => {
      invalidate();
      requestAccessRefresh('authorization-change');
    },
  });
}
export function useInvalidPermission() {
  const invalidate = useInvalidateSystemDomain();
  return useMutation({
    mutationFn: (id: number) => systemApi.permission.invalidPermission(id),
    onSuccess: () => {
      invalidate();
      requestAccessRefresh('authorization-change');
    },
  });
}
export function useDeletePermission() {
  const invalidate = useInvalidateSystemDomain();
  return useMutation({
    mutationFn: (id: number) => systemApi.permission.deletePermission(id),
    onSuccess: () => {
      invalidate();
      requestAccessRefresh('authorization-change');
    },
  });
}
