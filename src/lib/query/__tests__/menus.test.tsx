import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { systemApi } from "../../api/system";
import { useAuthStore } from "../../api/auth-store";
import { queryKeys } from "../keys";
import {
  menuDetailOptions,
  menuListAllOptions,
  menuTreeOptions,
  menuTreeByUserOptions,
  useMenuDetail,
  useMenuListAll,
  useMenuTree,
  useMenuTreeByUser,
  useCreateMenu,
  useUpdateMenu,
  useValidMenu,
  useInvalidMenu,
} from "../hooks/useMenus";
import type { MenuResponse } from "../../api/system-types";
vi.mock("../../api/auth-store", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../api/auth-store")>();
  return {
    ...original,
    useAuthStore: Object.assign(
      (selector: (state: ReturnType<typeof original.useAuthStore.getState>) => unknown) =>
        selector(original.useAuthStore.getState()),
      original.useAuthStore,
    ),
  };
});
const original = useAuthStore.getState();
const clients: QueryClient[] = [];
function client() {
  const c = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(c);
  return c;
}
const user = {
  userId: "1",
  userName: "管理员",
  cnName: null,
  extraInfo: {},
  roles: [],
  authorities: ["system:admin"],
};
beforeEach(() => useAuthStore.setState({ isAuthenticated: true, user }));
afterEach(() => {
  clients.splice(0).forEach((c) => c.clear());
  useAuthStore.setState(original);
  vi.restoreAllMocks();
});
const row = (id: number): MenuResponse => ({
  id,
  parentId: 0,
  name: "菜单",
  type: 2,
  icon: null,
  path: null,
  openType: 1,
  uri: null,
  permission: null,
  sort: 0,
  keepAlive: false,
  hidden: false,
  memo: null,
  createdAt: null,
  updatedAt: null,
});
function mutations(c: QueryClient) {
  let result!: {
    create: ReturnType<typeof useCreateMenu>;
    update: ReturnType<typeof useUpdateMenu>;
    valid: ReturnType<typeof useValidMenu>;
    invalid: ReturnType<typeof useInvalidMenu>;
  };
  function Probe() {
    result = {
      create: useCreateMenu(),
      update: useUpdateMenu(),
      valid: useValidMenu(),
      invalid: useInvalidMenu(),
    };
    return null;
  }
  renderToString(
    <QueryClientProvider client={c}>
      <Probe />
    </QueryClientProvider>,
  );
  return result;
}
describe("菜单 hooks", () => {
  it("keys 区分根/完整列表/详情/用户 A B", () => {
    expect(menuTreeOptions(true).queryKey).toEqual(queryKeys.system.list({ kind: "menuTree" }));
    expect(menuListAllOptions(true).queryKey).toEqual(
      queryKeys.system.list({ kind: "menuListAll", pageSize: 100, bean: {} }),
    );
    expect(menuDetailOptions(9, true).queryKey).toEqual(
      queryKeys.system.list({ kind: "menuDetail", menuId: 9 }),
    );
    expect(menuTreeByUserOptions(1, true).queryKey).not.toEqual(
      menuTreeByUserOptions(2, true).queryKey,
    );
  });
  it.each([null, 0, -1, 1.2, Number.MAX_SAFE_INTEGER + 1])("非法详情/用户 ID %s 不请求", (id) => {
    const detail = vi.spyOn(systemApi.menu, "findById");
    const byUser = vi.spyOn(systemApi.menu, "getMenuTreeByUser");
    for (const observer of [
      new QueryObserver(client(), menuDetailOptions(id, true)),
      new QueryObserver(client(), menuTreeByUserOptions(id, true)),
    ]) {
      const off = observer.subscribe(() => {});
      expect(observer.getCurrentResult().fetchStatus).toBe("idle");
      off();
    }
    expect(detail).not.toHaveBeenCalled();
    expect(byUser).not.toHaveBeenCalled();
  });
  it.each([
    { authenticated: false, admin: true },
    { authenticated: true, admin: false },
    { authenticated: true, admin: true },
  ])("真实 hooks 的认证/关闭/显式用户查询条件 %s", ({ authenticated, admin }) => {
    useAuthStore.setState({
      isAuthenticated: authenticated,
      user: { ...user, authorities: admin ? ["system:admin"] : [] },
    });
    const c = client();
    const fetch = vi.spyOn(systemApi.menu, "getMenuTree");
    function Probe() {
      useMenuTree();
      useMenuListAll();
      useMenuDetail(9, false);
      useMenuTreeByUser(null);
      useMenuTreeByUser(1);
      return null;
    }
    renderToString(
      <QueryClientProvider client={c}>
        <Probe />
      </QueryClientProvider>,
    );
    const enabled = (key: readonly unknown[]) =>
      (c.getQueryCache().find({ queryKey: key })?.options as { enabled?: boolean }).enabled;
    expect(enabled(menuTreeOptions(true).queryKey)).toBe(authenticated && admin);
    expect(enabled(menuListAllOptions(true).queryKey)).toBe(authenticated && admin);
    expect(enabled(menuDetailOptions(9, true).queryKey)).toBe(false);
    expect(enabled(menuTreeByUserOptions(null, true).queryKey)).toBe(false);
    expect(enabled(menuTreeByUserOptions(1, true).queryKey)).toBe(authenticated && admin);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("详情 ID 不匹配拒绝回填", async () => {
    vi.spyOn(systemApi.menu, "findById").mockResolvedValue(row(8));
    await expect(client().fetchQuery(menuDetailOptions(9, true))).rejects.toThrow("ID 不匹配");
  });
  it("多页成功后才缓存，失败不缓存部分列表，重取失败保留旧缓存并报告错误", async () => {
    const c = client();
    const options = menuListAllOptions(true);
    const find = vi
      .spyOn(systemApi.menu, "findByPage")
      .mockResolvedValueOnce({ list: [row(1)], total: 2, pageNumber: 1, pageSize: 1 })
      .mockRejectedValueOnce(new Error("后页失败"));
    await expect(c.fetchQuery(options)).rejects.toThrow("后页失败");
    expect(c.getQueryData(options.queryKey)).toBeUndefined();
    c.setQueryData(options.queryKey, [row(9)]);
    find.mockRejectedValue(new Error("刷新失败"));
    const result = await new QueryObserver(c, options).refetch();
    expect(result.isError).toBe(true);
    expect(result.data).toEqual([row(9)]);
  });
  it("用户 A 迟到不能污染 B，无 placeholder 或管理子节点拼接", async () => {
    let resolve!: (value: MenuResponse[]) => void;
    vi.spyOn(systemApi.menu, "getMenuTreeByUser").mockImplementation((id) =>
      id === 1
        ? new Promise((r) => {
            resolve = r;
          })
        : Promise.resolve([row(20)]),
    );
    const c = client();
    const a = c.fetchQuery(menuTreeByUserOptions(1, true));
    expect(
      new QueryObserver(c, menuTreeByUserOptions(2, false)).getCurrentResult().data,
    ).toBeUndefined();
    await c.fetchQuery(menuTreeByUserOptions(2, true));
    resolve([row(10)]);
    await a;
    expect(c.getQueryData(menuTreeByUserOptions(2, true).queryKey)).toEqual([row(20)]);
    expect(c.getQueryData(menuTreeByUserOptions(1, true).queryKey)).toEqual([row(10)]);
  });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "create 返回非法 %s 拒绝成功，不失效系统缓存",
    async (id) => {
      const c = client();
      const invalidate = vi.spyOn(c, "invalidateQueries");
      vi.spyOn(systemApi.menu, "createMenu").mockResolvedValue(id);
      await expect(mutations(c).create.mutateAsync({ name: "目录", type: 1 })).rejects.toThrow(
        "创建未成功",
      );
      expect(invalidate).not.toHaveBeenCalled();
    },
  );
  const cases = [
    {
      method: "createMenu",
      invoke: (m: ReturnType<typeof mutations>) => m.create.mutateAsync({ name: "菜单", type: 2 }),
    },
    {
      method: "updateMenu",
      invoke: (m: ReturnType<typeof mutations>) =>
        m.update.mutateAsync({ id: 9, parentId: 0, path: "" }),
    },
    { method: "validMenu", invoke: (m: ReturnType<typeof mutations>) => m.valid.mutateAsync(9) },
    {
      method: "invalidMenu",
      invoke: (m: ReturnType<typeof mutations>) => m.invalid.mutateAsync(9),
    },
  ] as const;
  it.each(cases)(
    "$method 成功失效整个 system 域，包含用户结果，其他域不受影响",
    async ({ method, invoke }) => {
      const c = client();
      const keys = [
        menuTreeOptions(true).queryKey,
        menuListAllOptions(true).queryKey,
        menuDetailOptions(9, true).queryKey,
        menuTreeByUserOptions(1, true).queryKey,
      ];
      keys.forEach((key) => c.setQueryData(key, [row(9)]));
      c.setQueryData(queryKeys.project.all, "项目");
      if (method === "createMenu") vi.spyOn(systemApi.menu, method).mockResolvedValue(9);
      else vi.spyOn(systemApi.menu, method).mockResolvedValue("success");
      await invoke(mutations(c));
      keys.forEach((key) => expect(c.getQueryState(key)?.isInvalidated).toBe(true));
      expect(c.getQueryState(queryKeys.project.all)?.isInvalidated).toBe(false);
    },
  );
  it.each(cases)("$method 失败不失效/伪造状态", async ({ method, invoke }) => {
    const c = client();
    c.setQueryData(menuListAllOptions(true).queryKey, [row(9)]);
    const invalidate = vi.spyOn(c, "invalidateQueries");
    vi.spyOn(systemApi.menu, method).mockRejectedValue(new Error("失败"));
    await expect(invoke(mutations(c))).rejects.toThrow("失败");
    expect(invalidate).not.toHaveBeenCalled();
    expect(c.getQueryData(menuListAllOptions(true).queryKey)).toEqual([row(9)]);
  });
  it("mutation 在调用时再次检查管理员，不发送请求", async () => {
    const c = client();
    const create = vi.spyOn(systemApi.menu, "createMenu");
    const m = mutations(c);
    useAuthStore.setState({ isAuthenticated: false });
    await expect(m.create.mutateAsync({ name: "目录" })).rejects.toThrow("管理员");
    expect(create).not.toHaveBeenCalled();
  });
});
