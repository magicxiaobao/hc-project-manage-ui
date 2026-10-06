import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { systemApi } from "../../api/system";
import { useAuthStore } from "../../api/auth-store";
import type { PermissionResponse } from "../../api/system-types";
import { emptyPermissionFormInput, isPermissionCodeTaken } from "../../permission-form";
import { queryKeys } from "../keys";
import {
  fetchPermissionListAll,
  permissionDetailOptions,
  permissionListAllOptions,
  useCreatePermission,
  useDeletePermission,
  useInvalidPermission,
  usePermissionDetail,
  usePermissionListAll,
  useUpdatePermission,
  useValidPermission,
} from "../hooks/usePermissions";

// SSR 使用 store 当前快照；Zustand 默认的服务器初始快照固定为未登录。
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

const clients: QueryClient[] = [];
const originalAuth = useAuthStore.getState();
function client() {
  const result = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(result);
  return result;
}
afterEach(() => {
  clients.splice(0).forEach((item) => item.clear());
  useAuthStore.setState(originalAuth);
  vi.restoreAllMocks();
});
const row = (id: number): PermissionResponse => ({
  id,
  permissionName: "权限",
  permissionCode: `code:${id}`,
  permissionType: "API",
  groupName: "组",
  description: null,
  enabled: false,
  createdAt: null,
  updatedAt: null,
});
const payload = {
  ...emptyPermissionFormInput(),
  permissionName: "权限",
  permissionCode: "sys:new",
  permissionType: "API",
};

