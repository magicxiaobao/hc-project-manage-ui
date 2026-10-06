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
it("必填标记/aria-required/下拉 label，blocker 在 AppModal 外，错误分支也保留", () => {
  const markup = renderToStaticMarkup(
    <DictionaryFormDialog open dictionaryId={null} onClose={() => {}} />,
  );
  expect(markup).toContain('aria-label="数据类型（必填）"');
  expect(markup).toContain('aria-required="true"');
  expect((markup.match(/（必填）/g) ?? []).length).toBe(4);
  expect(markup.indexOf('data-blocker="true"')).toBeLessThan(markup.indexOf('data-modal="true"'));
  const itemMarkup = renderToStaticMarkup(
    <DictionaryItemFormDialog open itemId={null} dictionary={row()} onClose={() => {}} />,
  );
  expect(itemMarkup).toContain('aria-required="true"');
  expect(itemMarkup).toContain("（必填）");
  mocks.detail.data = undefined;
  mocks.detail.isError = true;
  mocks.detail.error = new Error("详情失败");
  const failed = renderToStaticMarkup(
    <DictionaryFormDialog open dictionaryId={1} onClose={() => {}} />,
  );
  expect(failed).toContain("详情失败");
  expect(failed).toContain('data-blocker="true"');
  expect(failed).toContain('data-discard="true"');
  expect(failed).not.toContain(">保存<");
});
it("全部字段错误一起返回、编辑只清本字段；FieldError role=alert 真实渲染", async () => {
  const h = mount(() => DictionaryFormDialog({ open: true, dictionaryId: null, onClose() {} }));
  const select = nodes(h.tree).find((node) => node.props.label === "数据类型（必填）")!;
  (select.props.onChange as (v: string) => void)("");
  h.render();
  button(h.tree, "创建").onPress();
  await settle(h);
  expect(errors(h)).toEqual(["请输入编码", "请输入名称", "请选择数据类型"]);
  expect(mocks.check).not.toHaveBeenCalled();
  change(h.tree, "编码", "code");
  h.render();
  expect(errors(h)).toEqual(["请输入名称", "请选择数据类型"]);
  const field = nodes(h.tree).find((node) => node.props.message === "请输入名称")!;
  expect(renderToStaticMarkup(field)).toContain('role="alert"');
  const i = mount(() =>
    DictionaryItemFormDialog({ open: true, itemId: null, dictionary: row(), onClose() {} }),
  );
  change(i.tree, "排序", "1.2");
  change(i.tree, "附加属性 JSON", "[]");
  i.render();
  button(i.tree, "创建").onPress();
  await settle(i);
  expect(errors(i)).toEqual(["请输入数据值", "请输入完整整数", "请输入合法 JSON 对象"]);
});
it.each([true, "failure"])(
  "code 预检 %s 错误挂 code，草稿/dirty 不丢，不写入",
  async (response) => {
    const close = vi.fn();
    const h = mount(() => DictionaryFormDialog({ open: true, dictionaryId: null, onClose: close }));
    change(h.tree, "编码", " c ");
    change(h.tree, "名称", " T ");
    h.render();
    if (response === true) mocks.check.mockResolvedValue(true);
    else mocks.check.mockRejectedValue(new Error("网络失败"));
    button(h.tree, "创建").onPress();
    await settle(h);
    expect(mocks.check).toHaveBeenCalledWith("c");
    expect(errors(h)).toEqual([response === true ? "编码已存在" : "无法确认编码唯一性，请重试"]);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(mocks.guards.get(h)?.dirty).toBe(true);
  },
);
it.each([true, "failure"])("value 预检 %s 错误挂 value，禁止写入", async (response) => {
  const h = mount(() =>
    DictionaryItemFormDialog({ open: true, itemId: null, dictionary: row(), onClose() {} }),
  );
  change(h.tree, "数据值", " v ");
  h.render();
  if (response === true) mocks.itemCheck.mockResolvedValue(true);
  else mocks.itemCheck.mockRejectedValue(new Error("失败"));
  button(h.tree, "创建").onPress();
  await settle(h);
  expect(mocks.itemCheck).toHaveBeenCalledWith({ dictId: 1, value: "v" });
  expect(errors(h)).toEqual([
    response === true ? "当前字典中数据值已存在" : "无法确认数据值唯一性，请重试",
  ]);
  expect(mocks.itemCreate).not.toHaveBeenCalled();
});
it("新增项必传空 name；不按 valueType 转换 value；成功 markClean 先于 close", async () => {
  const h = mount(() =>
    DictionaryItemFormDialog({
      open: true,
      itemId: null,
      dictionary: { ...row(), valueType: 3 },
      onClose: () => mocks.events.push("close"),
    }),
  );
  change(h.tree, "数据值", "true");
  h.render();
  button(h.tree, "创建").onPress();
  await settle(h);
  expect(mocks.itemCreate).toHaveBeenCalledWith({
    dictId: 1,
    value: "true",
    name: "",
    sort: 0,
    memo: "",
  });
  expect(mocks.events.slice(-2)).toEqual(["clean", "close"]);
});
it("编辑原值不变跳过预检、清空 name/memo/attributes 正确，不发送上下文字段", async () => {
  const close = vi.fn();
  const h = mount(() =>
    DictionaryItemFormDialog({ open: true, itemId: 9, dictionary: row(), onClose: close }),
  );
  change(h.tree, "显示文本", "");
  change(h.tree, "备注", "");
  change(h.tree, "附加属性 JSON", "");
  h.render();
  button(h.tree, "保存").onPress();
  await settle(h);
  expect(mocks.itemCheck).not.toHaveBeenCalled();
  expect(mocks.itemUpdate).toHaveBeenCalledWith({
    id: 9,
    value: "value9",
    name: "",
    sort: 0,
    attributes: {},
    memo: "",
  });
  expect(close).toHaveBeenCalledOnce();
});
it("编辑 code 只读，不预检且更新无 code；保存失败保留 dirty", async () => {
  const close = vi.fn();
  const h = mount(() => DictionaryFormDialog({ open: true, dictionaryId: 1, onClose: close }));
  expect(nodes(h.tree).find((node) => node.props["aria-label"] === "编码")?.props.isReadOnly).toBe(
    true,
  );
  change(h.tree, "名称", "edited");
  h.render();
  mocks.update.mockRejectedValue(new Error("保存失败"));
  button(h.tree, "保存").onPress();
  await settle(h);
  expect(mocks.check).not.toHaveBeenCalled();
  expect(mocks.update).toHaveBeenCalledWith({ id: 1, title: "edited", valueType: 2, memo: "" });
  expect(textOf(h.tree)).toContain("保存失败");
  expect(close).not.toHaveBeenCalled();
  expect(mocks.events).not.toContain("clean");
  expect(mocks.guards.get(h)?.dirty).toBe(true);
});
it("取消/Modal onClose 汇聚 guard；父退出转发子守卫", () => {
  const close = vi.fn();
  const exitRef = { current: null as ((action: () => void) => void) | null };
  const h = mount(() =>
    DictionaryItemFormDialog({
      open: true,
      itemId: null,
      dictionary: row(),
      onClose: close,
      exitRef,
    }),
  );
  change(h.tree, "备注", " ");
  h.render();
  button(h.tree, "取消").onPress();
  expect(close).not.toHaveBeenCalled();
  expect(mocks.guards.get(h)?.pending).toBeTypeOf("function");
  const modal = nodes(h.tree).find((node) => node.props.title === "新增字典项")!;
  (modal.props.onClose as () => void)();
  expect(close).not.toHaveBeenCalled();
  const parentClose = vi.fn();
  exitRef.current!(parentClose);
  expect(parentClose).not.toHaveBeenCalled();
  mocks.guards.get(h)?.pending?.();
  expect(parentClose).toHaveBeenCalledOnce();
});
it("预检与保存共用 busy，阻止双击和父关闭；失败恢复可重试", async () => {
  const slow = deferred<boolean>();
  mocks.itemCheck.mockReturnValue(slow.promise);
  const exitRef = { current: null as ((action: () => void) => void) | null };
  const close = vi.fn();
  const h = mount(() =>
    DictionaryItemFormDialog({
      open: true,
      itemId: null,
      dictionary: row(),
      onClose: close,
      exitRef,
    }),
  );
  change(h.tree, "数据值", "v");
  h.render();
  const save = button(h.tree, "创建");
  save.onPress();
  save.onPress();
  h.render();
  expect(mocks.itemCheck).toHaveBeenCalledOnce();
  expect(button(h.tree, "保存中…").isDisabled).toBe(true);
  exitRef.current!(close);
  expect(close).not.toHaveBeenCalled();
  slow.reject(new Error("失败"));
  await settle(h);
  expect(button(h.tree, "创建").isDisabled).toBe(false);
  expect(mocks.guards.get(h)?.dirty).toBe(true);
});
it.each(["preflight", "save"])("旧会话 %s 回调不污染新开记录", async (stage) => {
  let open = true;
  let dictionaryId: number | null = null;
  const close = vi.fn();
  const preflight = deferred<boolean>();
  const save = deferred<number>();
  if (stage === "preflight") mocks.check.mockReturnValue(preflight.promise);
  else mocks.create.mockReturnValue(save.promise);
  const h = mount(() => DictionaryFormDialog({ open, dictionaryId, onClose: close }));
  change(h.tree, "编码", "a");
  change(h.tree, "名称", "A");
  h.render();
  button(h.tree, "创建").onPress();
  await settle(h);
  open = false;
  h.render();
  dictionaryId = 1;
  open = true;
  h.render();
  if (stage === "preflight") preflight.resolve(true);
  else save.resolve(1);
  await settle(h);
  expect(errors(h)).toEqual([]);
  expect(close).not.toHaveBeenCalled();
  expect(mocks.events).not.toContain("clean");
  if (stage === "preflight") expect(mocks.create).not.toHaveBeenCalled();
});
it("字段快照失效不重新挂异步错误；重取不覆盖 dirty、错误分支继续挂 blocker", async () => {
  const h = mount(() => DictionaryFormDialog({ open: true, dictionaryId: 1, onClose() {} }));
  change(h.tree, "备注", " draft ");
  h.render();
  mocks.detail.data = { ...row(), memo: "server" };
  mocks.detail.dataUpdatedAt++;
  h.render();
  expect(nodes(h.tree).find((node) => node.props["aria-label"] === "备注")?.props.value).toBe(
    " draft ",
  );
  expect(textOf(h.tree)).toContain("已保留草稿");
  mocks.detail.isError = true;
  mocks.detail.error = new Error("重取失败");
  h.render();
  expect(textOf(h.tree)).toContain("已保留草稿");
  expect(nodes(h.tree).some((node) => node.props["data-blocker"] === "true")).toBe(true);
  const pending = deferred<boolean>();
  mocks.check.mockReturnValue(pending.promise);
  const create = mount(() =>
    DictionaryFormDialog({ open: true, dictionaryId: null, onClose() {} }),
  );
  change(create.tree, "编码", "a");
  change(create.tree, "名称", "A");
  create.render();
  button(create.tree, "创建").onPress();
  change(create.tree, "编码", "b");
  create.render();
  pending.resolve(true);
  await settle(create);
  expect(errors(create)).toEqual([]);
  expect(mocks.create).not.toHaveBeenCalled();
});
it("编辑 itemId+dictId 不匹配和隐藏上下文无效不能提交", () => {
  mocks.itemDetail.data = { ...item(), dictId: 2 };
  const h = mount(() =>
    DictionaryItemFormDialog({ open: true, itemId: 9, dictionary: row(), onClose() {} }),
  );
  expect(
    nodes(h.tree).some(
      (node) => textOf(node.props.children as ReactNode) === "保存" && node.props.onPress,
    ),
  ).toBe(false);
  const invalid = renderToStaticMarkup(
    <DictionaryItemFormDialog open itemId={null} dictionary={undefined} onClose={() => {}} />,
  );
  expect(invalid).toContain("禁止提交");
  expect(invalid).toContain('data-blocker="true"');
});

