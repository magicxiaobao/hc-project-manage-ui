import type { PermissionResponse } from "./api/system-types";

export type CheckState = "unchecked" | "checked" | "mixed";
export interface PermissionGroup {
  key: string;
  name: string;
  children: PermissionResponse[];
}
export interface PermissionSnapshot {
  groups: PermissionGroup[];
  visible: number[];
  baseline: number[];
  hidden: number[];
  selected: number[];
}

export function isPermissionId(id: unknown): id is number {
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0;
}
export function parseRoleId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return isPermissionId(id) ? id : null;
}
export function normalizePermissionIds(ids: readonly number[]): number[] {
  if (!Array.isArray(ids) || ids.some((id) => !isPermissionId(id))) {
    throw new Error("权限 ID 数据异常：必须为正的安全整数");
  }
  return [...new Set(ids)].sort((a, b) => a - b);
}
export function samePermissionIds(a: readonly number[], b: readonly number[]): boolean {
  const left = normalizePermissionIds(a);
  const right = normalizePermissionIds(b);
  return left.length === right.length && left.every((id, i) => id === right[i]);
}

/** 编辑期间失效的新选择不提交；已有分配的保留语义仍由快照负责。 */
export function filterMissingNewPermissionIds(
  selected: readonly number[],
  baseline: readonly number[],
  latestVisible: readonly number[],
): number[] {
  return selected.filter((id) => baseline.includes(id) || latestVisible.includes(id));
}

/** 分组只有展示 key，不持有权限 ID；MENU 同样是独立叶节点。 */
export function groupPermissions(permissions: readonly PermissionResponse[]): PermissionGroup[] {
  if (!Array.isArray(permissions)) throw new Error("权限列表数据异常");
  // 即使非法记录被禁用，也不能静默忽略服务端 ID 异常。
  normalizePermissionIds(permissions.map((permission) => permission.id));
  const groups = new Map<string, PermissionGroup>();
  const seen = new Set<number>();
  for (const permission of permissions) {
    if (permission.enabled !== true || seen.has(permission.id)) continue;
    seen.add(permission.id);
    const name = permission.groupName?.trim() ?? "";
    const key = name ? `group:name:${encodeURIComponent(name)}` : "group:ungrouped";
    if (!groups.has(key)) groups.set(key, { key, name: name || "未分组", children: [] });
    groups.get(key)!.children.push(permission);
  }
  return [...groups.values()];
}
export function groupCheckState(group: PermissionGroup, selected: readonly number[]): CheckState {
  const ids = new Set(selected);
  const count = group.children.filter((permission) => ids.has(permission.id)).length;
  return count === 0 ? "unchecked" : count === group.children.length ? "checked" : "mixed";
}
export function togglePermission(selected: readonly number[], id: number): number[] {
  normalizePermissionIds([id]);
  return selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
}
export function togglePermissionGroup(
  selected: readonly number[],
  group: PermissionGroup,
): number[] {
  const ids = group.children.map((permission) => permission.id);
  return groupCheckState(group, selected) === "checked"
    ? selected.filter((id) => !ids.includes(id))
    : normalizePermissionIds([...selected, ...ids]);
}
export function createPermissionSnapshot(
  groups: PermissionGroup[],
  assigned: readonly number[],
): PermissionSnapshot {
  const baseline = normalizePermissionIds(assigned);
  const visible = normalizePermissionIds(
    groups.flatMap((group) => group.children.map((permission) => permission.id)),
  );
  return {
    groups,
    visible,
    baseline,
    selected: baseline.filter((id) => visible.includes(id)),
    hidden: baseline.filter((id) => !visible.includes(id)),
  };
}
export function permissionSnapshotDirty(snapshot: PermissionSnapshot | null): boolean {
  return (
    snapshot !== null &&
    !samePermissionIds(
      snapshot.selected,
      snapshot.baseline.filter((id) => snapshot.visible.includes(id)),
    )
  );
}
export function serializePermissionSelection(snapshot: PermissionSnapshot): number[] {
  if (snapshot.selected.some((id) => !snapshot.visible.includes(id)))
    throw new Error("选择包含不在编辑快照中的权限");
  return normalizePermissionIds([...snapshot.selected, ...snapshot.hidden]);
}
