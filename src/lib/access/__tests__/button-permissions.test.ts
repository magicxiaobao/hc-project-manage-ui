import { afterEach, describe, expect, it, vi } from "vitest";
import { getAccessSnapshot, publishAccess, resetAccess, subscribeAccess } from "../store";
import { deriveSnapshot } from "../snapshot";
import { getButtonPermissionSnapshot, subscribeButtonPermissions } from "../button-permissions";
import type { MenuResponse } from "../../api/system-types";
import type { AuthenticatedUser } from "../../api/types";

function menu(partial: Partial<MenuResponse> & { id: number }): MenuResponse {
  return {
    id: partial.id,
    parentId: partial.parentId ?? null,
    name: partial.name ?? `菜单${partial.id}`,
    type: partial.type ?? 2,
    icon: null,
    path: partial.path ?? null,
    openType: null,
    uri: null,
    permission: partial.permission ?? null,
    sort: 0,
    keepAlive: null,
    hidden: null,
    memo: null,
    createdAt: null,
    updatedAt: null,
  };
}

const user: AuthenticatedUser = {
  userId: "7",
  userName: "u",
  cnName: null,
  extraInfo: {},
  roles: [],
  authorities: ["sys:user:add", "sys:role:view"],
};

const menus: MenuResponse[] = [
  menu({ id: 1, type: 1, path: "/sys" }),
  menu({ id: 2, parentId: 1, type: 2, path: "/sys/users", permission: "sys:user:view" }),
  menu({ id: 3, parentId: 2, type: 3, permission: "sys:user:add", name: "新增用户" }),
  menu({ id: 4, parentId: 1, type: 3, permission: "sys:user:add", name: "新增用户2" }),
  menu({ id: 5, parentId: 2, type: 3, permission: "sys:user:delete", name: "删除用户" }),
];

function publishReady() {
  const derived = deriveSnapshot(user, menus);
  publishAccess(
    {
      ...derived,
      userId: "7",
      sessionGeneration: 3,
      revision: 9,
      status: "ready",
      fetchedAt: 1,
      error: null,
    },
    "test",
  );
}

afterEach(() => {
  resetAccess(null, 0);
});

describe("getButtonPermissionSnapshot", () => {
  it("返回同一快照的只读投影：含 userId/代际/revision/status", () => {
    publishReady();
    const snapshot = getButtonPermissionSnapshot();
    expect(snapshot).toMatchObject({
      userId: "7",
      sessionGeneration: 3,
      revision: 9,
      status: "ready",
    });
    expect(snapshot.definitions).toHaveLength(2);
    const add = snapshot.definitions.find((d) => d.code === "sys:user:add")!;
    expect(add.menuIds).toEqual([3, 4]);
    expect(add.parentMenuIds).toEqual([2, 1]);
    expect(add.name).toBe("新增用户");
  });

  it("投影对象稳定且所有公开集合均不可写；管理员不扩展按钮授权", () => {
    publishReady();
    const snapshot = getButtonPermissionSnapshot();
    expect(getButtonPermissionSnapshot()).toBe(snapshot);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.definitions)).toBe(true);
    expect(Object.isFrozen(snapshot.definitions[0].menuIds)).toBe(true);
    expect(snapshot.grantedCodes).not.toHaveProperty("add");
    const derived = deriveSnapshot({ ...user, authorities: ["system:admin"] }, menus);
    publishAccess({ ...getAccessSnapshot(), ...derived });
    expect(getButtonPermissionSnapshot().grantedCodes.size).toBe(0);
  });
  it("grantedCodes 为定义编码与 authorities 的精确交集（未授权的定义不进入）", () => {
    publishReady();
    const snapshot = getButtonPermissionSnapshot();
    expect([...snapshot.grantedCodes].sort()).toEqual(["sys:user:add"]);
    // sys:user:delete 有定义但无授权；sys:role:view 有授权但无按钮定义
    expect(snapshot.grantedCodes.has("sys:user:delete")).toBe(false);
    expect(snapshot.grantedCodes.has("sys:role:view")).toBe(false);
  });

  it("status 非 ready 时 grantedCodes 为空（不泄露旧授权）", () => {
    publishReady();
    publishAccess({ ...getAccessSnapshot(), status: "error", error: new Error("x") }, "test");
    const snapshot = getButtonPermissionSnapshot();
    expect(snapshot.status).toBe("error");
    expect(snapshot.grantedCodes.size).toBe(0);
  });

  it("登出发布空快照：新代际、空定义、空授权", () => {
    publishReady();
    resetAccess(null, 4);
    const snapshot = getButtonPermissionSnapshot();
    expect(snapshot).toMatchObject({ userId: null, sessionGeneration: 4, status: "idle" });
    expect(snapshot.definitions).toHaveLength(0);
    expect(snapshot.grantedCodes.size).toBe(0);
  });

  it("换账号发布空快照并递增代际", () => {
    publishReady();
    const before = getButtonPermissionSnapshot().revision;
    resetAccess("8", 5);
    const snapshot = getButtonPermissionSnapshot();
    expect(snapshot.userId).toBe("8");
    expect(snapshot.sessionGeneration).toBe(5);
    expect(snapshot.revision).toBeGreaterThan(before);
    expect(snapshot.grantedCodes.size).toBe(0);
  });
});

describe("subscribeButtonPermissions", () => {
  it("发布（含清理事件）时通知订阅者；取消订阅后不再通知", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeButtonPermissions(listener);
    publishReady();
    expect(listener).toHaveBeenCalledTimes(1);
    resetAccess(null, 9);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    publishReady();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("与 store 订阅看到的是同一快照对象", () => {
    publishReady();
    let viaStore: unknown;
    const off = subscribeAccess(() => {
      viaStore = getAccessSnapshot();
    });
    resetAccess(null, 10);
    off();
    expect(viaStore).toBe(getAccessSnapshot());
    expect(getButtonPermissionSnapshot().revision).toBe(
      (viaStore as { revision: number }).revision,
    );
  });
});
