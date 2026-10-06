import { describe, expect, it } from "vitest";
import type { MenuResponse } from "../../api/system-types";
import type { AuthenticatedUser } from "../../api/types";
import {
  accessCandidates,
  canAccess,
  deriveSnapshot,
  landingPath,
  validateUser,
  type NavigationNode,
} from "../snapshot";
import { matchPage } from "../route-manifest";

function menu(partial: Partial<MenuResponse> & { id: number }): MenuResponse {
  return {
    id: partial.id,
    parentId: partial.parentId ?? null,
    name: partial.name ?? `菜单${partial.id}`,
    type: partial.type ?? 2,
    icon: partial.icon ?? null,
    path: partial.path ?? null,
    openType: partial.openType ?? 1,
    uri: partial.uri ?? null,
    permission: partial.permission ?? null,
    sort: partial.sort ?? 0,
    keepAlive: null,
    hidden: partial.hidden ?? null,
    memo: null,
    createdAt: null,
    updatedAt: null,
  };
}

function user(authorities: string[]): AuthenticatedUser {
  return { userId: "7", userName: "u", cnName: null, extraInfo: {}, roles: [], authorities };
}

function ready(authorities: string[], menus: MenuResponse[], roles: string[] = []) {
  const derived = deriveSnapshot({ ...user(authorities), roles }, menus);
  return {
    ...derived,
    userId: "7",
    sessionGeneration: 1,
    revision: 1,
    status: "ready" as const,
    fetchedAt: 1,
    error: null,
  };
}

function navIds(snapshot: ReturnType<typeof ready>): number[] {
  const ids: number[] = [];
  const walk = (nodes: readonly NavigationNode[]) => {
    for (const node of nodes) {
      ids.push(node.menu.id);
      walk(node.children);
    }
  };
  walk(snapshot.visibleNavigation);
  return ids;
}

describe("validateUser", () => {
  it("拒绝非字符串数组的 authorities", () => {
    expect(() => validateUser({ ...user([]), authorities: ["a", 1] })).toThrow();
    expect(() => validateUser({ ...user([]), userId: "abc" })).toThrow();
  });
  it("roles=['admin'] 不能替代 authorities", () => {
    const snapshot = ready(
      [],
      [menu({ id: 1, type: 1, path: "/sys/users", permission: "system:admin" })],
      ["admin"],
    );
    expect(canAccess(snapshot, "/sys/users")).toBe(false);
  });
});

