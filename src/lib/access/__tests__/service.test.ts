import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { authApi } from "../../api/auth";
import { systemApi } from "../../api/system";
import { getSessionGeneration, useAuthStore } from "../../api/auth-store";
import { refreshAccess, isAccessQuery } from "../service";
import { getAccessSnapshot, resetAccess, subscribeAccess } from "../store";
import { getButtonPermissionSnapshot } from "../button-permissions";
import { canAccess } from "../snapshot";

const original = useAuthStore.getState();
let client: QueryClient;
const memory = new Map<string, string>();
const user = (id = "7", authorities = ["view"]) => ({
  userId: id,
  userName: "u",
  cnName: null,
  roles: [],
  authorities,
  extraInfo: {},
});
const menus = [
  {
    id: 1,
    parentId: null,
    name: "用户",
    type: 2,
    icon: null,
    path: "/sys/users",
    openType: 1,
    uri: null,
    permission: "view",
    sort: 0,
    hidden: false,
    keepAlive: null,
    memo: null,
    createdAt: null,
    updatedAt: null,
  },
];
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function signIn(id = "7", authorities = ["view"]) {
  const info = user(id, authorities);
  memory.set("token", `token-${id}`);
  memory.set("refreshToken", "refresh");
  memory.set("userInfo", JSON.stringify(info));
  useAuthStore.setState({ ...original, user: info, token: `token-${id}`, isAuthenticated: true });
  resetAccess(id, getSessionGeneration());
}
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  memory.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
    removeItem: (key: string) => memory.delete(key),
  });
  signIn();
  vi.spyOn(authApi, "getCurrentUser").mockResolvedValue(user());
  vi.spyOn(systemApi.menu, "getMenuTreeByUser").mockResolvedValue(menus);
});
afterEach(() => {
  resetAccess(null, getSessionGeneration());
  client.clear();
  useAuthStore.setState(original);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("权限初始化与会话隔离（真实 QueryClient）", () => {
  it("先 me 后当前用户菜单，原子发布；导航 30 秒内复用", async () => {
    const changes: string[] = [];
    const unsubscribe = subscribeAccess(() => changes.push(getAccessSnapshot().status));
    const snapshot = await refreshAccess({ queryClient: client });
    expect(authApi.getCurrentUser).toHaveBeenCalledOnce();
    expect(systemApi.menu.getMenuTreeByUser).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(vi.mocked(authApi.getCurrentUser).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(systemApi.menu.getMenuTreeByUser).mock.invocationCallOrder[0],
    );
    expect(changes).toEqual(["loading", "ready"]);
    expect(canAccess(snapshot, "/sys/users")).toBe(true);
    expect(await refreshAccess({ queryClient: client })).toBe(snapshot);
    expect(client.getQueryCache().findAll({ predicate: isAccessQuery })).toHaveLength(1);
    unsubscribe();
  });
  it("并发初始化去重；强制重取期间停止旧授权", async () => {
    await refreshAccess({ queryClient: client });
    const pending = deferred<ReturnType<typeof user>>();
    vi.mocked(authApi.getCurrentUser).mockReturnValue(pending.promise);
    const first = refreshAccess({ force: true, queryClient: client });
    const second = refreshAccess({ force: true, queryClient: client });
    expect(getAccessSnapshot().status).toBe("loading");
    expect(canAccess(getAccessSnapshot(), "/sys/users")).toBe(false);
    expect(getButtonPermissionSnapshot().grantedCodes.size).toBe(0);
    pending.resolve(user("7", []));
    expect(await first).toBe(await second);
    expect(authApi.getCurrentUser).toHaveBeenCalledTimes(2);
    expect(canAccess(getAccessSnapshot(), "/sys/users")).toBe(false);
  });
  it("30 秒过期导航重新验证；相同权限事实不增加 revision", async () => {
    vi.spyOn(Date, "now").mockReturnValue(100_000);
    const first = await refreshAccess({ queryClient: client });
    vi.mocked(Date.now).mockReturnValue(130_001);
    const second = await refreshAccess({ queryClient: client });
    expect(authApi.getCurrentUser).toHaveBeenCalledTimes(2);
    expect(second.revision).toBe(first.revision);
    expect(second.fetchedAt).toBe(130_001);
  });
  it("普通网络失败保留认证但不授权缓存，重试恢复", async () => {
    await refreshAccess({ queryClient: client });
    vi.mocked(systemApi.menu.getMenuTreeByUser).mockRejectedValueOnce(new Error("offline"));
    await expect(refreshAccess({ force: true, queryClient: client })).rejects.toThrow();
    expect(getAccessSnapshot().status).toBe("error");
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(canAccess(getAccessSnapshot(), "/sys/users")).toBe(false);
    expect((await refreshAccess({ force: true, queryClient: client })).status).toBe("ready");
  });
  it("登出立即清理；迟到菜单响应不能恢复权限或查询缓存", async () => {
    const pending = deferred<typeof menus>();
    vi.mocked(systemApi.menu.getMenuTreeByUser).mockReturnValue(pending.promise);
    vi.spyOn(authApi, "logout").mockResolvedValue(undefined);
    const request = refreshAccess({ queryClient: client });
    const rejected = expect(request).rejects.toThrow();
    await vi.waitFor(() => expect(systemApi.menu.getMenuTreeByUser).toHaveBeenCalledOnce());
    const generation = getSessionGeneration();
    const logout = useAuthStore.getState().logout();
    expect(getAccessSnapshot().routeAccessIndex).toEqual([]);
    expect(getButtonPermissionSnapshot().definitions).toEqual([]);
    expect(getSessionGeneration()).toBe(generation + 1);
    pending.resolve(menus);
    await rejected;
    await logout;
    expect(getAccessSnapshot().status).toBe("idle");
    expect(client.getQueryCache().findAll({ predicate: isAccessQuery })).toEqual([]);
  });
  it("A→B 刷新倒序完成仍保留 B；不再取 A 菜单", async () => {
    const pending = deferred<ReturnType<typeof user>>();
    vi.mocked(authApi.getCurrentUser).mockReturnValueOnce(pending.promise);
    const old = refreshAccess({ queryClient: client });
    const rejected = expect(old).rejects.toThrow();
    useAuthStore.getState().invalidateSessionFromClient();
    signIn("8", []);
    vi.mocked(authApi.getCurrentUser).mockResolvedValue(user("8", []));
    await refreshAccess({ queryClient: client });
    pending.resolve(user());
    await rejected;
    expect(getAccessSnapshot().userId).toBe("8");
    expect(useAuthStore.getState().user?.userId).toBe("8");
    expect(systemApi.menu.getMenuTreeByUser).toHaveBeenCalledTimes(1);
    expect(systemApi.menu.getMenuTreeByUser).toHaveBeenCalledWith(8, expect.anything());
  });
  it("已验证 authorities 不被 hydrate 或迟到 token 刷新覆盖", async () => {
    const pending = deferred<Awaited<ReturnType<typeof authApi.refreshToken>>>();
    vi.spyOn(authApi, "refreshToken").mockReturnValue(pending.promise);
    const refresh = useAuthStore.getState().refreshAccessToken();
    vi.mocked(authApi.getCurrentUser).mockResolvedValue(user("7", ["new"]));
    await refreshAccess({ queryClient: client });
    memory.set("userInfo", JSON.stringify(user()));
    useAuthStore.getState().hydrate();
    expect(useAuthStore.getState().user?.authorities).toEqual(["new"]);
    pending.resolve({
      token: "new-token",
      userId: "7",
      refreshToken: "new-refresh",
      expireSec: 10,
      refreshExpire: 20,
    });
    expect(await refresh).toBe(true);
    expect(useAuthStore.getState().user?.authorities).toEqual(["new"]);
  });
  it("同 ID 退出重登强制换代际并立即反映 Permission 编码交集", async () => {
    vi.spyOn(authApi, "logout").mockResolvedValue(undefined);
    vi.spyOn(authApi, "login").mockImplementation(async () => ({
      token: "new-token",
      username: "u",
      refreshToken: "new-refresh",
      expireSec: 10,
      refreshExpire: 20,
      userInfo: user("7", ["stale-login-value"]),
    }));
    await refreshAccess({ queryClient: client });
    let previous = getSessionGeneration();
    for (const codes of [[], ["view"]]) {
      await useAuthStore.getState().logout();
      await useAuthStore.getState().login("u", "p");
      expect(getSessionGeneration()).toBeGreaterThan(previous);
      expect(getAccessSnapshot().routeAccessIndex).toEqual([]);
      vi.mocked(authApi.getCurrentUser).mockResolvedValue(user("7", codes));
      const snapshot = await refreshAccess({ queryClient: client });
      expect(canAccess(snapshot, "/sys/users")).toBe(codes.length > 0);
      expect(snapshot.visibleNavigation.length).toBe(codes.length > 0 ? 1 : 0);
      previous = getSessionGeneration();
    }
  });
  it("仅传输时间戳更新不增加权限 revision", async () => {
    const previous = await refreshAccess({ queryClient: client });
    vi.mocked(systemApi.menu.getMenuTreeByUser).mockResolvedValue(
      menus.map((row) => ({ ...row, updatedAt: 123, memo: "metadata", keepAlive: true })),
    );
    expect((await refreshAccess({ force: true, queryClient: client })).revision).toBe(
      previous.revision,
    );
  });
  it("成功保存发生于旧刷新中时重开读取，不写回旧结果", async () => {
    const pending = deferred<ReturnType<typeof user>>();
    vi.mocked(authApi.getCurrentUser).mockReturnValueOnce(pending.promise);
    const old = refreshAccess({ queryClient: client });
    const rejected = expect(old).rejects.toThrow();
    vi.mocked(authApi.getCurrentUser).mockResolvedValue(user("7", []));
    const updated = await refreshAccess({
      force: true,
      reason: "authorization-change",
      queryClient: client,
    });
    pending.resolve(user());
    await rejected;
    expect(canAccess(updated, "/sys/users")).toBe(false);
    expect(getAccessSnapshot()).toBe(updated);
  });
});
