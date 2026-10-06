import type { AuthenticatedUser } from "../api/types";
import { isCanonicalUserId } from "../api/auth";
import type { MenuResponse } from "../api/system-types";
import { buildMenuTree, type MenuTreeNode } from "../menu-tree";
import {
  bindMapping,
  constraintsMatch,
  mapMenuPath,
  matchPage,
  routeManifest,
  type PageMapping,
  type PageMatch,
} from "./route-manifest";

export type AccessStatus = "idle" | "loading" | "ready" | "error";
export interface Diagnostic {
  menuId: number;
  path: string | null;
  reason: string;
}
export interface ButtonDefinition {
  readonly code: string;
  readonly name: string | null;
  readonly menuIds: readonly number[];
  readonly parentMenuIds: readonly (number | null)[];
}
export interface AccessEntry {
  readonly mapping: PageMapping;
  readonly chain: readonly MenuTreeNode[];
  readonly granted: boolean;
}
export interface NavigationNode {
  readonly menu: MenuTreeNode;
  readonly mapping: PageMapping | null;
  readonly externalUrl: string | null;
  readonly children: readonly NavigationNode[];
}
export interface AccessSnapshot {
  readonly userId: string | null;
  readonly sessionGeneration: number;
  readonly revision: number;
  readonly status: AccessStatus;
  readonly fetchedAt: number;
  readonly authorities: ReadonlySet<string>;
  readonly menuTree: readonly MenuTreeNode[];
  readonly routeAccessIndex: readonly AccessEntry[];
  readonly visibleNavigation: readonly NavigationNode[];
  readonly definitions: readonly ButtonDefinition[];
  readonly grantedCodes: ReadonlySet<string>;
  readonly diagnostics: readonly Diagnostic[];
  readonly error: Error | null;
  readonly fingerprint: string;
}
/** Freeze the public collection facade as well as its contents; Object.freeze(Set) is insufficient. */
export function readonlySet<T>(items: Iterable<T>): ReadonlySet<T> {
  const set = new Set(items);
  const facade: ReadonlySet<T> = Object.freeze({
    size: set.size,
    has: set.has.bind(set),
    entries: set.entries.bind(set),
    keys: set.keys.bind(set),
    values: set.values.bind(set),
    [Symbol.iterator]: set[Symbol.iterator].bind(set),
    forEach: (callback: (value: T, key: T, owner: ReadonlySet<T>) => void, thisArg?: unknown) => {
      for (const value of set) callback.call(thisArg, value, value, facade);
    },
  });
  return facade;
}
export function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
export function validateUser(value: unknown): AuthenticatedUser {
  const user = value as AuthenticatedUser;
  if (
    !user ||
    !isCanonicalUserId(user.userId) ||
    typeof user.userName !== "string" ||
    (user.cnName !== null && typeof user.cnName !== "string") ||
    !Array.isArray(user.authorities) ||
    !user.authorities.every((s) => typeof s === "string") ||
    !Array.isArray(user.roles) ||
    !user.roles.every((s) => typeof s === "string")
  )
    throw new Error("用户权限响应无效");
  return user;
}
function validateMenus(value: unknown): MenuResponse[] {
  if (!Array.isArray(value)) throw new Error("菜单响应必须为完整扁平列表");
  for (const row of value) {
    if (
      !row ||
      typeof row !== "object" ||
      !Number.isSafeInteger(row.id) ||
      row.id <= 0 ||
      !(row.parentId === null || (Number.isSafeInteger(row.parentId) && row.parentId >= 0)) ||
      ["name", "icon", "path", "uri", "permission"].some(
        (k) => row[k] !== null && typeof row[k] !== "string",
      ) ||
      ["type", "openType", "sort"].some((k) => row[k] !== null && !Number.isSafeInteger(row[k])) ||
      (row.hidden !== null && typeof row.hidden !== "boolean") ||
      "children" in row
    )
      throw new Error("菜单节点响应无效");
  }
  return value as MenuResponse[];
}
export function deriveSnapshot(userValue: unknown, menuValue: unknown) {
  const user = validateUser(userValue);
  const records = validateMenus(menuValue);
  const { roots, anomalies } = buildMenuTree(records, []);
  if (anomalies.length) throw new Error("菜单树含孤儿节点或环");
  const authorities = readonlySet(user.authorities);
  const diagnostics: Diagnostic[] = [],
    routeAccessIndex: AccessEntry[] = [];
  const buttons = new Map<
    string,
    { code: string; name: string | null; menuIds: number[]; parentMenuIds: (number | null)[] }
  >();
  const walk = (
    nodes: MenuTreeNode[],
    ancestors: MenuTreeNode[],
    ancestorsGranted: boolean,
    ancestorsVisible: boolean,
  ): NavigationNode[] => {
    const navigation: NavigationNode[] = [];
    for (const node of nodes) {
      const chain = [...ancestors, node];
      const diagnose = (reason: string) =>
        diagnostics.push({ menuId: node.id, path: node.path, reason });
      const knownType = [1, 2, 3].includes(node.type ?? 0);
      if (!knownType) diagnose("未知菜单类型");
      const permission = node.permission;
      if (node.type === 3) {
        if (permission && permission.trim()) {
          const definition = buttons.get(permission) ?? {
            code: permission,
            name: node.name,
            menuIds: [],
            parentMenuIds: [],
          };
          definition.menuIds.push(node.id);
          definition.parentMenuIds.push(node.parentId);
          buttons.set(permission, definition);
        } else diagnose("按钮权限编码为空");
        // Buttons cannot serve as navigation ancestors or routes.
        walk(node.children, chain, false, false);
        continue;
      }
      const knownOpen = [1, 2, 3].includes(node.openType ?? 0);
      if (!knownOpen) diagnose("未知打开方式");
      const mapping =
        knownType && knownOpen && node.openType !== 3 && node.path ? mapMenuPath(node.path) : null;
      if (node.path && node.openType !== 3 && !mapping) diagnose("未实现或非法路由地址");
      if (mapping?.page.available === false) diagnose("页面尚未接入真实业务");
      const ownGranted =
        !!permission && permission.trim() !== ""
          ? authorities.has(permission)
          : node.type === 1 || mapping?.page.policy === "authenticated";
      if (
        node.type === 2 &&
        (!permission || !permission.trim()) &&
        mapping?.page.policy !== "authenticated"
      )
        diagnose("菜单缺少权限编码");
      const granted = ancestorsGranted && knownType && ownGranted;
      if (mapping && mapping.page.available !== false)
        routeAccessIndex.push({ mapping, chain, granted });
      let externalUrl: string | null = null;
      if (node.openType === 3) {
        try {
          const url = new URL(node.path ?? "");
          if (url.protocol === "https:" && !url.username && !url.password) externalUrl = url.href;
        } catch {
          /* diagnostic below */
        }
        if (!externalUrl) diagnose("外链必须为合法 HTTPS 地址");
      }
      const visible = ancestorsVisible && node.hidden !== true;
      const children = walk(node.children, chain, granted, visible);
      if (
        visible &&
        granted &&
        ((mapping && mapping.page.available !== false) || externalUrl || children.length)
      )
        navigation.push({
          menu: node,
          mapping: mapping?.page.available === false ? null : mapping,
          externalUrl,
          children,
        });
    }
    return navigation;
  };
  const visibleNavigation = walk(roots, [], true, true);
  const definitions = [...buttons.values()];
  const grantedCodes = readonlySet(
    definitions.filter((d) => authorities.has(d.code)).map((d) => d.code),
  );
  // Transport timestamps/memo/keepAlive do not change access facts or navigation.
  const fingerprint = JSON.stringify({
    userId: user.userId,
    authorities: [...authorities].sort(),
    menus: [...records]
      .sort((a, b) => a.id - b.id)
      .map(({ id, parentId, name, icon, type, path, openType, permission, sort, hidden }) => ({
        id,
        parentId,
        name,
        icon,
        type,
        path,
        openType,
        permission,
        sort,
        hidden,
      })),
    mappings: routeAccessIndex.map(({ mapping, granted }) => ({
      route: mapping.page.route,
      policy: mapping.page.policy,
      constraints: mapping.constraints,
      granted,
    })),
  });
  return freeze({
    authorities,
    menuTree: roots,
    routeAccessIndex,
    visibleNavigation,
    definitions,
    grantedCodes,
    diagnostics,
    fingerprint,
  });
}
export function accessCandidates(
  snapshot: AccessSnapshot,
  target: PageMatch,
): readonly AccessEntry[] {
  const direct = snapshot.routeAccessIndex.filter(
    (entry) =>
      entry.mapping.page.route === target.page.route &&
      constraintsMatch(entry.mapping, target.params),
  );
  if (direct.length || !target.page.inherits) return direct;
  return snapshot.routeAccessIndex.filter(
    (entry) =>
      entry.mapping.page.route === target.page.inherits &&
      constraintsMatch(entry.mapping, target.params),
  );
}
export function canAccess(snapshot: AccessSnapshot, path: string): boolean {
  const target = matchPage(path);
  if (!target || snapshot.status !== "ready" || !snapshot.userId || target.page.available === false)
    return false;
  if (target.page.policy === "authenticated") return true;
  // policy "demo"（/projects、/projects/new）：未登录已在 guard 放行；
  // 登录态按菜单授权口径处理（与改 policy 前一致）。
  if (target.page.route.startsWith("/sys/") && snapshot.authorities.has("system:admin"))
    return true;
  return accessCandidates(snapshot, target).some((entry) => entry.granted);
}
export function landingPath(snapshot: AccessSnapshot): string | null {
  if (snapshot.status !== "ready") return null;
  const walk = (nodes: readonly NavigationNode[]): string | null => {
    for (const node of nodes) {
      const path = node.mapping && bindMapping(node.mapping);
      if (path && canAccess(snapshot, path)) return path;
      const child = walk(node.children);
      if (child) return child;
    }
    return null;
  };
  const path = walk(snapshot.visibleNavigation);
  if (path) return path;
  if (snapshot.authorities.has("system:admin")) {
    for (const page of routeManifest) {
      if (!page.route.startsWith("/sys/")) continue;
      const fallback = bindMapping({ page, constraints: {} });
      if (fallback && canAccess(snapshot, fallback)) return fallback;
    }
  } else {
    const pages = routeManifest.filter((page) => page.policy === "authenticated");
    // Prefer the workbench; keep manifest order for the remaining pages.
    pages.sort((a, b) => Number(b.route === "/workbench") - Number(a.route === "/workbench"));
    for (const page of pages) {
      const fallback = bindMapping({ page, constraints: {} });
      if (fallback && canAccess(snapshot, fallback)) return fallback;
    }
  }
  return null;
}
