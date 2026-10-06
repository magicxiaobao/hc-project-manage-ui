import { afterEach, describe, expect, it, vi } from "vitest";
import { Route } from "../../../routes/sys";
import { Route as Child } from "../../../routes/sys/configs";
import { useAuthStore } from "../../../lib/api/auth-store";
import { deriveSnapshot } from "../../../lib/access/snapshot";
const refresh = vi.fn();
vi.mock("@/components/pm/shell", () => ({ AppShell: () => null }));
vi.mock("@/lib/access/service", () => ({
  refreshAccess: (...args: unknown[]) => refresh(...args),
}));
const original = useAuthStore.getState();
afterEach(() => {
  useAuthStore.setState(original);
  vi.clearAllMocks();
});
async function run(authenticated: boolean, authorities: string[]) {
  const hydrate = vi.fn();
  const user = {
    userId: "1",
    userName: "测试",
    cnName: null,
    extraInfo: {},
    roles: [],
    authorities,
  };
  useAuthStore.setState({ isAuthenticated: authenticated, hydrate, user });
  refresh.mockResolvedValue({
    ...deriveSnapshot(user, []),
    userId: "1",
    sessionGeneration: 1,
    revision: 1,
    status: "ready",
    fetchedAt: 1,
    error: null,
  });
  let error: unknown;
  try {
    await (Route.options.beforeLoad as (args: unknown) => Promise<unknown>)({
      location: { pathname: "/sys/configs", href: "/sys/configs?from=test" },
      context: { queryClient: {} },
      matches: [{ routeId: "__root__" }, { routeId: "/sys" }],
    });
  } catch (caught) {
    error = caught;
  }
  expect(hydrate).toHaveBeenCalledOnce();
  return error;
}
describe("系统配置布局：统一 sys beforeLoad", () => {
  it("子布局不再重复硬编码守卫", () => {
    expect(Child.options.beforeLoad).toBeUndefined();
  });
  it("未登录转登录并保留 redirect", async () => {
    expect(await run(false, [])).toMatchObject({
      options: { to: "/login", search: { redirect: "/sys/configs?from=test" } },
    });
    expect(refresh).not.toHaveBeenCalled();
  });
  it("无目标授权转 403", async () => {
    expect(await run(true, [])).toMatchObject({ options: { to: "/403" } });
  });
  it("已验证管理员可直达", async () => {
    expect(await run(true, ["system:admin"])).toBeUndefined();
  });
});

it("菜单 alias 仅映射真实页面且 routeTree 注册", async () => {
  const { mapMenuPath, bindMapping, routeManifest } =
    await import("../../../lib/access/route-manifest");
  const mapping = mapMenuPath("/system/config");
  expect(mapping?.page).toMatchObject({ route: "/sys/configs/", policy: "menu" });
  expect(bindMapping(mapping!)).toBe("/sys/configs");
  expect(routeManifest.filter((page) => page.aliases?.includes("/system/config"))).toHaveLength(1);
  const { readFileSync } = await import("node:fs");
  const tree = readFileSync("src/routeTree.gen.ts", "utf8");
  expect(tree).toContain("/sys/configs/");
  expect(tree).not.toContain("/system/config");
});
it("旧菜单进入系统导航，导航目标只指向配置页", async () => {
  const { systemNavigation } = await import("../../biz/permission-navigation");
  const { canAccess } = await import("../../../lib/access/snapshot");
  const user = {
    userId: "1",
    userName: "admin",
    cnName: null,
    extraInfo: {},
    roles: [],
    authorities: ["system:admin"],
  };
  const menu = {
    id: 1,
    name: "系统配置管理",
    path: "/system/config",
    parentId: 0,
    type: 2,
    hidden: false,
    permission: "system:admin",
    icon: null,
    uri: null,
    openType: 1,
    sort: 0,
    keepAlive: null,
    memo: null,
    createdAt: null,
    updatedAt: null,
  } as import("../../../lib/api/system-types").MenuResponse;
  const snapshot = {
    ...deriveSnapshot(user, [menu]),
    userId: "1",
    sessionGeneration: 1,
    revision: 1,
    status: "ready" as const,
    fetchedAt: 1,
    error: null,
  };
  const navigation = systemNavigation(snapshot.visibleNavigation);
  expect(navigation).toHaveLength(1);
  expect(navigation[0].mapping?.page.route).toBe("/sys/configs/");
  expect(canAccess(snapshot, "/sys/configs")).toBe(true);
});
