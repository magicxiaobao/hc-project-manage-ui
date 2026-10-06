import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { systemApi } from "../../api/system";
import { queryKeys } from "../keys";
import {
  permissionTreeOptions,
  rolePermissionsOptions,
  useAssignRolePermissions,
  usePermissionTree,
  useRolePermissions,
} from "../hooks/useRolePermissions";
import { useRoleOptions } from "../hooks/useUserRoles";

const clients: QueryClient[] = [];
function client() {
  const result = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(result);
  return result;
}
afterEach(() => {
  clients.splice(0).forEach((c) => c.clear());
  vi.restoreAllMocks();
});

describe("权限 hooks 的门禁与隔离", () => {
  it("所有 key 走 system 工厂；同 ID 不撞用户/角色详情", () => {
    const key = rolePermissionsOptions(11, true).queryKey;
    expect(key).toEqual(queryKeys.system.list({ kind: "rolePermissions", roleId: 11 }));
    expect(permissionTreeOptions(true).queryKey).toEqual(
      queryKeys.system.list({ kind: "permissionTree" }),
    );
    expect(key).not.toEqual(queryKeys.system.detail(11));
    expect(key).not.toEqual(queryKeys.system.list({ kind: "roleDetail", roleId: 11 }));
    expect(key).not.toEqual(queryKeys.system.list({ kind: "userRoles", userId: 11 }));
    expect(key).not.toEqual(rolePermissionsOptions(12, true).queryKey);
  });
  it.each([null, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "非法 ID %s 不发权限请求",
    async (id) => {
      const request = vi.spyOn(systemApi.role, "getRolePermissions");
      const observer = new QueryObserver(client(), rolePermissionsOptions(id, true));
      const unsubscribe = observer.subscribe(() => {});
      expect(observer.getCurrentResult().fetchStatus).toBe("idle");
      expect(request).not.toHaveBeenCalled();
      unsubscribe();
    },
  );
  it("未授权/当前角色不可用时关闭 tree 和 permissions", () => {
    const assigned = vi.spyOn(systemApi.role, "getRolePermissions");
    const tree = vi.spyOn(systemApi.permission, "tree");
    const c = client();
    const observers = [
      new QueryObserver(c, rolePermissionsOptions(11, false)),
      new QueryObserver(c, permissionTreeOptions(false)),
    ];
    const unsubscribe = observers.map((observer) => observer.subscribe(() => {}));
    expect(assigned).not.toHaveBeenCalled();
    expect(tree).not.toHaveBeenCalled();
    unsubscribe.forEach((fn) => fn());
  });
  it("A 迟到不污染 B 的缓存/观察值", async () => {
    const c = client();
    let resolveA!: (ids: number[]) => void;
    vi.spyOn(systemApi.role, "getRolePermissions").mockImplementation((id) =>
      id === 11
        ? new Promise((resolve) => {
            resolveA = resolve;
          })
        : Promise.resolve([22]),
    );
    const a = c.fetchQuery(rolePermissionsOptions(11, true));
    const b = await c.fetchQuery(rolePermissionsOptions(12, true));
    resolveA([11]);
    await a;
    expect(b).toEqual([22]);
    expect(c.getQueryData(rolePermissionsOptions(12, true).queryKey)).toEqual([22]);
    expect(c.getQueryData(rolePermissionsOptions(11, true).queryKey)).toEqual([11]);
  });
  it("实际 hooks 使用工厂 key 与 keyword trim，并共享空 keyword 缓存", () => {
    const c = client();
    function Probe() {
      usePermissionTree(false);
      useRolePermissions(11, false);
      useRoleOptions("   ", false);
      useRoleOptions("", false);
      useRoleOptions(" 开发 ", false);
      return null;
    }
    renderToString(
      <QueryClientProvider client={c}>
        <Probe />
      </QueryClientProvider>,
    );
    expect(
      c
        .getQueryCache()
        .getAll()
        .map((q) => q.queryKey),
    ).toEqual([
      permissionTreeOptions(false).queryKey,
      rolePermissionsOptions(11, false).queryKey,
      queryKeys.system.list({ kind: "roleOptions", keyword: "" }),
      queryKeys.system.list({ kind: "roleOptions", keyword: "开发" }),
    ]);
  });
});

describe("分配 mutation 与真实回显重取", () => {
  function mutation(c: QueryClient) {
    let result!: ReturnType<typeof useAssignRolePermissions>;
    function Probe() {
      result = useAssignRolePermissions();
      return null;
    }
    renderToString(
      <QueryClientProvider client={c}>
        <Probe />
      </QueryClientProvider>,
    );
    return result;
  }
  it("成功失效 system.all；显式 refetch 读取 POST 后的服务端值", async () => {
    const c = client();
    const invalidate = vi.spyOn(c, "invalidateQueries");
    vi.spyOn(systemApi.role, "assignPermissions").mockResolvedValue("权限分配成功");
    const get = vi
      .spyOn(systemApi.role, "getRolePermissions")
      .mockResolvedValueOnce([11])
      .mockResolvedValueOnce([12, 99]);
    const options = rolePermissionsOptions(11, true);
    await c.fetchQuery(options);
    await mutation(c).mutateAsync({ roleId: 11, permissionIds: [12, 99] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.system.all });
    const observer = new QueryObserver(c, options);
    const actual = await observer.refetch({ throwOnError: true });
    expect(actual.data).toEqual([12, 99]);
    expect(get).toHaveBeenCalledTimes(2);
  });
  it("POST 失败不失效缓存", async () => {
    const c = client();
    const invalidate = vi.spyOn(c, "invalidateQueries");
    const key = rolePermissionsOptions(11, true).queryKey;
    c.setQueryData(key, [11]);
    vi.spyOn(systemApi.role, "assignPermissions").mockRejectedValue(new Error("保存失败"));
    await expect(mutation(c).mutateAsync({ roleId: 11, permissionIds: [] })).rejects.toThrow(
      "保存失败",
    );
    expect(invalidate).not.toHaveBeenCalled();
    expect(c.getQueryData(key)).toEqual([11]);
  });
  it("GET 失败保留错误状态，不转为空权限", async () => {
    const c = client();
    vi.spyOn(systemApi.role, "getRolePermissions").mockRejectedValue(new Error("回显失败"));
    const options = rolePermissionsOptions(11, true);
    await expect(c.fetchQuery(options)).rejects.toThrow("回显失败");
    expect(c.getQueryState(options.queryKey)?.status).toBe("error");
    expect(c.getQueryData(options.queryKey)).toBeUndefined();
  });
});
