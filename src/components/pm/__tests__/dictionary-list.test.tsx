import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { DictionaryResponse, DictionaryItemResponse } from "../../../lib/api/system-types";
import { useAuthStore } from "../../../lib/api/auth-store";
import { queryKeys } from "../../../lib/query/keys";
import {
  DictionaryHookHarness,
  nodes,
  textOf,
  button,
  change,
  deferred,
} from "./dictionary-hook-harness";
import { DictionaryListLive } from "../dictionary-list-live";
import { DictionaryItemsDialog } from "../dictionary-items-dialog";
import { DictionaryFormDialog } from "../dictionary-form-dialog";
import { DictionaryItemFormDialog } from "../dictionary-item-form-dialog";
const mocks = vi.hoisted(() => ({
  client: null as unknown as QueryClient,
  list: {
    data: undefined as
      | { list: DictionaryResponse[]; total: number; pageNumber: number; pageSize: number }
      | undefined,
    dataUpdatedAt: 1,
    isError: false,
    isFetching: false,
    isLoading: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  detail: {
    data: undefined as DictionaryResponse | undefined,
    dataUpdatedAt: 1,
    isError: false,
    isFetching: false,
    isLoading: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  items: {
    data: undefined as DictionaryItemResponse[] | undefined,
    dataUpdatedAt: 1,
    isError: false,
    isFetching: false,
    isLoading: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  itemDetail: {
    data: undefined as DictionaryItemResponse | undefined,
    dataUpdatedAt: 1,
    isError: false,
    isFetching: false,
    isLoading: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  hash: {
    data: "h" as string | undefined,
    dataUpdatedAt: 1,
    isError: false,
    isFetching: false,
    isLoading: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  create: vi.fn(),
  update: vi.fn(),
  check: vi.fn(),
  itemCreate: vi.fn(),
  itemUpdate: vi.fn(),
  itemCheck: vi.fn(),
  valid: vi.fn(),
  invalid: vi.fn(),
  itemValid: vi.fn(),
  itemInvalid: vi.fn(),
  batch: vi.fn(),
  single: vi.fn(),
  listArgs: vi.fn(),
  itemArgs: vi.fn(),
  guards: new Map<unknown, { dirty: boolean; pending: (() => void) | null }>(),
  events: [] as string[],
}));
vi.mock("react", async (load) => {
  const original = await load<typeof import("react")>();
  const { DictionaryHookHarness: H } = await import("./dictionary-hook-harness");
  return {
    ...original,
    useState: ((initial: unknown) =>
      H.active ? H.active.state(initial) : original.useState(initial)) as typeof original.useState,
    useRef: ((initial: unknown) =>
      H.active ? H.active.ref(initial) : original.useRef(initial)) as typeof original.useRef,
    useEffect: ((callback, deps) =>
      H.active
        ? H.active.effect(callback, deps)
        : original.useEffect(callback, deps)) as typeof original.useEffect,
    useLayoutEffect: ((callback, deps) =>
      H.active
        ? H.active.effect(callback, deps)
        : original.useLayoutEffect(callback, deps)) as typeof original.useLayoutEffect,
  };
});
vi.mock("@tanstack/react-query", async (load) => ({
  ...(await load<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => mocks.client,
}));
vi.mock("../../../lib/api/auth-store", async (load) => {
  const original = await load<typeof import("../../../lib/api/auth-store")>();
  return {
    ...original,
    useAuthStore: Object.assign(
      (select: (s: ReturnType<typeof original.useAuthStore.getState>) => unknown) =>
        select(original.useAuthStore.getState()),
      original.useAuthStore,
    ),
  };
});
vi.mock("@/lib/query", async (load) => ({
  ...(await load<typeof import("../../../lib/query")>()),
  useDictionaryList: (params: unknown) => {
    mocks.listArgs(params);
    return mocks.list;
  },
  useDictionaryDetail: () => mocks.detail,
  useDictionaryItems: (...args: unknown[]) => {
    mocks.itemArgs(...args);
    return mocks.items;
  },
  useDictionaryItemDetail: () => mocks.itemDetail,
  useDictionaryHashCode: () => mocks.hash,
  useCreateDictionary: () => ({ mutateAsync: mocks.create }),
  useUpdateDictionary: () => ({ mutateAsync: mocks.update }),
  useCheckDictionaryCode: () => ({ mutateAsync: mocks.check }),
  useCreateDictionaryItem: () => ({ mutateAsync: mocks.itemCreate }),
  useUpdateDictionaryItem: () => ({ mutateAsync: mocks.itemUpdate }),
  useCheckDictionaryItemValue: () => ({ mutateAsync: mocks.itemCheck }),
  useValidDictionary: () => ({ mutateAsync: mocks.valid }),
  useInvalidDictionary: () => ({ mutateAsync: mocks.invalid }),
  useValidDictionaryItem: () => ({ mutateAsync: mocks.itemValid }),
  useInvalidDictionaryItem: () => ({ mutateAsync: mocks.itemInvalid }),
  useBatchValidateDictionaryHashCode: () => ({ mutateAsync: mocks.batch }),
  useValidateDictionaryHashCode: () => ({ mutateAsync: mocks.single }),
}));
vi.mock("@/components/biz", async () => {
  const { DictionaryHookHarness: H } = await import("./dictionary-hook-harness");
  return {
    ...(await import("../../biz/form-guard")),
    ...(await import("../../biz/option-select")),
    AppModal: ({ open, title, children }: { open: boolean; title: string; children: ReactNode }) =>
      open ? (
        <section data-modal="true" aria-label={title}>
          {children}
        </section>
      ) : null,
    useUnsavedChangesGuard: (dirty: boolean) => {
      const key = H.active;
      const state = mocks.guards.get(key) ?? { dirty, pending: null };
      state.dirty = dirty;
      mocks.guards.set(key, state);
      return {
        blocker: <span data-blocker="true" />,
        dialog: <span data-discard="true" />,
        guard: (action: () => void) => {
          mocks.events.push("guard");
          if (state.dirty) state.pending = action;
          else action();
        },
        markClean: () => {
          mocks.events.push("clean");
          state.dirty = false;
        },
      };
    },
  };
});
const original = useAuthStore.getState();
const row = (id = 1, validStatus: unknown = 1): DictionaryResponse => ({
  id,
  code: `code${id}`,
  title: `字典${id}`,
  valueType: 2,
  validStatus: validStatus as number,
  hashCode: "h",
  memo: null,
  createdAt: 12,
  updatedAt: 13,
});
const item = (id = 9, validStatus: unknown = 1): DictionaryItemResponse => ({
  id,
  dictId: 1,
  dictCode: "code1",
  value: `value${id}`,
  name: "",
  sort: 0,
  attributes: { a: 1 },
  memo: null,
  validStatus: validStatus as number,
  createdAt: null,
  updatedAt: null,
  creator: null,
  updater: null,
});
const harnesses: DictionaryHookHarness[] = [];
const mount = (component: () => ReturnType<typeof DictionaryFormDialog>) => {
  const h = new DictionaryHookHarness();
  harnesses.push(h);
  h.render(component);
  return h;
};
const settle = async (h: DictionaryHookHarness) => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  h.render();
};
const errors = (h: DictionaryHookHarness) =>
  nodes(h.tree)
    .filter((node) => node.type instanceof Function && node.type.name === "FieldError")
    .map((node) => node.props.message)
    .filter(Boolean);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.guards.clear();
  mocks.events.length = 0;
  mocks.client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
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
  });
  for (const q of [mocks.list, mocks.detail, mocks.items, mocks.itemDetail, mocks.hash]) {
    q.isError = false;
    q.isFetching = false;
    q.isLoading = false;
    q.error = null;
    q.dataUpdatedAt = 1;
  }
  mocks.list.data = { list: [row()], total: 21, pageNumber: 1, pageSize: 10 };
  mocks.detail.data = row();
  mocks.items.data = [item()];
  mocks.itemDetail.data = item();
  mocks.hash.data = "h";
  mocks.create.mockResolvedValue(1);
  mocks.update.mockResolvedValue("ok");
  mocks.check.mockResolvedValue(false);
  mocks.itemCreate.mockResolvedValue(9);
  mocks.itemUpdate.mockResolvedValue("ok");
  mocks.itemCheck.mockResolvedValue(false);
  mocks.valid.mockResolvedValue("ok");
  mocks.invalid.mockResolvedValue("ok");
  mocks.itemValid.mockResolvedValue("ok");
  mocks.itemInvalid.mockResolvedValue("ok");
  mocks.batch.mockResolvedValue({ code1: true });
  mocks.single.mockResolvedValue(true);
});
afterEach(() => {
  harnesses.splice(0).forEach((h) => h.unmount());
  mocks.client.clear();
  useAuthStore.setState(original);
  vi.restoreAllMocks();
});
it("静态列表数字状态/未知状态，加载/空态/错误/保留旧数据，无删除", () => {
  mocks.list.data!.list = [row(1, 1), row(2, 0), row(3, "1"), row(4, "VALID")];
  const markup = renderToStaticMarkup(<DictionaryListLive />);
  expect(markup).toContain("字典1");
  expect(markup).toContain("有效");
  expect(markup).toContain("无效");
  expect(markup).toContain("未知状态");
  expect(markup).not.toContain("删除");
  expect(markup).toContain("字典项管理");
  mocks.list.isError = true;
  mocks.list.error = new Error("后台重取失败");
  const failure = renderToStaticMarkup(<DictionaryListLive />);
  expect(failure).toContain("字典1");
  expect(failure).toContain("保留上次结果");
  expect(failure).toContain("重试");
  mocks.list.data = undefined;
  mocks.list.isError = false;
  mocks.list.isLoading = true;
  expect(renderToStaticMarkup(<DictionaryListLive />)).toContain("正在加载字典");
  mocks.list.isLoading = false;
  mocks.list.data = { list: [], total: 0, pageNumber: 1, pageSize: 10 };
  expect(renderToStaticMarkup(<DictionaryListLive />)).toContain("暂无字典");
  expect(renderToStaticMarkup(<DictionaryListLive />)).toContain("当前页没有可校验记录");
});
it("code/title 搜索回第一页，分页保留条件，重置清空", () => {
  const h = mount(() => DictionaryListLive());
  change(h.tree, "编码筛选", " code ");
  change(h.tree, "名称筛选", " title ");
  h.render();
  button(h.tree, "搜索").onPress();
  h.render();
  expect(mocks.listArgs).toHaveBeenLastCalledWith({
    page: 1,
    pageSize: 10,
    bean: { code: "code", title: "title" },
  });
  button(h.tree, "下一页").onPress();
  h.render();
  expect(mocks.listArgs).toHaveBeenLastCalledWith({
    page: 2,
    pageSize: 10,
    bean: { code: "code", title: "title" },
  });
  button(h.tree, "重置").onPress();
  h.render();
  expect(mocks.listArgs).toHaveBeenLastCalledWith({ page: 1, pageSize: 10, bean: {} });
});
it("编辑/字典项入口传对应 ID，打开后锁其它记录；无权限说明", () => {
  const h = mount(() => DictionaryListLive());
  button(h.tree, "编辑").onPress();
  h.render();
  expect(nodes(h.tree).find((node) => node.type === DictionaryFormDialog)?.props).toMatchObject({
    open: true,
    dictionaryId: 1,
  });
  expect(button(h.tree, "字典项管理").isDisabled).toBe(true);
  const d = mount(() => DictionaryListLive());
  button(d.tree, "字典项管理").onPress();
  d.render();
  expect(nodes(d.tree).find((node) => node.type === DictionaryItemsDialog)?.props).toMatchObject({
    open: true,
    dictId: 1,
  });
  useAuthStore.setState({ isAuthenticated: false });
  expect(renderToStaticMarkup(<DictionaryListLive />)).toContain("需要系统管理员权限");
});
it("数字状态操作方向/未知无动作，失败保留上下文", async () => {
  const h = mount(() => DictionaryListLive());
  mocks.invalid.mockRejectedValue(new Error("禁用失败"));
  button(h.tree, "禁用").onPress();
  await settle(h);
  expect(mocks.invalid).toHaveBeenCalledWith(1);
  expect(textOf(h.tree)).toContain("禁用失败");
  expect(textOf(h.tree)).toContain("字典1");
  mocks.list.data!.list = [row(2, 0)];
  h.render();
  button(h.tree, "启用").onPress();
  await settle(h);
  expect(mocks.valid).toHaveBeenCalledWith(2);
  mocks.list.data!.list = [row(3, "1")];
  h.render();
  expect(
    nodes(h.tree).filter(
      (node) =>
        node.props.onPress && ["启用", "禁用"].includes(textOf(node.props.children as ReactNode)),
    ),
  ).toHaveLength(0);
});
function seedList() {
  const key = queryKeys.system.list({ kind: "dictionaryList", page: 1, pageSize: 10, bean: {} });
  mocks.client.setQueryData(key, mocks.list.data, { updatedAt: mocks.list.dataUpdatedAt });
  return key;
}
it("当前页批量 map，逐 code 匹配与缺结果；空批次不发", async () => {
  mocks.list.data!.list = [row(), row(2), row(3, 0)];
  seedList();
  const h = mount(() => DictionaryListLive());
  button(h.tree, "校验当前页缓存").onPress();
  await settle(h);
  expect(mocks.batch).toHaveBeenCalledWith({ code1: "h", code2: "h" });
  expect(textOf(h.tree)).toContain("匹配");
  expect(textOf(h.tree)).toContain("未返回校验结果");
  mocks.list.data!.list = [row(3, 0)];
  mocks.list.dataUpdatedAt++;
  h.render();
  button(h.tree, "校验当前页缓存").onPress();
  await settle(h);
  expect(mocks.batch).toHaveBeenCalledOnce();
});
it("hash false 失效重取提示；失败保持请求错误不假造 false", async () => {
  seedList();
  const invalidate = vi.spyOn(mocks.client, "invalidateQueries");
  mocks.batch.mockResolvedValue({ code1: false });
  const h = mount(() => DictionaryListLive());
  button(h.tree, "校验当前页缓存").onPress();
  await settle(h);
  expect(textOf(h.tree)).toContain("不匹配");
  expect(textOf(h.tree)).toContain("已更新");
  expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.system.all });
  mocks.client.clear();
  seedList();
  mocks.batch.mockRejectedValue(new Error("找不到字典"));
  const fail = mount(() => DictionaryListLive());
  button(fail.tree, "校验当前页缓存").onPress();
  await settle(fail);
  expect(textOf(fail.tree)).toContain("校验请求失败：找不到字典");
  expect(textOf(fail.tree)).not.toContain("不匹配");
});
it.each(["page", "refetch", "write"])("hash 迟到结果在 %s 后撤销", async (reason) => {
  const key = seedList();
  const slow = deferred<Record<string, boolean>>();
  mocks.batch.mockReturnValue(slow.promise);
  const h = mount(() => DictionaryListLive());
  button(h.tree, "校验当前页缓存").onPress();
  if (reason === "page") button(h.tree, "下一页").onPress();
  else if (reason === "refetch") {
    mocks.list.isFetching = true;
  } else {
    mocks.client.setQueryData(key, mocks.list.data, { updatedAt: 2 });
    mocks.list.dataUpdatedAt = 2;
  }
  h.render();
  slow.resolve({ code1: true });
  await settle(h);
  expect(textOf(h.tree)).not.toContain("匹配");
});
it("单个 hash 显式读取与校验，读失败可重试", async () => {
  seedList();
  const h = mount(() => DictionaryListLive());
  button(h.tree, "读取 hash").onPress();
  h.render();
  expect(textOf(h.tree)).toContain("当前服务端 hash（code1）");
  button(h.tree, "校验此 hash").onPress();
  await settle(h);
  expect(mocks.single).toHaveBeenCalledWith({ code: "code1", hashCode: "h" });
  mocks.hash.isError = true;
  mocks.hash.error = new Error("无效字典");
  h.render();
  expect(textOf(h.tree)).toContain("hash 读取失败");
  expect(button(h.tree, "校验此 hash").isDisabled).toBe(true);
});

it("重取失败也永久撤销旧 hash 结果，不能恢复到旧 identity 后再次显示", async () => {
  seedList();
  const h = mount(() => DictionaryListLive());
  button(h.tree, "校验当前页缓存").onPress();
  await settle(h);
  expect(textOf(h.tree)).toContain("匹配");
  mocks.list.isFetching = true;
  h.render();
  mocks.list.isFetching = false;
  mocks.list.isError = true;
  mocks.list.error = new Error("重取失败");
  h.render();
  expect(textOf(h.tree)).toContain("保留上次结果");
  expect(textOf(h.tree)).not.toContain("匹配");
});
