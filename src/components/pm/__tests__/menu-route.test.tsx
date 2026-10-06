import { afterEach, describe, expect, it, vi } from "vitest";
import { Route } from "../../../routes/sys";
import { Route as Child } from "../../../routes/sys/menus";
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
    await (Route.options.beforeLoad as Function)({
      location: { pathname: "/sys/menus", href: "/sys/menus?from=test" },
      context: { queryClient: {} },
      matches: [{ routeId: "__root__" }, { routeId: "/sys" }],
    });
  } catch (caught) {
    error = caught;
  }
  expect(hydrate).toHaveBeenCalledOnce();
  return error;
}
describe("菜单布局：统一 sys beforeLoad", () => {
  it("子布局不再重复硬编码守卫", () => {
    expect(Child.options.beforeLoad).toBeUndefined();
  });
  it("未登录转登录并保留 redirect", async () => {
    expect(await run(false, [])).toMatchObject({
      options: { to: "/login", search: { redirect: "/sys/menus?from=test" } },
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
