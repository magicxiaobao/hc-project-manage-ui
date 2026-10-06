import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { systemApi } from "../../api/system";
import { useAuthStore } from "../../api/auth-store";
import { queryKeys } from "../keys";
import * as D from "../hooks/useDictionaries";
import * as I from "../hooks/useDictionaryItems";
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
    create: ReturnType<typeof D.useCreateDictionary>;
    update: ReturnType<typeof D.useUpdateDictionary>;
    valid: ReturnType<typeof D.useValidDictionary>;
    invalid: ReturnType<typeof D.useInvalidDictionary>;
    itemCreate: ReturnType<typeof I.useCreateDictionaryItem>;
    itemUpdate: ReturnType<typeof I.useUpdateDictionaryItem>;
    itemValid: ReturnType<typeof I.useValidDictionaryItem>;
    itemInvalid: ReturnType<typeof I.useInvalidDictionaryItem>;
    check: ReturnType<typeof D.useCheckDictionaryCode>;
    itemCheck: ReturnType<typeof I.useCheckDictionaryItemValue>;
    batch: ReturnType<typeof D.useBatchValidateDictionaryHashCode>;
    hash: ReturnType<typeof D.useValidateDictionaryHashCode>;
    list: ReturnType<typeof D.useDictionaryList>;
    detail: ReturnType<typeof D.useDictionaryDetail>;
    items: ReturnType<typeof I.useDictionaryItems>;
    itemDetail: ReturnType<typeof I.useDictionaryItemDetail>;
    shared: ReturnType<typeof D.useValidDictionaries>;
    hashCode: ReturnType<typeof D.useDictionaryHashCode>;
  };
  function Probe() {
    result = {
      create: D.useCreateDictionary(),
      update: D.useUpdateDictionary(),
      valid: D.useValidDictionary(),
      invalid: D.useInvalidDictionary(),
      itemCreate: I.useCreateDictionaryItem(),
      itemUpdate: I.useUpdateDictionaryItem(),
      itemValid: I.useValidDictionaryItem(),
      itemInvalid: I.useInvalidDictionaryItem(),
      check: D.useCheckDictionaryCode(),
      itemCheck: I.useCheckDictionaryItemValue(),
      batch: D.useBatchValidateDictionaryHashCode(),
      hash: D.useValidateDictionaryHashCode(),
      list: D.useDictionaryList({ page: 1, pageSize: 10, bean: {} }),
      detail: D.useDictionaryDetail(1, true),
      items: I.useDictionaryItems(1, true),
      itemDetail: I.useDictionaryItemDetail(9, 1, true),
      shared: D.useValidDictionaries(),
      hashCode: D.useDictionaryHashCode("a", true),
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
const allKeys = () => [
  D.dictionaryListOptions({ page: 1, pageSize: 10, bean: {} }, true).queryKey,
  D.dictionaryDetailOptions(1, true).queryKey,
  I.dictionaryItemsOptions(1, true).queryKey,
  I.dictionaryItemDetailOptions(9, 1, true).queryKey,
  D.validDictionariesOptions(true).queryKey,
  D.dictionaryHashCodeOptions("a", true).queryKey,
];
it("规范化 bean 与 key 一致；详情与其它 kind 隔离", async () => {
  const c = client();
  const spy = vi
    .spyOn(systemApi.dictionary, "findByPage")
    .mockResolvedValue({ list: [], total: 0, pageNumber: 2, pageSize: 20 });
  const options = D.dictionaryListOptions(
    { page: 2, pageSize: 20, bean: { code: " a ", title: " b " } },
    true,
  );
  await c.fetchQuery(options);
  expect(spy).toHaveBeenCalledWith({ page: 2, pageSize: 20, bean: { code: "a", title: "b" } });
  expect(options.queryKey).toEqual(
    queryKeys.system.list({
      kind: "dictionaryList",
      page: 2,
      pageSize: 20,
      bean: { code: "a", title: "b" },
    }),
  );
  expect(new Set(allKeys().map((key) => JSON.stringify(key))).size).toBe(6);
  expect(D.dictionaryDetailOptions(1, true).queryKey).not.toEqual(
    D.dictionaryDetailOptions(2, true).queryKey,
  );
  expect(D.dictionaryDetailOptions(0, true).enabled).toBe(false);
  expect(D.dictionaryDetailOptions(1, false).enabled).toBe(false);
});
it("无 authority 读取不可访问且全部 mutation 重查权限", async () => {
  const c = client();
  const h = hooks(c);
  useAuthStore.setState({ user: { ...useAuthStore.getState().user!, authorities: [] } });
  const noAccess = hooks(c);
  expect(noAccess.shared.accessible).toBe(false);
  for (const q of [
    noAccess.list,
    noAccess.detail,
    noAccess.items,
    noAccess.itemDetail,
    noAccess.shared,
    noAccess.hashCode,
  ])
    expect(q.isEnabled).toBe(false);
  const spy = vi.spyOn(systemApi.dictionary, "createDictionary");
  await expect(h.create.mutateAsync({ code: "a", title: "A" })).rejects.toThrow("管理员");
  await expect(h.check.mutateAsync("a")).rejects.toThrow("管理员");
  await expect(h.batch.mutateAsync({ a: "h" })).rejects.toThrow("管理员");
  expect(spy).not.toHaveBeenCalled();
});
it("共享消费者只请求一次并保持失败状态", async () => {
  const c = client();
  const spy = vi.spyOn(systemApi.dictionary, "getAllValidDictionaries").mockResolvedValue([]);
  const a = new QueryObserver(c, D.validDictionariesOptions(true));
  const b = new QueryObserver(c, D.validDictionariesOptions(true));
  const stopA = a.subscribe(() => {});
  const stopB = b.subscribe(() => {});
  await vi.waitFor(() => expect(a.getCurrentResult().isSuccess).toBe(true));
  expect(spy).toHaveBeenCalledOnce();
  expect(b.getCurrentResult().data).toEqual([]);
  spy.mockRejectedValue(new Error("失败"));
  await a.refetch();
  expect(a.getCurrentResult().isError).toBe(true);
  expect(a.getCurrentResult().data).toEqual([]);
  stopA();
  stopB();
});
it("exists 每次重做，hash 只读不失效；缺 key 与 false 原样返回", async () => {
  const c = client();
  const h = hooks(c);
  const invalidate = vi.spyOn(c, "invalidateQueries");
  const check = vi.spyOn(systemApi.dictionary, "existsByCode").mockResolvedValue(false);
  await h.check.mutateAsync("a");
  await h.check.mutateAsync("a");
  expect(check).toHaveBeenCalledTimes(2);
  vi.spyOn(systemApi.dictionary, "batchValidateHashCode").mockResolvedValue({ a: false });
  expect(await h.batch.mutateAsync({ a: "h", b: "h" })).toEqual({ a: false });
  vi.spyOn(systemApi.dictionary, "validateHashCode").mockResolvedValue(true);
  expect(await h.hash.mutateAsync({ code: "a", hashCode: "h" })).toBe(true);
  expect(invalidate).not.toHaveBeenCalled();
  await expect(h.batch.mutateAsync({})).rejects.toThrow("没有可校验记录");
});
it.each(["create", "update", "valid", "invalid"] as const)(
  "%s 成功失效整个 system，包括父 hash/有效列表，失败保留缓存",
  async (kind) => {
    const c = client();
    allKeys().forEach((key) => c.setQueryData(key, "old"));
    c.setQueryData(queryKeys.project.all, "project");
    const h = hooks(c);
    const invoke = () =>
      kind === "create"
        ? h.create.mutateAsync({ code: "a", title: "A" })
        : kind === "update"
          ? h.update.mutateAsync({ id: 1, title: "A" })
          : h[kind].mutateAsync(1);
    const spy =
      kind === "create"
        ? vi.spyOn(systemApi.dictionary, "createDictionary").mockResolvedValue(1)
        : kind === "update"
          ? vi.spyOn(systemApi.dictionary, "updateDictionary").mockResolvedValue("ok")
          : kind === "valid"
            ? vi.spyOn(systemApi.dictionary, "validDictionary").mockResolvedValue("ok")
            : vi.spyOn(systemApi.dictionary, "invalidDictionary").mockResolvedValue("ok");
    await invoke();
    allKeys().forEach((key) => expect(c.getQueryState(key)?.isInvalidated).toBe(true));
    expect(c.getQueryState(queryKeys.project.all)?.isInvalidated).toBe(false);
    const invalidation = vi.spyOn(c, "invalidateQueries");
    spy.mockRejectedValue(new Error("失败"));
    await expect(invoke()).rejects.toThrow("失败");
    expect(invalidation).not.toHaveBeenCalled();
  },
);
it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
  "创建无效 ID %s 失败，不成功失效；ID 无效不发写请求",
  async (id) => {
    const c = client();
    const h = hooks(c);
    vi.spyOn(systemApi.dictionary, "createDictionary").mockResolvedValue(id);
    const invalidation = vi.spyOn(c, "invalidateQueries");
    await expect(h.create.mutateAsync({ code: "a", title: "A" })).rejects.toThrow("ID 无效");
    expect(invalidation).not.toHaveBeenCalled();
    const update = vi.spyOn(systemApi.dictionary, "updateDictionary");
    await expect(h.update.mutateAsync({ id })).rejects.toThrow("ID 无效");
    expect(update).not.toHaveBeenCalled();
  },
);
it("详情匹配 ID；重取失败保留旧列表", async () => {
  const c = client();
  vi.spyOn(systemApi.dictionary, "findById").mockResolvedValue({ id: 2 } as never);
  await expect(c.fetchQuery(D.dictionaryDetailOptions(1, true))).rejects.toThrow("不匹配");
  const options = D.dictionaryListOptions({ page: 1, pageSize: 10, bean: {} }, true);
  const old = { list: [{ id: 1 }], total: 1, pageNumber: 1, pageSize: 10 };
  c.setQueryData(options.queryKey, old);
  vi.spyOn(systemApi.dictionary, "findByPage").mockRejectedValue(new Error("失败"));
  const observer = new QueryObserver(c, options);
  await observer.refetch();
  expect(observer.getCurrentResult().data).toEqual(old);
  expect(observer.getCurrentResult().isError).toBe(true);
});

it("唯一性响应非 Boolean 不能当作未重复", async () => {
  const h = hooks(client());
  vi.spyOn(systemApi.dictionary, "existsByCode").mockResolvedValue(null as never);
  await expect(h.check.mutateAsync("a")).rejects.toThrow("唯一性结果");
});