it("字典创建预检通过后先 markClean 再关闭；保存期间统一 busy", async () => {
  const save = deferred<number>();
  mocks.create.mockReturnValue(save.promise);
  const h = mount(() =>
    DictionaryFormDialog({
      open: true,
      dictionaryId: null,
      onClose: () => mocks.events.push("close"),
    }),
  );
  change(h.tree, "编码", " c ");
  change(h.tree, "名称", " T ");
  h.render();
  button(h.tree, "创建").onPress();
  await settle(h);
  expect(button(h.tree, "保存中…").isDisabled).toBe(true);
  expect(mocks.create).toHaveBeenCalledWith({ code: "c", title: "T", valueType: 2 });
  save.resolve(1);
  await settle(h);
  expect(mocks.events.slice(-2)).toEqual(["clean", "close"]);
});

it("字典取消与 Modal 关闭独立走 dirty guard，还原字段恢复 clean", () => {
  const close = vi.fn();
  const h = mount(() => DictionaryFormDialog({ open: true, dictionaryId: null, onClose: close }));
  change(h.tree, "备注", " ");
  h.render();
  button(h.tree, "取消").onPress();
  expect(close).not.toHaveBeenCalled();
  const modal = nodes(h.tree).find((node) => node.props.title === "新增字典")!;
  (modal.props.onClose as () => void)();
  expect(close).not.toHaveBeenCalled();
  expect(mocks.events).toEqual(["guard", "guard"]);
  change(h.tree, "备注", "");
  h.render();
  expect(mocks.guards.get(h)?.dirty).toBe(false);
});

