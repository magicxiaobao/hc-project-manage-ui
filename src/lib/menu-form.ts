import type { MenuCreatePayload, MenuResponse, MenuUpdatePayload } from "./api/system-types";
import { isMenuId } from "./menu-tree";

export const MENU_TYPES = [
  { id: "1", label: "目录" },
  { id: "2", label: "菜单" },
  { id: "3", label: "按钮" },
];
export const MENU_OPEN_TYPES = [
  { id: "1", label: "组件" },
  { id: "2", label: "内链" },
  { id: "3", label: "外链" },
];
export const menuEnumLabel = (value: number | null, options: typeof MENU_TYPES) =>
  options.find((option) => option.id === String(value))?.label ??
  (value === null ? "未设置" : `未知 (${value})`);
export const parseMenuSelection = (value: string): number | null =>
  value === "" ? null : Number(value);
export interface MenuFormInput {
  name: string;
  type: number | null;
  parentId: number | null;
  path: string;
  icon: string;
  openType: number | null;
  uri: string;
  permission: string;
}
export const emptyMenuFormInput = (): MenuFormInput => ({
  name: "",
  type: 2,
  parentId: 0,
  path: "",
  icon: "",
  openType: 1,
  uri: "",
  permission: "",
});
export function menuFormInputFromResponse(row: MenuResponse): MenuFormInput {
  return {
    name: row.name ?? "",
    type: row.type,
    parentId: row.parentId ?? 0,
    path: row.path ?? "",
    icon: row.icon ?? "",
    openType: row.openType,
    uri: row.uri ?? "",
    permission: row.permission ?? "",
  };
}
export const menuFormSnapshot = (form: MenuFormInput) =>
  JSON.stringify([
    form.name,
    form.type,
    form.parentId,
    form.path,
    form.icon,
    form.openType,
    form.uri,
    form.permission,
  ]);
export interface MenuFormFieldError {
  field: keyof MenuFormInput;
  message: string;
}
export function validateMenuFormInput(
  form: MenuFormInput,
  parents: { ready: boolean; ids: ReadonlySet<number> },
  editing?: { menuId: number | null; childCount: number },
): MenuFormFieldError[] {
  const errors: MenuFormFieldError[] = [];
  if (!form.name.trim()) errors.push({ field: "name", message: "请输入菜单名称" });
  if (![1, 2, 3].includes(form.type as number))
    errors.push({ field: "type", message: "请选择支持的菜单类型" });
  if (editing && editing.menuId !== null && form.type === 3 && editing.childCount > 0)
    errors.push({ field: "type", message: "该节点下还有子菜单，请先迁移子菜单再改为按钮类型" });
  if (form.openType !== null && ![1, 2, 3].includes(form.openType))
    errors.push({ field: "openType", message: "请选择支持的打开方式" });
  if (!parents.ready)
    errors.push({ field: "parentId", message: "完整菜单结构尚未加载成功，请刷新后再保存" });
  else if (
    (form.parentId !== 0 && !isMenuId(form.parentId)) ||
    !parents.ids.has(form.parentId as number)
  )
    errors.push({ field: "parentId", message: "父级不可选或关系异常，请重新选择合法父级" });
  return errors;
}
export function buildMenuCreatePayload(form: MenuFormInput): MenuCreatePayload {
  return {
    name: form.name.trim(),
    type: form.type,
    parentId: form.parentId,
    path: form.path.trim(),
    icon: form.icon.trim(),
    ...(form.openType === null ? {} : { openType: form.openType }),
    uri: form.uri.trim(),
    permission: form.permission.trim(),
  };
}
export const buildMenuUpdatePayload = (id: number, form: MenuFormInput): MenuUpdatePayload => ({
  id,
  ...buildMenuCreatePayload(form),
});
export function rebaseMenuFormOnVersionConflict(
  baseline: MenuFormInput | null,
  current: MenuFormInput,
  server: MenuFormInput,
): MenuFormInput {
  return Object.fromEntries(
    (Object.keys(server) as (keyof MenuFormInput)[]).map((key) => [
      key,
      current[key] !== (baseline ?? server)[key] ? current[key] : server[key],
    ]),
  ) as unknown as MenuFormInput;
}
