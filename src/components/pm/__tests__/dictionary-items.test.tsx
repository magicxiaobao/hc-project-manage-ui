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
it("findByDictId 管理固定上下文，包括无效项；加载/空/失败/保留旧数据", () => {
  mocks.items.data = [item(9, 0), item(10, "1")];
  const markup = renderToStaticMarkup(<DictionaryItemsDialog open dictId={1} onClose={() => {}} />);
  expect(mocks.itemArgs).toHaveBeenCalledWith(1, true);
  expect(markup).toContain("value9");
  expect(markup).toContain("无效");
  expect(markup).toContain("未知状态");
  expect(markup).not.toContain("删除");
  mocks.items.isError = true;
  mocks.items.error = new Error("重取失败");
  const failed = renderToStaticMarkup(<DictionaryItemsDialog open dictId={1} onClose={() => {}} />);
  expect(failed).toContain("value9");
  expect(failed).toContain("保留上次结果");
  expect(failed).toContain("重试");
  mocks.items.data = undefined;
  mocks.items.isError = false;
  mocks.items.isLoading = true;
  expect(
    renderToStaticMarkup(<DictionaryItemsDialog open dictId={1} onClose={() => {}} />),
  ).toContain("正在加载字典项");
  mocks.items.data = [];
  mocks.items.isLoading = false;
  expect(
    renderToStaticMarkup(<DictionaryItemsDialog open dictId={1} onClose={() => {}} />),
  ).toContain("暂无字典项");
});
it("新增/编辑真实子表单入口固定 dictId，不卸载管理上下文；禁用父行切换", () => {
  const h = mount(() => DictionaryItemsDialog({ open: true, dictId: 1, onClose() {} }));
  button(h.tree, "编辑").onPress();
  h.render();
  const child = nodes(h.tree).find((node) => node.type === DictionaryItemFormDialog)!;
  expect(child.props).toMatchObject({ open: true, itemId: 9, dictionary: row() });
  expect(button(h.tree, "新增字典项").isDisabled).toBe(true);
  expect(textOf(h.tree)).toContain("value9");
  const add = mount(() => DictionaryItemsDialog({ open: true, dictId: 1, onClose() {} }));
  button(add.tree, "新增字典项").onPress();
  add.render();
  expect(
    nodes(add.tree).find((node) => node.type === DictionaryItemFormDialog)?.props,
  ).toMatchObject({ open: true, itemId: null });
});
it("父 Modal 关闭和返回必须经过子 exit 守卫，确认后才关闭父", () => {
  const close = vi.fn();
  const h = mount(() => DictionaryItemsDialog({ open: true, dictId: 1, onClose: close }));
  button(h.tree, "新增字典项").onPress();
  h.render();
  const child = nodes(h.tree).find((node) => node.type === DictionaryItemFormDialog)!;
  const ref = child.props.exitRef as { current: ((action: () => void) => void) | null };
  let pending: (() => void) | null = null;
  ref.current = vi.fn((action) => {
    pending = action;
  });
  button(h.tree, "返回").onPress();
  expect(ref.current).toHaveBeenCalledOnce();
  expect(close).not.toHaveBeenCalled();
  const modal = nodes(h.tree).find((node) => node.props.size === "cover")!;
  (modal.props.onClose as () => void)();
  expect(ref.current).toHaveBeenCalledTimes(2);
  expect(close).not.toHaveBeenCalled();
  (pending as unknown as () => void)();
  h.render();
  expect(close).toHaveBeenCalledOnce();
  expect(nodes(h.tree).find((node) => node.type === DictionaryItemFormDialog)?.props.open).toBe(
    false,
  );
});
it("数字状态正确启停/失败保留列表/未知状态不推断", async () => {
  mocks.items.data = [item(9, 0)];
  mocks.itemValid.mockRejectedValue(new Error("启用失败"));
  const h = mount(() => DictionaryItemsDialog({ open: true, dictId: 1, onClose() {} }));
  button(h.tree, "启用").onPress();
  await settle(h);
  expect(mocks.itemValid).toHaveBeenCalledWith(9);
  expect(textOf(h.tree)).toContain("启用失败");
  expect(textOf(h.tree)).toContain("value9");
  mocks.items.data = [item(9, 1)];
  h.render();
  button(h.tree, "禁用").onPress();
  await settle(h);
  expect(mocks.itemInvalid).toHaveBeenCalledWith(9);
  mocks.items.data = [item(9, "VALID")];
  h.render();
  expect(
    nodes(h.tree).filter(
      (node) =>
        node.props.onPress && ["启用", "禁用"].includes(textOf(node.props.children as ReactNode)),
    ),
  ).toHaveLength(0);
});
it("无权限/无效上下文不给管理操作", () => {
  const invalid = renderToStaticMarkup(
    <DictionaryItemsDialog open dictId={0} onClose={() => {}} />,
  );
  expect(invalid).toContain("字典 ID 无效");
  expect(invalid).not.toContain("新增字典项");
  useAuthStore.setState({ isAuthenticated: false });
  const denied = renderToStaticMarkup(<DictionaryItemsDialog open dictId={1} onClose={() => {}} />);
  expect(denied).toContain("需要系统管理员权限");
  expect(denied).not.toContain("新增字典项");
});
