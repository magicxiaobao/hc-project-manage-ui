import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { systemApi } from "../../api/system";
import { useAuthStore } from "../../api/auth-store";
import { queryKeys } from "../keys";
import * as C from "../hooks/useSystemConfigs";
import * as T from "../hooks/useConfigsByType";
vi.mock("../../api/auth-store", async (load) => {
  const original = await load<typeof import("../../api/auth-store")>();
  return {
    ...original,
    useAuthStore: Object.assign(
      (select: (s: ReturnType<typeof original.useAuthStore.getState>) => unknown) =>
        select(original.useAuthStore.getState()),
      original.useAuthStore,
    ),
  };
});
const initial = useAuthStore.getState();
const clients: QueryClient[] = [];
const client = () => {
  const c = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(c);
  return c;
};
beforeEach(() =>
  useAuthStore.setState({
    isAuthenticated: true,
    user: {
      userId: "1",
      userName: "admin",
      cnName: null,
      roles: [],
      authorities: ["system:admin"],
      extraInfo: {},
    },
  }),
);
afterEach(() => {
  clients.splice(0).forEach((c) => c.clear());
  useAuthStore.setState(initial);
  vi.restoreAllMocks();
});
function hooks(c: QueryClient) {
  let result!: {
    create: ReturnType<typeof C.useCreateSystemConfig>;
    update: ReturnType<typeof C.useUpdateSystemConfig>;
    valid: ReturnType<typeof C.useValidSystemConfig>;
    invalid: ReturnType<typeof C.useInvalidSystemConfig>;
    check: ReturnType<typeof C.useCheckConfigKey>;
    validate: ReturnType<typeof C.useValidateConfigValue>;
    list: ReturnType<typeof C.useSystemConfigList>;
    detail: ReturnType<typeof C.useSystemConfigDetail>;
    byKey: ReturnType<typeof C.useSystemConfigByKey>;
    shared: ReturnType<typeof T.useConfigsByType>;
  };
  function Probe() {
    result = {
      create: C.useCreateSystemConfig(),
      update: C.useUpdateSystemConfig(),
      valid: C.useValidSystemConfig(),
      invalid: C.useInvalidSystemConfig(),
      check: C.useCheckConfigKey(),
      validate: C.useValidateConfigValue(),
      list: C.useSystemConfigList({ page: 1, pageSize: 10, bean: {} }),
      detail: C.useSystemConfigDetail(1, true),
      byKey: C.useSystemConfigByKey("a"),
      shared: T.useConfigsByType("string"),
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
const keys = () => [
  C.systemConfigListOptions({ page: 1, pageSize: 10, bean: {} }, true).queryKey,
  C.systemConfigDetailOptions(1, true).queryKey,
  C.systemConfigByKeyOptions("a", true).queryKey,
  ...(["string", "number", "boolean", "json"] as const).map(
    (type) => T.configsByTypeOptions(type).queryKey,
  ),
];
it("kind 与字典/用户隔离，规范化 key 与实际请求一致", async () => {
  const c = client();
  const spy = vi
    .spyOn(systemApi.systemConfig, "findByPage")
    .mockResolvedValue({ list: [], total: 0, pageNumber: 2, pageSize: 20 });
  const options = C.systemConfigListOptions(
    { page: 2, pageSize: 20, bean: { configKey: " a ", configType: "integer" } },
    true,
  );
  await c.fetchQuery(options);
  expect(spy).toHaveBeenCalledWith({
    page: 2,
    pageSize: 20,
    bean: { configKey: "a", configType: "INTEGER" },
  });
  expect(options.queryKey).toEqual(
    queryKeys.system.list({
      kind: "systemConfigList",
      page: 2,
      pageSize: 20,
      bean: { configKey: "a", configType: "INTEGER" },
    }),
  );
  expect(
    new Set(
      [
        ...keys(),
        queryKeys.system.detail(1),
        queryKeys.system.list({ kind: "dictionaryDetail", dictionaryId: 1 }),
      ].map((key) => JSON.stringify(key)),
    ).size,
  ).toBe(9);
  expect(C.systemConfigDetailOptions(0, true).enabled).toBe(false);
  expect(T.configsByTypeOptions("").enabled).toBe(false);
});
it("相同类型共享请求，不同类型隔离，raw String 不自动解析", async () => {
  const c = client();
  const records = [{ id: 1, configValue: '{"a":1}' }] as never;
  const spy = vi.spyOn(systemApi.systemConfig, "getConfigsByType").mockResolvedValue(records);
  const a = new QueryObserver(c, T.configsByTypeOptions("json"));
  const b = new QueryObserver(c, T.configsByTypeOptions("json"));
  const stopA = a.subscribe(() => {});
  const stopB = b.subscribe(() => {});
  await vi.waitFor(() => expect(a.getCurrentResult().isSuccess).toBe(true));
  expect(spy).toHaveBeenCalledOnce();
  expect(spy).toHaveBeenCalledWith("JSON");
  expect(b.getCurrentResult().data).toEqual(records);
  expect(T.configsByTypeOptions("number").queryKey).not.toEqual(
    T.configsByTypeOptions("json").queryKey,
  );
  spy.mockRejectedValue(new Error("失败"));
  await a.refetch();
  expect(a.getCurrentResult().isError).toBe(true);
  expect(a.getCurrentResult().data).toEqual(records);
  stopA();
  stopB();
});
it.each([false, true])(
  "未登录/非管理员均不请求、不暴露已缓存数据，执行时重查权限（登录=%s）",
  async (authenticated) => {
    const c = client();
    keys().forEach((key) => c.setQueryData(key, [{ secret: "hidden" }]));
    const h = hooks(c);
    useAuthStore.setState({
      isAuthenticated: authenticated,
      user: { ...useAuthStore.getState().user!, authorities: [] },
    });
    const denied = hooks(c);
    for (const q of [denied.list, denied.detail, denied.byKey, denied.shared]) {
      expect(q.accessible).toBe(false);
      expect(q.data).toBeUndefined();
      expect(q.isEnabled).toBe(false);
      expect(() => q.refetch()).toThrow("管理员");
    }
    const spy = vi.spyOn(systemApi.systemConfig, "createSystemConfig");
    await expect(h.create.mutateAsync({ name: "A", configKey: "a" })).rejects.toThrow("管理员");
    await expect(h.update.mutateAsync({ id: 1 })).rejects.toThrow("管理员");
    await expect(h.valid.mutateAsync(1)).rejects.toThrow("管理员");
    await expect(h.invalid.mutateAsync(1)).rejects.toThrow("管理员");
    await expect(h.check.mutateAsync("a")).rejects.toThrow("管理员");
    await expect(h.validate.mutateAsync({ configKey: "a", configValue: "1" })).rejects.toThrow(
      "管理员",
    );
    expect(() => C.systemConfigByKeyOptions("a", true).queryFn()).toThrow("管理员");
    expect(spy).not.toHaveBeenCalled();
  },
);
it("详情匹配 ID、禁用记录可读、按键 null 成功", async () => {
  const c = client();
  const spy = vi.spyOn(systemApi.systemConfig, "findById").mockResolvedValue({ id: 2 } as never);
  await expect(c.fetchQuery(C.systemConfigDetailOptions(1, true))).rejects.toThrow("不匹配");
  spy.mockResolvedValue({ id: 1, enabled: false } as never);
  expect(await c.fetchQuery(C.systemConfigDetailOptions(1, true))).toMatchObject({
    enabled: false,
  });
  vi.spyOn(systemApi.systemConfig, "getConfigByKey").mockResolvedValue(null);
  expect(await c.fetchQuery(C.systemConfigByKeyOptions(" a ", true))).toBeNull();
});
it("预检每次 fresh，不缓存 false、不失效；非布尔与失败拒绝", async () => {
  const c = client(),
    h = hooks(c),
    invalidate = vi.spyOn(c, "invalidateQueries");
  const check = vi.spyOn(systemApi.systemConfig, "existsByConfigKey").mockResolvedValue(false);
  await h.check.mutateAsync("a");
  await h.check.mutateAsync("a");
  expect(check).toHaveBeenCalledTimes(2);
  check.mockResolvedValue(true);
  expect(await h.check.mutateAsync("a")).toBe(true);
  const validate = vi.spyOn(systemApi.systemConfig, "validateConfigValue").mockResolvedValue(false);
  expect(await h.validate.mutateAsync({ configKey: "a", configValue: "0" })).toBe(false);
  check.mockResolvedValue(null as never);
  validate.mockResolvedValue("true" as never);
  await expect(h.check.mutateAsync("a")).rejects.toThrow();
  await expect(h.validate.mutateAsync({ configKey: "a", configValue: "0" })).rejects.toThrow();
  expect(invalidate).not.toHaveBeenCalled();
});
it.each(["create", "update", "valid", "invalid"] as const)(
  "%s 成功全部 kind 和旧/新类型失效，失败不失效",
  async (kind) => {
    const c = client();
    keys().forEach((key) => c.setQueryData(key, "old"));
    c.setQueryData(queryKeys.project.all, "project");
    const h = hooks(c);
    const spy =
      kind === "create"
        ? vi.spyOn(systemApi.systemConfig, "createSystemConfig").mockResolvedValue(1)
        : kind === "update"
          ? vi.spyOn(systemApi.systemConfig, "updateSystemConfig").mockResolvedValue("ok")
          : kind === "valid"
            ? vi.spyOn(systemApi.systemConfig, "validSystemConfig").mockResolvedValue("ok")
            : vi.spyOn(systemApi.systemConfig, "invalidSystemConfig").mockResolvedValue("ok");
    const invoke = () =>
      kind === "create"
        ? h.create.mutateAsync({ name: "A", configKey: "a" })
        : kind === "update"
          ? h.update.mutateAsync({ id: 1, configType: "JSON" })
          : h[kind].mutateAsync(1);
    await invoke();
    keys().forEach((key) => expect(c.getQueryState(key)?.isInvalidated).toBe(true));
    expect(c.getQueryState(queryKeys.project.all)?.isInvalidated).toBe(false);
    const invalidate = vi.spyOn(c, "invalidateQueries");
    spy.mockRejectedValue(new Error("失败"));
    await expect(invoke()).rejects.toThrow();
    expect(invalidate).not.toHaveBeenCalled();
  },
);
it("活跃旧/新类型写后重取可见新数据", async () => {
  const c = client();
  const spy = vi
    .spyOn(systemApi.systemConfig, "getConfigsByType")
    .mockImplementation(
      async (type) => [{ id: 1, configType: type, configValue: "before" }] as never,
    );
  const observers = (["string", "json"] as const).map(
    (type) => new QueryObserver(c, T.configsByTypeOptions(type)),
  );
  const stops = observers.map((o) => o.subscribe(() => {}));
  await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  spy.mockImplementation(async (type) =>
    type === "STRING" ? [] : ([{ id: 1, configType: type, configValue: "after" }] as never),
  );
  vi.spyOn(systemApi.systemConfig, "updateSystemConfig").mockResolvedValue("ok");
  await hooks(c).update.mutateAsync({ id: 1, configType: "JSON" });
  await vi.waitFor(() => {
    expect(observers[0].getCurrentResult().data).toEqual([]);
    expect(observers[1].getCurrentResult().data?.[0].configValue).toBe("after");
  });
  stops.forEach((stop) => stop());
});
it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
  "无效 create id %s 不成功失效，非法写 ID 不请求",
  async (id) => {
    const c = client(),
      h = hooks(c);
    vi.spyOn(systemApi.systemConfig, "createSystemConfig").mockResolvedValue(id);
    const invalidate = vi.spyOn(c, "invalidateQueries");
    await expect(h.create.mutateAsync({ name: "A", configKey: "a" })).rejects.toThrow("ID 无效");
    expect(invalidate).not.toHaveBeenCalled();
    const update = vi.spyOn(systemApi.systemConfig, "updateSystemConfig");
    await expect(h.update.mutateAsync({ id })).rejects.toThrow();
    await expect(h.valid.mutateAsync(id)).rejects.toThrow();
    await expect(h.invalid.mutateAsync(id)).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  },
);