describe("deriveSnapshot 菜单语义", () => {
  const sysDir = menu({ id: 1, type: 1, path: "/sys", permission: null });
  const users = menu({
    id: 2,
    parentId: 1,
    type: 2,
    path: "/sys/users",
    permission: "sys:user:view",
  });
  const addBtn = menu({
    id: 3,
    parentId: 2,
    type: 3,
    path: "/sys/users/new",
    permission: "sys:user:add",
  });
  const dupBtn = menu({
    id: 4,
    parentId: 1,
    type: 3,
    permission: "sys:user:add",
    name: "新增用户2",
  });
  const emptyBtn = menu({ id: 5, parentId: 2, type: 3, permission: "  " });
  const unknownType = menu({ id: 6, parentId: 1, type: 9, path: "/sys/unknown" });

  it("type=3 不进路由索引；同编码去重并保留来源", () => {
    const snapshot = ready(
      ["sys:user:view", "sys:user:add"],
      [sysDir, users, addBtn, dupBtn, emptyBtn, unknownType],
    );
    expect(snapshot.routeAccessIndex.some((e) => e.mapping.page.route === "/sys/users/new")).toBe(
      false,
    );
    expect(snapshot.definitions).toHaveLength(1);
    expect(snapshot.definitions[0]).toMatchObject({
      code: "sys:user:add",
      menuIds: [3, 4],
      parentMenuIds: [2, 1],
    });
    expect(
      snapshot.diagnostics.some((d) => d.menuId === 5 && d.reason === "按钮权限编码为空"),
    ).toBe(true);
    expect(snapshot.diagnostics.some((d) => d.menuId === 6 && d.reason === "未知菜单类型")).toBe(
      true,
    );
  });

  it("grantedCodes 为定义编码与 authorities 的精确交集", () => {
    const snapshot = ready(
      ["sys:user:view", "sys:user:add", "other:code"],
      [sysDir, users, addBtn, dupBtn],
    );
    expect([...snapshot.grantedCodes].sort()).toEqual(["sys:user:add"]);
  });

  it("权限精确匹配：子串/冒号前缀不通过", () => {
    const snapshot = ready(["sys:user"], [sysDir, users, addBtn]);
    const entry = snapshot.routeAccessIndex.find((e) => e.mapping.page.route === "/sys/users/");
    expect(entry?.granted).toBe(false);
    expect(canAccess(snapshot, "/sys/users")).toBe(false);
  });

  it("祖先目录 permission 约束子节点", () => {
    const guarded = menu({ id: 1, type: 1, path: "/sys", permission: "sys:access" });
    const snapshot = ready(["sys:user:view"], [guarded, users]);
    expect(canAccess(snapshot, "/sys/users")).toBe(false);
    const snapshot2 = ready(["sys:access", "sys:user:view"], [guarded, users]);
    expect(canAccess(snapshot2, "/sys/users")).toBe(true);
  });

  it.each([null, 99])("目录 openType=%s 不阻断已授权子菜单", (openType) => {
    const directory = { ...sysDir, path: "/sys/roles", openType };
    const snapshot = ready(["sys:user:view"], [directory, users]);
    expect(canAccess(snapshot, "/sys/users")).toBe(true);
    expect(landingPath(snapshot)).toBe("/sys/users");
    expect(navIds(snapshot)).toEqual([1, 2]);
    expect(snapshot.routeAccessIndex.some((entry) => entry.chain.at(-1)?.id === 1)).toBe(false);
    expect(snapshot.diagnostics).toContainEqual({
      menuId: 1,
      path: "/sys/roles",
      reason: "未知打开方式",
    });
    const guarded = ready(["sys:user:view"], [{ ...directory, permission: "sys:access" }, users]);
    expect(canAccess(guarded, "/sys/users")).toBe(false);
  });

  it("hidden 只隐藏导航，不改变 URL 授权", () => {
    const hidden = menu({
      id: 2,
      parentId: 1,
      type: 2,
      path: "/sys/users",
      permission: "sys:user:view",
      hidden: true,
    });
    const snapshot = ready(["sys:user:view"], [sysDir, hidden]);
    expect(canAccess(snapshot, "/sys/users")).toBe(true);
    expect(navIds(snapshot)).not.toContain(2);
  });

  it("空 permission 的菜单默认拒绝（非仅登录策略）", () => {
    const noPerm = menu({ id: 2, parentId: 1, type: 2, path: "/sys/users", permission: null });
    const snapshot = ready([], [sysDir, noPerm]);
    expect(canAccess(snapshot, "/sys/users")).toBe(false);
    expect(snapshot.diagnostics.some((d) => d.menuId === 2)).toBe(true);
  });

  it("仅登录策略页面（/me）无需菜单授权", () => {
    const snapshot = ready([], []);
    expect(canAccess(snapshot, "/me")).toBe(true);
  });

  it("system:admin 兜底已实现 sys 页面，但不放行未知路径", () => {
    const snapshot = ready(["system:admin"], [sysDir]);
    expect(canAccess(snapshot, "/sys/users")).toBe(true);
    expect(canAccess(snapshot, "/sys/dictionaries")).toBe(true);
    expect(canAccess(snapshot, "/sys/system-configs")).toBe(false);
    expect(canAccess(snapshot, "/p/HC/issues")).toBe(false);
  });

  it("外链 openType=3 不注册站内路由", () => {
    const ext = menu({
      id: 7,
      parentId: 1,
      type: 2,
      openType: 3,
      path: "https://example.com/docs",
      permission: "sys:doc",
    });
    const snapshot = ready(["sys:doc"], [sysDir, ext]);
    expect(snapshot.routeAccessIndex).toHaveLength(0);
    const nav = snapshot.visibleNavigation[0]?.children ?? [];
    expect(nav.some((n) => n.externalUrl === "https://example.com/docs")).toBe(true);
  });

  it("成功空树是有效状态：受菜单控制的页面拒绝", () => {
    const snapshot = ready([], []);
    expect(snapshot.visibleNavigation).toHaveLength(0);
    expect(canAccess(snapshot, "/sys/users")).toBe(false);
  });

  it.each(["backlog", "defects", "dependencies", "gantt", "releases", "sprints", "tests"])(
    "已接入真实后端的 %s 模块依菜单授权放行",
    (name) => {
      const path = `/p/HC/${name}`;
      const menus = [menu({ id: 1, path, permission: "project:view" })];
      expect(canAccess(ready(["project:view"], menus), path)).toBe(true);
      expect(canAccess(ready([], menus), path)).toBe(false);
    },
  );

  it.each(["assignment", "dashboard", "settings", "stats", "worklogs", "items/DEMO-1"])(
    "演示页面 %s 即使有菜单授权仍不可用",
    (name) => {
      const path = `/p/HC/${name}`;
      const menus = [menu({ id: 1, path, permission: "project:view" })];
      expect(canAccess(ready(["project:view"], menus), path)).toBe(false);
    },
  );

  it("孤儿/环/重复 ID 使快照失败", () => {
    const orphan = menu({ id: 9, parentId: 999, type: 2, path: "/sys/users" });
    expect(() => deriveSnapshot(user([]), [orphan])).toThrow();
    const dup = [menu({ id: 1, type: 1 }), menu({ id: 1, type: 1 })];
    expect(() => deriveSnapshot(user([]), dup)).toThrow();
  });

  it("status 非 ready 时拒绝一切", () => {
    const snapshot = { ...ready(["system:admin"], []), status: "loading" as const };
    expect(canAccess(snapshot, "/sys/users")).toBe(false);
    expect(landingPath(snapshot)).toBeNull();
  });
});