function mutations(c: QueryClient) {
  let result!: {
    create: ReturnType<typeof useCreatePermission>;
    update: ReturnType<typeof useUpdatePermission>;
    valid: ReturnType<typeof useValidPermission>;
    invalid: ReturnType<typeof useInvalidPermission>;
    delete: ReturnType<typeof useDeletePermission>;
  };
  function Probe() {
    result = {
      create: useCreatePermission(),
      update: useUpdatePermission(),
      valid: useValidPermission(),
      invalid: useInvalidPermission(),
      delete: useDeletePermission(),
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

describe("permission query keys 与门禁", () => {
  it("完整列表/详情 key 遵循 system 工厂，与用户、角色和树隔离", () => {
    const list = permissionListAllOptions(true).queryKey;
    const detail = permissionDetailOptions(11, true).queryKey;
    expect(list).toEqual(
      queryKeys.system.list({ kind: "permissionListAll", pageSize: 100, bean: {} }),
    );
    expect(detail).toEqual(queryKeys.system.list({ kind: "permissionDetail", permissionId: 11 }));
    for (const key of [
      queryKeys.system.detail(11),
      queryKeys.system.list({ kind: "roleDetail", roleId: 11 }),
      queryKeys.system.list({ kind: "permissionTree" }),
      list,
      permissionDetailOptions(12, true).queryKey,
    ])
      expect(detail).not.toEqual(key);
  });
  it.each([null, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("非法 ID %s 不请求", (id) => {
    const get = vi.spyOn(systemApi.permission, "findById");
    const observer = new QueryObserver(client(), permissionDetailOptions(id, true));
    const off = observer.subscribe(() => {});
    expect(observer.getCurrentResult().fetchStatus).toBe("idle");
    expect(get).not.toHaveBeenCalled();
    off();
  });
  it("关闭详情/list 不请求", () => {
    const get = vi.spyOn(systemApi.permission, "findById");
    const find = vi.spyOn(systemApi.permission, "findByPage");
    const c = client();
    const a = new QueryObserver(c, permissionDetailOptions(11, false));
    const b = new QueryObserver(c, permissionListAllOptions(false));
    const offA = a.subscribe(() => {});
    const offB = b.subscribe(() => {});
    expect(get).not.toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
    offA();
    offB();
  });
  it.each([
    { isAuthenticated: false, admin: true },
    { isAuthenticated: true, admin: false },
    { isAuthenticated: true, admin: true },
  ])("真实 hook 的认证条件 %s", ({ isAuthenticated, admin }) => {
    useAuthStore.setState({
      isAuthenticated,
      user: {
        userId: "1",
        userName: "测试",
        cnName: null,
        extraInfo: {},
        roles: [],
        authorities: admin ? ["system:admin"] : [],
      },
    });
    const c = client();
    function Probe() {
      usePermissionListAll();
      usePermissionDetail(11, true);
      usePermissionDetail(12, false);
      return null;
    }
    renderToString(
      <QueryClientProvider client={c}>
        <Probe />
      </QueryClientProvider>,
    );
    // Query 的基础 options 类型不包含 observer.enabled；真实 hooks 写入的配置含此字段。
    const enabledFor = (queryKey: readonly unknown[]) =>
      (c.getQueryCache().find({ queryKey })?.options as { enabled?: boolean } | undefined)?.enabled;
    expect(enabledFor(permissionListAllOptions(true).queryKey)).toBe(isAuthenticated && admin);
    expect(enabledFor(permissionDetailOptions(11, true).queryKey)).toBe(isAuthenticated && admin);
    expect(enabledFor(permissionDetailOptions(12, false).queryKey)).toBe(false);
  });
  it("A 的迟到详情不会写入 B 缓存", async () => {
    let resolve!: (value: PermissionResponse) => void;
    vi.spyOn(systemApi.permission, "findById").mockImplementation((id) =>
      id === 11
        ? new Promise((r) => {
            resolve = r;
          })
        : Promise.resolve(row(id)),
    );
    const c = client();
    const a = c.fetchQuery(permissionDetailOptions(11, true));
    await c.fetchQuery(permissionDetailOptions(12, true));
    resolve(row(11));
    await a;
    expect(c.getQueryData(permissionDetailOptions(12, true).queryKey)).toEqual(row(12));
  });
  it("详情 ID 错误拒绝回填", async () => {
    vi.spyOn(systemApi.permission, "findById").mockResolvedValue(row(12));
    await expect(client().fetchQuery(permissionDetailOptions(11, true))).rejects.toThrow(
      "详情 ID 不匹配",
    );
  });
});

describe("完整列表与预检共享读取", () => {
  it("201条含禁用后页编码，预检不使用 findAll/tree", async () => {
    const rows = Array.from({ length: 201 }, (_, index) => row(index + 1));
    const find = vi
      .spyOn(systemApi.permission, "findByPage")
      .mockImplementation(async ({ page }) => ({
        list: rows.slice((page - 1) * 100, page * 100),
        pageNumber: page,
        pageSize: 100,
        total: 201,
      }));
    const findAll = vi.spyOn(systemApi.permission, "findAll");
    const tree = vi.spyOn(systemApi.permission, "tree");
    const c = client();
    const list = await c.fetchQuery(permissionListAllOptions(true));
    expect(list).toHaveLength(201);
    expect(find).toHaveBeenCalledTimes(3);
    find.mockClear();
    expect(isPermissionCodeTaken(await fetchPermissionListAll(), "code:201", null)).toBe(true);
    expect(find).toHaveBeenCalledTimes(3);
    expect(findAll).not.toHaveBeenCalled();
    expect(tree).not.toHaveBeenCalled();
  });
  it("后页失败进入 error，不缓存半份数据；重取失败保留旧缓存但状态为错误", async () => {
    const find = vi
      .spyOn(systemApi.permission, "findByPage")
      .mockResolvedValueOnce({ list: [row(1)], total: 2, pageNumber: 1, pageSize: 1 })
      .mockRejectedValueOnce(new Error("后页失败"));
    const c = client();
    const options = permissionListAllOptions(true);
    await expect(c.fetchQuery(options)).rejects.toThrow("后页失败");
    expect(c.getQueryData(options.queryKey)).toBeUndefined();
    expect(c.getQueryState(options.queryKey)?.status).toBe("error");
    c.setQueryData(options.queryKey, [row(9)]);
    find.mockRejectedValue(new Error("重取失败"));
    const observer = new QueryObserver(c, options);
    const result = await observer.refetch();
    expect(result.isError).toBe(true);
    expect(result.data).toEqual([row(9)]);
  });
});

const cases = [
  {
    name: "create",
    method: "createPermission",
    invoke: (m: ReturnType<typeof mutations>) => m.create.mutateAsync(payload),
  },
  {
    name: "update",
    method: "updatePermission",
    invoke: (m: ReturnType<typeof mutations>) => m.update.mutateAsync({ ...payload, id: 11 }),
  },
  {
    name: "valid",
    method: "validPermission",
    invoke: (m: ReturnType<typeof mutations>) => m.valid.mutateAsync(11),
  },
  {
    name: "invalid",
    method: "invalidPermission",
    invoke: (m: ReturnType<typeof mutations>) => m.invalid.mutateAsync(11),
  },
  {
    name: "delete",
    method: "deletePermission",
    invoke: (m: ReturnType<typeof mutations>) => m.delete.mutateAsync(11),
  },
] as const;
describe("五种 mutation 成功/失败", () => {
  it.each(cases)(
    "$name 成功失效 system.all 包含树、列表、详情及分配",
    async ({ method, invoke }) => {
      const c = client();
      const keys = [
        permissionListAllOptions(true).queryKey,
        permissionDetailOptions(11, true).queryKey,
        queryKeys.system.list({ kind: "permissionTree" }),
        queryKeys.system.list({ kind: "rolePermissions", roleId: 11 }),
      ];
      keys.forEach((key) => c.setQueryData(key, [row(11)]));
      c.setQueryData(queryKeys.project.all, "项目");
      const invalidate = vi.spyOn(c, "invalidateQueries");
      if (method === "createPermission")
        vi.spyOn(systemApi.permission, method).mockResolvedValue(11);
      else vi.spyOn(systemApi.permission, method).mockResolvedValue("操作成功");
      await invoke(mutations(c));
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.system.all });
      keys.forEach((key) => expect(c.getQueryState(key)?.isInvalidated).toBe(true));
      expect(c.getQueryState(queryKeys.project.all)?.isInvalidated).toBe(false);
    },
  );
  it.each(cases)("$name 失败不失效、不乐观更改行或树", async ({ method, invoke }) => {
    const c = client();
    const key = permissionListAllOptions(true).queryKey;
    const tree = queryKeys.system.list({ kind: "permissionTree" });
    c.setQueryData(key, [row(11)]);
    c.setQueryData(tree, [row(12)]);
    const invalidate = vi.spyOn(c, "invalidateQueries");
    vi.spyOn(systemApi.permission, method).mockRejectedValue(new Error("失败"));
    await expect(invoke(mutations(c))).rejects.toThrow("失败");
    expect(invalidate).not.toHaveBeenCalled();
    expect(c.getQueryData(key)).toEqual([row(11)]);
    expect(c.getQueryData(tree)).toEqual([row(12)]);
  });
});
