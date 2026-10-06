import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { AnyRouter } from "@tanstack/react-router";
import { bindAccessRuntime } from "../runtime";
import { deriveSnapshot } from "../snapshot";
import { getAccessSnapshot, publishAccess, resetAccess } from "../store";
import { getSessionGeneration, useAuthStore } from "../../api/auth-store";
import { authApi } from "../../api/auth";
import { systemApi } from "../../api/system";
import { queryKeys } from "../../query/keys";

const original = useAuthStore.getState();
let client: QueryClient, cleanup: () => void;
let win: EventTarget, doc: EventTarget;
const user = {
  userId: "7",
  userName: "u",
  cnName: null,
  extraInfo: {},
  roles: [],
  authorities: ["system:admin"],
};
const ready = (revision: number, authorities = user.authorities) => ({
  ...deriveSnapshot({ ...user, authorities }, []),
  userId: "7",
  sessionGeneration: getSessionGeneration(),
  revision,
  fetchedAt: Date.now(),
  status: "ready" as const,
  error: null,
});
const router = () => ({
  clearCache: vi.fn(),
  invalidate: vi.fn().mockResolvedValue(undefined),
  navigate: vi.fn().mockResolvedValue(undefined),
  state: { location: { pathname: "/sys/users", href: "/sys/users" } },
});
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  win = new EventTarget();
  doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  useAuthStore.setState({ ...original, user, token: "token", isAuthenticated: true });
  resetAccess("7", getSessionGeneration());
  publishAccess(ready(getAccessSnapshot().revision + 1));
});
afterEach(() => {
  cleanup?.();
  client.clear();
  useAuthStore.setState(original);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("访问生命周期：页面缓存与强制撤销", () => {
  it("同 revision 的 loading/ready 不清页面数据；facts 改变清缓存并重检同路径", async () => {
    const target = router();
    cleanup = bindAccessRuntime(target as unknown as AnyRouter, client);
    const key = queryKeys.system.detail(12);
    client.setQueryData(key, { draftSource: "user" });
    const previous = getAccessSnapshot();
    publishAccess({ ...previous, status: "loading" });
    publishAccess(previous, "focus");
    expect(target.clearCache).not.toHaveBeenCalled();
    expect(client.getQueryData(key)).toBeDefined();
    publishAccess(ready(previous.revision + 1), "focus");
    await Promise.resolve();
    expect(target.clearCache).toHaveBeenCalledOnce();
    expect(target.invalidate).toHaveBeenCalledOnce();
    expect(client.getQueryData(key)).toBeUndefined();
  });
  it("权限撤销清预加载缓存，强制 403 忽略脏表单 blocker", async () => {
    const target = router();
    cleanup = bindAccessRuntime(target as unknown as AnyRouter, client);
    publishAccess(ready(getAccessSnapshot().revision + 1, []), "authorization-change");
    await Promise.resolve();
    expect(target.clearCache).toHaveBeenCalledOnce();
    expect(target.navigate).toHaveBeenCalledWith({
      to: "/403",
      replace: true,
      ignoreBlocker: true,
    });
  });
  it("beforeLoad 发起的权限发布不递归 invalidate", async () => {
    const target = router();
    cleanup = bindAccessRuntime(target as unknown as AnyRouter, client);
    publishAccess(ready(getAccessSnapshot().revision + 1), "navigation");
    await Promise.resolve();
    expect(target.clearCache).toHaveBeenCalledOnce();
    expect(target.invalidate).not.toHaveBeenCalled();
  });
  it("登出立即清页面/访问缓存并重新判认证", async () => {
    const target = router();
    cleanup = bindAccessRuntime(target as unknown as AnyRouter, client);
    client.setQueryData(
      queryKeys.system.list({
        kind: "accessSnapshot",
        userId: "7",
        sessionGeneration: getSessionGeneration(),
      }),
      {},
    );
    client.setQueryData(queryKeys.project.detail(12), {});
    useAuthStore.getState().invalidateSessionFromClient();
    await Promise.resolve();
    expect(client.getQueryCache().getAll()).toEqual([]);
    expect(target.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "/login", ignoreBlocker: true }),
    );
  });
  it("聚焦/恢复可见/重连显式重拉 me 和用户菜单；cleanup 移除事件监听", async () => {
    const target = router();
    cleanup = bindAccessRuntime(target as unknown as AnyRouter, client);
    vi.spyOn(authApi, "getCurrentUser").mockResolvedValue(user);
    vi.spyOn(systemApi.menu, "getMenuTreeByUser").mockResolvedValue([]);
    for (const [source, name] of [
      [win, "focus"],
      [doc, "visibilitychange"],
      [win, "online"],
    ] as const) {
      const count = vi.mocked(authApi.getCurrentUser).mock.calls.length;
      source.dispatchEvent(new Event(name));
      await vi.waitFor(() => expect(getAccessSnapshot().status).toBe("ready"));
      expect(authApi.getCurrentUser).toHaveBeenCalledTimes(count + 1);
    }
    expect(systemApi.menu.getMenuTreeByUser).toHaveBeenCalledTimes(3);
    cleanup();
    win.dispatchEvent(new Event("focus"));
    expect(authApi.getCurrentUser).toHaveBeenCalledTimes(3);
  });
});
