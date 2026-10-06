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
it("dict A/B 和 item A/B 缓存隔离；隐藏上下文拒绝", async () => {
  expect(I.dictionaryItemsOptions(1, true).queryKey).not.toEqual(
    I.dictionaryItemsOptions(2, true).queryKey,
  );
  expect(I.dictionaryItemDetailOptions(9, 1, true).queryKey).not.toEqual(
    I.dictionaryItemDetailOptions(9, 2, true).queryKey,
  );
  expect(I.dictionaryItemDetailOptions(9, 1, true).queryKey).not.toEqual(
    I.dictionaryItemDetailOptions(8, 1, true).queryKey,
  );
  expect(I.dictionaryItemsOptions(1, false).enabled).toBe(false);
  expect(I.dictionaryItemDetailOptions(9, 0, true).enabled).toBe(false);
  const c = client();
  const spy = vi
    .spyOn(systemApi.dictionaryItem, "findById")
    .mockResolvedValue({ id: 9, dictId: 2 } as never);
  await expect(c.fetchQuery(I.dictionaryItemDetailOptions(9, 1, true))).rejects.toThrow(
    "所属字典不匹配",
  );
  spy.mockResolvedValue({ id: 8, dictId: 1 } as never);
  await expect(c.fetchQuery(I.dictionaryItemDetailOptions(9, 1, true))).rejects.toThrow("不匹配");
});
it("管理读取 findByDictId 包括无效项；后台失败保留数据", async () => {
  const c = client();
  const row = { id: 9, dictId: 1, validStatus: 0 };
  const spy = vi.spyOn(systemApi.dictionaryItem, "findByDictId").mockResolvedValue([row] as never);
  const options = I.dictionaryItemsOptions(1, true);
  expect(await c.fetchQuery(options)).toEqual([row]);
  expect(spy).toHaveBeenCalledWith(1);
  spy.mockRejectedValue(new Error("失败"));
  const observer = new QueryObserver(c, options);
  await observer.refetch();
  expect(observer.getCurrentResult().data).toEqual([row]);
  expect(observer.getCurrentResult().isError).toBe(true);
});
it("exists dictId + value 每次重做，无权限拒绝请求", async () => {
  const c = client();
  const h = hooks(c);
  const spy = vi.spyOn(systemApi.dictionaryItem, "existsByValue").mockResolvedValue(false);
  await h.itemCheck.mutateAsync({ dictId: 1, value: "v" });
  await h.itemCheck.mutateAsync({ dictId: 2, value: "v" });
  await h.itemCheck.mutateAsync({ dictId: 1, value: "v" });
  expect(spy.mock.calls).toEqual([
    [1, "v"],
    [2, "v"],
    [1, "v"],
  ]);
  useAuthStore.setState({ isAuthenticated: false });
  await expect(h.itemCheck.mutateAsync({ dictId: 1, value: "v" })).rejects.toThrow("管理员");
  expect(spy).toHaveBeenCalledTimes(3);
  const create = vi.spyOn(systemApi.dictionaryItem, "createDictionaryItem");
  await expect(h.itemCreate.mutateAsync({ dictId: 1, value: "v" })).rejects.toThrow("管理员");
  expect(create).not.toHaveBeenCalled();
});
it.each(["itemCreate", "itemUpdate", "itemValid", "itemInvalid"] as const)(
  "%s 写后覆盖 system 失效，失败不失效",
  async (kind) => {
    const c = client();
    const h = hooks(c);
    allKeys().forEach((key) => c.setQueryData(key, "old"));
    const invoke = () =>
      kind === "itemCreate"
        ? h.itemCreate.mutateAsync({ dictId: 1, value: "v", name: "" })
        : kind === "itemUpdate"
          ? h.itemUpdate.mutateAsync({ id: 9, value: "v" })
          : h[kind].mutateAsync(9);
    const spy =
      kind === "itemCreate"
        ? vi.spyOn(systemApi.dictionaryItem, "createDictionaryItem").mockResolvedValue(9)
        : kind === "itemUpdate"
          ? vi.spyOn(systemApi.dictionaryItem, "updateDictionaryItem").mockResolvedValue("ok")
          : kind === "itemValid"
            ? vi.spyOn(systemApi.dictionaryItem, "validDictionaryItem").mockResolvedValue("ok")
            : vi.spyOn(systemApi.dictionaryItem, "invalidDictionaryItem").mockResolvedValue("ok");
    await invoke();
    allKeys().forEach((key) => expect(c.getQueryState(key)?.isInvalidated).toBe(true));
    const invalidation = vi.spyOn(c, "invalidateQueries");
    spy.mockRejectedValue(new Error("失败"));
    await expect(invoke()).rejects.toThrow("失败");
    expect(invalidation).not.toHaveBeenCalled();
  },
);
it("创建 ID 0/无效上下文失败，不请求无效目标", async () => {
  const c = client();
  const h = hooks(c);
  const spy = vi.spyOn(systemApi.dictionaryItem, "createDictionaryItem").mockResolvedValue(0);
  const invalidate = vi.spyOn(c, "invalidateQueries");
  await expect(h.itemCreate.mutateAsync({ dictId: 1, value: "v" })).rejects.toThrow("ID 无效");
  expect(invalidate).not.toHaveBeenCalled();
  spy.mockClear();
  await expect(h.itemCreate.mutateAsync({ dictId: 0, value: "v" })).rejects.toThrow("ID 无效");
  expect(spy).not.toHaveBeenCalled();
});

it("数据值唯一性响应非 Boolean 不能继续创建", async () => {
  const h = hooks(client());
  vi.spyOn(systemApi.dictionaryItem, "existsByValue").mockResolvedValue(null as never);
  await expect(h.itemCheck.mutateAsync({ dictId: 1, value: "v" })).rejects.toThrow("唯一性结果");
});
