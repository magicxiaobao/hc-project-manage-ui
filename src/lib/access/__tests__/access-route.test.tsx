/**
 * 路由守卫行为测试（P5 p5-dynamic-route-permission §6.2）。
 *
 * 用真实 @tanstack/react-router + memory history 验证：
 * beforeLoad 拦截顺序（loader 在拒绝时不执行）、拒绝去向（/login、/403、
 * 未知 URL 走 404 留给路由）。
 * service 层被 mock（不调真实网络）；快照用 deriveSnapshot 真实派生。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  isRedirect,
  isNotFound,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../../lib/api/auth-store";
import { deriveSnapshot } from "../snapshot";
import { guardAccess, isRegisteredTarget } from "../guard";
import type { MenuResponse } from "../../api/system-types";
import type { AuthenticatedUser } from "../../api/types";

const refreshAccessMock = vi.fn();
vi.mock("../../../lib/access/service", () => ({
  refreshAccess: (...args: unknown[]) => refreshAccessMock(...args),
  AccessLoadError: class AccessLoadError extends Error {},
}));

function menu(partial: Partial<MenuResponse> & { id: number }): MenuResponse {
  return {
    id: partial.id,
    parentId: partial.parentId ?? null,
    name: partial.name ?? `菜单${partial.id}`,
    type: partial.type ?? 2,
    icon: null,
    path: partial.path ?? null,
    openType: 1,
    uri: null,
    permission: partial.permission ?? null,
    sort: 0,
    keepAlive: null,
    hidden: partial.hidden ?? null,
    memo: null,
    createdAt: null,
    updatedAt: null,
  };
}

const sysMenus: MenuResponse[] = [
  menu({ id: 1, type: 1, path: "/sys" }),
  menu({ id: 2, parentId: 1, type: 2, path: "/sys/users", permission: "sys:user:view" }),
];

function readySnapshot(authorities: string[]) {
  const user: AuthenticatedUser = {
    userId: "7",
    userName: "u",
    cnName: null,
    extraInfo: {},
    roles: [],
    authorities,
  };
  const derived = deriveSnapshot(user, sysMenus);
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

const original = useAuthStore.getState();
afterEach(() => {
  useAuthStore.setState(original);
  vi.clearAllMocks();
});

function signIn(authorities: string[]) {
  useAuthStore.setState({
    hydrate: vi.fn(),
    isAuthenticated: true,
    user: {
      userId: "7",
      userName: "测试",
      cnName: null,
      extraInfo: {},
      roles: [],
      authorities,
    },
  });
  refreshAccessMock.mockResolvedValue(readySnapshot(authorities));
}

function signOut() {
  useAuthStore.setState({ hydrate: vi.fn(), isAuthenticated: false, user: null });
}

describe("guardAccess 直接调用", () => {
  const queryClient = {} as never;

  it("未登录访问受保护 URL → /login 并保留内部目标", async () => {
    signOut();
    let error: unknown;
    try {
      await guardAccess({
        location: { pathname: "/sys/users/123/roles", href: "/sys/users/123/roles?from=test" },
        queryClient,
      });
    } catch (caught) {
      error = caught;
    }
    expect(isRedirect(error)).toBe(true);
    expect(error).toMatchObject({
      options: { to: "/login", search: { redirect: "/sys/users/123/roles?from=test" } },
    });
    expect(refreshAccessMock).not.toHaveBeenCalled();
  });

  it("外站 redirect 目标被既有校验拒绝", async () => {
    signOut();
    let error: unknown;
    try {
      await guardAccess({
        location: { pathname: "/sys/users", href: "https://evil.example/x" },
        queryClient,
      });
    } catch (caught) {
      error = caught;
    }
    expect(isRedirect(error)).toBe(true);
    const options = (error as { options: { to: string; search?: Record<string, unknown> } })
      .options;
    expect(options.to).toBe("/login");
    expect(options.search?.redirect).toBeUndefined();
  });

  it("已登录但无权限的已实现 URL → /403", async () => {
    signIn([]);
    let error: unknown;
    try {
      await guardAccess({ location: { pathname: "/sys/users", href: "/sys/users" }, queryClient });
    } catch (caught) {
      error = caught;
    }
    expect(isRedirect(error)).toBe(true);
    expect(error).toMatchObject({ options: { to: "/403" } });
  });

  it("隐藏菜单的合法路由可直接访问（hidden 不改变授权）", async () => {
    signIn(["sys:user:view"]);
    const hidden: MenuResponse[] = [
      menu({ id: 1, type: 1, path: "/sys" }),
      menu({
        id: 2,
        parentId: 1,
        type: 2,
        path: "/sys/users",
        permission: "sys:user:view",
        hidden: true,
      }),
    ];
    const derived = deriveSnapshot(
      {
        userId: "7",
        userName: "u",
        cnName: null,
        extraInfo: {},
        roles: [],
        authorities: ["sys:user:view"],
      },
      hidden,
    );
    refreshAccessMock.mockResolvedValue({
      ...derived,
      userId: "7",
      sessionGeneration: 1,
      revision: 1,
      status: "ready" as const,
      fetchedAt: 1,
      error: null,
    });
    await expect(
      guardAccess({ location: { pathname: "/sys/users", href: "/sys/users" }, queryClient }),
    ).resolves.toBeUndefined();
  });

  it("未知 URL 不拦截（留给路由 404）", async () => {
    signIn(["sys:user:view"]);
    await expect(
      guardAccess({ location: { pathname: "/no/such/page", href: "/no/such/page" }, queryClient }),
    ).rejects.toSatisfy(isNotFound);
    expect(refreshAccessMock).not.toHaveBeenCalled();
  });

  it("/login 与 /403 不触发授权", async () => {
    signOut();
    await expect(
      guardAccess({ location: { pathname: "/login", href: "/login?redirect=%2F" }, queryClient }),
    ).resolves.toBeUndefined();
    await expect(
      guardAccess({ location: { pathname: "/403", href: "/403" }, queryClient }),
    ).resolves.toBeUndefined();
    expect(refreshAccessMock).not.toHaveBeenCalled();
  });

  it("登录缺省和非法 redirect 规范为 landing，避免旧表单固定项目跳转", async () => {
    signOut();
    for (const href of [
      "/login",
      "/login?redirect=https://evil.example",
      "/login?redirect=%2Flogin",
    ]) {
      await expect(
        guardAccess({ location: { pathname: "/login", href }, queryClient }),
      ).rejects.toMatchObject({ options: { to: "/login", search: { redirect: "/" } } });
    }
    expect(refreshAccessMock).not.toHaveBeenCalled();
  });
  it("/ 按授权 landing 调度；无可访问页 → /403", async () => {
    signIn(["sys:user:view"]);
    let error: unknown;
    try {
      await guardAccess({ location: { pathname: "/", href: "/" }, queryClient });
    } catch (caught) {
      error = caught;
    }
    expect(isRedirect(error)).toBe(true);
    expect(error).toMatchObject({ options: { href: "/sys/users" } });

    signIn([]);
    error = undefined;
    try {
      await guardAccess({ location: { pathname: "/", href: "/" }, queryClient });
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ options: { href: "/403" } });
  });
});

describe("真实 memory router：beforeLoad 先于 loader", () => {
  function buildRouter(initialPath: string, loaderSpy: () => void) {
    const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
      component: () => null,
      beforeLoad: ({ location, context, matches }) =>
        guardAccess({
          location: { pathname: location.pathname, href: location.href },
          queryClient: context.queryClient,
          registeredPage: isRegisteredTarget(matches, location.pathname),
        }),
    });
    const loginRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/login",
      validateSearch: (search) => ({ redirect: search.redirect as string | undefined }),
      component: () => null,
    });
    const forbiddenRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/403",
      component: () => null,
    });
    const protectedRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/sys/users",
      loader: () => {
        loaderSpy();
      },
      component: () => null,
    });
    const unlisted = createRoute({
      getParentRoute: () => rootRoute,
      path: "/implemented-unlisted",
      loader: loaderSpy,
      component: () => null,
    });
    return createRouter({
      isServer: false,
      origin: "http://localhost",
      routeTree: rootRoute.addChildren([loginRoute, forbiddenRoute, protectedRoute, unlisted]),
      history: createMemoryHistory({ initialEntries: [initialPath] }),
      context: { queryClient: {} as unknown as QueryClient },
    });
  }

  it("已实现但未声明策略的页面默认拒绝，未知子路径保持 404", async () => {
    signIn(["system:admin"]);
    const loader = vi.fn();
    for (const [path, expected] of [
      ["/implemented-unlisted", "/403"],
      ["/sys/users/unimplemented/future", "/sys/users/unimplemented/future"],
    ]) {
      const router = buildRouter(path, loader);
      const off = router.history.subscribe(() => {
        void router.load();
      });
      await router.load();
      off();
      expect(router.state.location.pathname).toBe(expected);
    }
    expect(loader).not.toHaveBeenCalled();
  });
  it("未登录深链 /sys/users → /login，loader 未执行", async () => {
    signOut();
    const loaderSpy = vi.fn();
    const router = buildRouter("/sys/users", loaderSpy);
    const unsubscribe = router.history.subscribe(() => {
      void router.load();
    });
    await router.load();
    unsubscribe();
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search).toMatchObject({ redirect: "/sys/users" });
    expect(loaderSpy).not.toHaveBeenCalled();
  });

  it("已登录无权限 → /403，loader 与业务组件未执行", async () => {
    signIn([]);
    const loaderSpy = vi.fn();
    const router = buildRouter("/sys/users", loaderSpy);
    const unsubscribe = router.history.subscribe(() => {
      void router.load();
    });
    await router.load();
    unsubscribe();
    expect(router.state.location.pathname).toBe("/403");
    expect(loaderSpy).not.toHaveBeenCalled();
  });

  it("有权限 → 放行并执行 loader", async () => {
    signIn(["sys:user:view"]);
    const loaderSpy = vi.fn();
    const router = buildRouter("/sys/users", loaderSpy);
    const unsubscribe = router.history.subscribe(() => {
      void router.load();
    });
    await router.load();
    unsubscribe();
    expect(router.state.location.pathname).toBe("/sys/users");
    expect(loaderSpy).toHaveBeenCalledOnce();
  });

  it("system:admin 兜底已实现 sys 页面", async () => {
    signIn(["system:admin"]);
    const loaderSpy = vi.fn();
    const router = buildRouter("/sys/users", loaderSpy);
    const unsubscribe = router.history.subscribe(() => {
      void router.load();
    });
    await router.load();
    unsubscribe();
    expect(router.state.location.pathname).toBe("/sys/users");
    expect(loaderSpy).toHaveBeenCalledOnce();
  });
});


it("字典注册页面保留动态 guard：管理员放行、普通账号拒绝、未登录转登录", async () => {
  const location = { pathname: "/sys/dictionaries", href: "/sys/dictionaries" };
  signIn(["system:admin"]);
  await expect(guardAccess({ location, queryClient: {} as never })).resolves.toBeUndefined();
  signIn([]);
  await expect(guardAccess({ location, queryClient: {} as never })).rejects.toMatchObject({ options: { to: "/403" } });
  signOut();
  await expect(guardAccess({ location, queryClient: {} as never })).rejects.toMatchObject({ options: { to: "/login", search: { redirect: "/sys/dictionaries" } } });
});

it('workflow designer obeys login, deny, admin and ordinary alias menu authorization', async () => {
  const location = { pathname: '/sys/workflow-designer', href: '/sys/workflow-designer' };
  signOut();
  await expect(guardAccess({ location, queryClient: {} as never })).rejects.toMatchObject({ options: { to: '/login' } });
  signIn([]);
  await expect(guardAccess({ location, queryClient: {} as never })).rejects.toMatchObject({ options: { to: '/403' } });
  signIn(['system:admin']);
  await expect(guardAccess({ location, queryClient: {} as never })).resolves.toBeUndefined();
  // This code exists only in the permission fixture, not a backend permission contract.
  signIn(['fixture:workflow:view']);
  const user = useAuthStore.getState().user!;
  refreshAccessMock.mockResolvedValue({ ...readySnapshot(['fixture:workflow:view']), ...deriveSnapshot(user, [menu({ id: 33, path: '/system/workflow-designer', permission: 'fixture:workflow:view' })]) });
  await expect(guardAccess({ location, queryClient: {} as never })).resolves.toBeUndefined();
});