it.each(["preflight", "save"])("字典项旧会话 %s 回调不影响下次打开", async (stage) => {
  let open = true;
  const close = vi.fn();
  const preflight = deferred<boolean>();
  const save = deferred<number>();
  if (stage === "preflight") mocks.itemCheck.mockReturnValue(preflight.promise);
  else mocks.itemCreate.mockReturnValue(save.promise);
  const h = mount(() =>
    DictionaryItemFormDialog({ open, itemId: null, dictionary: row(), onClose: close }),
  );
  change(h.tree, "数据值", "v");
  h.render();
  button(h.tree, "创建").onPress();
  await settle(h);
  open = false;
  h.render();
  open = true;
  h.render();
  if (stage === "preflight") preflight.resolve(true);
  else save.resolve(9);
  await settle(h);
  expect(errors(h)).toEqual([]);
  expect(close).not.toHaveBeenCalled();
  expect(mocks.events).not.toContain("clean");
  expect(nodes(h.tree).find((node) => node.props["aria-label"] === "数据值")?.props.value).toBe("");
  if (stage === "preflight") expect(mocks.itemCreate).not.toHaveBeenCalled();
});

it("项后台更新不覆盖 JSON 草稿；预检期间详情版本变化禁止旧快照写入", async () => {
  const key = queryKeys.system.list({ kind: "dictionaryItemDetail", itemId: 9, dictId: 1 });
  mocks.client.setQueryData(key, mocks.itemDetail.data, { updatedAt: 1 });
  const h = mount(() =>
    DictionaryItemFormDialog({ open: true, itemId: 9, dictionary: row(), onClose() {} }),
  );
  change(h.tree, "附加属性 JSON", '{"draft":true}');
  change(h.tree, "数据值", "changed");
  h.render();
  const slow = deferred<boolean>();
  mocks.itemCheck.mockReturnValue(slow.promise);
  button(h.tree, "保存").onPress();
  mocks.itemDetail.data = { ...item(), attributes: { server: true } };
  mocks.itemDetail.dataUpdatedAt = 2;
  mocks.client.setQueryData(key, mocks.itemDetail.data, { updatedAt: 2 });
  h.render();
  slow.resolve(false);
  await settle(h);
  expect(mocks.itemUpdate).not.toHaveBeenCalled();
  expect(textOf(h.tree)).toContain("详情在预检期间有更新");
  expect(textOf(h.tree)).toContain("已保留草稿");
  expect(
    nodes(h.tree).find((node) => node.props["aria-label"] === "附加属性 JSON")?.props.value,
  ).toBe('{"draft":true}');
});