describe("landingPath", () => {
  it("选择第一个可访问的具体菜单目标", () => {
    const snapshot = ready(
      ["sys:user:view"],
      [
        menu({ id: 1, type: 1, path: "/sys", permission: null }),
        menu({ id: 2, parentId: 1, type: 2, path: "/sys/users", permission: "sys:user:view" }),
      ],
    );
    expect(landingPath(snapshot)).toBe("/sys/users");
  });
  it("system:admin 在空菜单树时落到可访问的 sys 页面", () => {
    const snapshot = ready(["system:admin"], []);
    const path = landingPath(snapshot);
    expect(path).toBe("/sys/users");
    expect(canAccess(snapshot, path!)).toBe(true);
  });
  it("无可访问页返回 null（调用方转 /403）", () => {
    expect(landingPath(ready([], []))).toBeNull();
  });
});

describe("accessCandidates 继承", () => {
  it("隐藏子页面继承 manifest 声明的父菜单授权", () => {
    const snapshot = ready(
      ["sys:user:view"],
      [
        menu({ id: 1, type: 1, path: "/sys", permission: null }),
        menu({ id: 2, parentId: 1, type: 2, path: "/sys/users", permission: "sys:user:view" }),
      ],
    );
    const target = matchPage("/sys/users/new")!;
    expect(target.page.inherits).toBe("/sys/users/");
    const candidates = accessCandidates(snapshot, target);
    expect(candidates.some((e) => e.granted)).toBe(true);
    expect(canAccess(snapshot, "/sys/users/new")).toBe(true);
  });
});


it("字典菜单 alias 依动态授权控制，管理员兜底；alias 无第二份页面", () => {
  const dictionary = menu({ id: 99, path: "/system/dictionary", permission: "sys:user:view" });
  expect(canAccess(ready(["sys:user:view"], [dictionary]), "/sys/dictionaries")).toBe(true);
  expect(canAccess(ready([], [dictionary]), "/sys/dictionaries")).toBe(false);
  expect(canAccess(ready(["system:admin"], []), "/sys/dictionaries")).toBe(true);
  expect(canAccess(ready(["system:admin"], []), "/system/dictionary")).toBe(false);
});
