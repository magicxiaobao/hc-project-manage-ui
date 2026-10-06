import { requestAccessRefresh } from '../../access/service';
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { systemApi } from "../../api/system";
import type { MenuCreatePayload, MenuUpdatePayload } from "../../api/system-types";
import { hasSystemAdmin, useAuthStore } from "../../api/auth-store";
import { isMenuId, MENU_PAGE_SIZE, readAllMenuPages } from "../../menu-tree";
import { queryKeys } from "../keys";

function useMenuAccess() {
  return useAuthStore((state) => state.isAuthenticated && hasSystemAdmin(state.user?.authorities));
}
export const menuTreeOptions = (enabled: boolean) => ({
  queryKey: queryKeys.system.list({ kind: "menuTree" }),
  queryFn: systemApi.menu.getMenuTree,
  enabled,
});
export const menuListAllOptions = (enabled: boolean) => ({
  queryKey: queryKeys.system.list({ kind: "menuListAll", pageSize: MENU_PAGE_SIZE, bean: {} }),
  queryFn: () => readAllMenuPages(systemApi.menu.findByPage),
  enabled,
});
export const menuDetailOptions = (menuId: number | null, enabled: boolean) => ({
  queryKey: queryKeys.system.list({ kind: "menuDetail", menuId }),
  queryFn: async () => {
    const data = await systemApi.menu.findById(menuId as number);
    if (!isMenuId(data.id) || data.id !== menuId) throw new Error("菜单详情 ID 不匹配，请重试");
    return data;
  },
  enabled: enabled && isMenuId(menuId),
});
export const menuTreeByUserOptions = (userId: number | null, enabled: boolean) => ({
  queryKey: queryKeys.system.list({ kind: "menuTreeByUser", userId }),
  queryFn: () => systemApi.menu.getMenuTreeByUser(userId as number),
  enabled: enabled && isMenuId(userId),
});
export const useMenuTree = (enabled = true) =>
  useQuery(menuTreeOptions(useMenuAccess() && enabled));
export const useMenuListAll = (enabled = true) =>
  useQuery(menuListAllOptions(useMenuAccess() && enabled));
export const useMenuDetail = (id: number | null, enabled: boolean) =>
  useQuery(menuDetailOptions(id, useMenuAccess() && enabled));
export const useMenuTreeByUser = (id: number | null) =>
  useQuery(menuTreeByUserOptions(id, useMenuAccess()));
function useMenuMutation<T, R>(operation: (data: T) => Promise<R>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: T) => {
      const state = useAuthStore.getState();
      if (!state.isAuthenticated || !hasSystemAdmin(state.user?.authorities))
        throw new Error("需要系统管理员权限");
      return operation(data);
    },
    onSuccess: () => {
      requestAccessRefresh('authorization-change');
      void client.invalidateQueries({ queryKey: queryKeys.system.all });
    },
  });
}
export const useCreateMenu = () =>
  useMenuMutation(async (data: MenuCreatePayload) => {
    const id = await systemApi.menu.createMenu(data);
    if (!isMenuId(id)) throw new Error("菜单创建未成功：返回 ID 无效，请检查后重试");
    return id;
  });
export const useUpdateMenu = () =>
  useMenuMutation((data: MenuUpdatePayload) => systemApi.menu.updateMenu(data));
export const useValidMenu = () => useMenuMutation(systemApi.menu.validMenu);
export const useInvalidMenu = () => useMenuMutation(systemApi.menu.invalidMenu);
