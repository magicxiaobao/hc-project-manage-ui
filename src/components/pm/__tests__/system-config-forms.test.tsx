import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { SystemConfigResponse } from "../../../lib/api/system-types";
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
import { SystemConfigListLive } from "../system-config-list-live";
import { SystemConfigFormDialog } from "../system-config-form-dialog";
import { SystemConfigValueField } from "../system-config-value-field";
const mocks = vi.hoisted(() => ({
  client: null as unknown as QueryClient,
  list: {
    data: undefined as
      | { list: SystemConfigResponse[]; total: number; pageNumber: number; pageSize: number }
      | undefined,
    dataUpdatedAt: 1,
    isError: false,
    isFetching: false,
    isLoading: false,
    isSuccess: true,
    error: null as unknown,
    refetch: vi.fn(),
  },
  detail: {
    data: undefined as SystemConfigResponse | undefined,
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
  validate: vi.fn(),
  valid: vi.fn(),
  invalid: vi.fn(),
  read: vi.fn(),
  listArgs: vi.fn(),
  detailArgs: vi.fn(),
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
  useSystemConfigList: (params: unknown) => {
    mocks.listArgs(params);
    return mocks.list;
  },
  useSystemConfigDetail: (...args: unknown[]) => {
    mocks.detailArgs(...args);
    return mocks.detail;
  },
  useCreateSystemConfig: () => ({ mutateAsync: mocks.create }),
  useUpdateSystemConfig: () => ({ mutateAsync: mocks.update }),
  useCheckConfigKey: () => ({ mutateAsync: mocks.check }),
  useValidateConfigValue: () => ({ mutateAsync: mocks.validate }),
  useValidSystemConfig: () => ({ mutateAsync: mocks.valid }),
  useInvalidSystemConfig: () => ({ mutateAsync: mocks.invalid }),
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
const row = (patch: Partial<SystemConfigResponse> = {}): SystemConfigResponse => ({
  id: 1,
  name: "名称",
  configKey: "key.1",
  configType: "STRING",
  configValue: "text",
  description: "旧描述",
  enabled: true,
  memo: "保留",
  createdAt: 1767225600,
  updatedAt: 1767225601,
  ...patch,
});
const harnesses: DictionaryHookHarness[] = [];
const mount = (component: () => ReturnType<typeof SystemConfigFormDialog>) => {
  const h = new DictionaryHookHarness();
  harnesses.push(h);
  h.render(() => {
    const element = component();
    if (element.type === SystemConfigFormDialog)
      return SystemConfigFormDialog(element.props as Parameters<typeof SystemConfigFormDialog>[0]);
    if (element.type === SystemConfigListLive) return SystemConfigListLive();
    return element;
  });
  return h;
};
const settle = async (h: DictionaryHookHarness) => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  h.render();
};
const errors = (h: DictionaryHookHarness) =>
  nodes(h.tree)
    .flatMap((node) =>
      node.type === SystemConfigValueField
        ? [node.props.error]
        : node.type instanceof Function && node.type.name === "FieldError"
          ? [node.props.message]
          : [],
    )
    .filter(Boolean);
const choose = (h: DictionaryHookHarness, label: string, value: string) => {
  const node = nodes(h.tree).find(
    (node) => node.props.label === label && typeof node.props.onChange === "function",
  );
  if (!node) throw new Error(`Missing select ${label}`);
  (node.props.onChange as (s: string) => void)(value);
  h.render();
};
const value = (h: DictionaryHookHarness, text: string) => {
  const node = nodes(h.tree).find((node) => node.type === SystemConfigValueField)!;
  (node.props.onChange as (s: string) => void)(text);
  h.render();
};
const detail = (record = row(), version = 1) => {
  mocks.detail.data = record;
  mocks.detail.dataUpdatedAt = version;
  mocks.client.setQueryData(
    queryKeys.system.list({ kind: "systemConfigDetail", configId: record.id }),
    record,
    { updatedAt: version },
  );
};
const fill = (h: DictionaryHookHarness) => {
  change(h.tree, "名称", "新名称");
  change(h.tree, "配置键", "中文.key &+#");
  value(h, "raw text");
  h.render();
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.events.length = 0;
  mocks.guards.clear();
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
  Object.assign(mocks.list, {
    data: undefined,
    isError: false,
    isFetching: false,
    isLoading: false,
    isSuccess: true,
  });
  Object.assign(mocks.detail, {
    data: undefined,
    dataUpdatedAt: 1,
    isError: false,
    isFetching: false,
    isLoading: false,
  });
  mocks.check.mockResolvedValue(false);
  mocks.validate.mockResolvedValue(true);
  mocks.create.mockResolvedValue(9);
  mocks.update.mockResolvedValue("ok");
  mocks.valid.mockResolvedValue("ok");
  mocks.invalid.mockResolvedValue("ok");
  mocks.read.mockResolvedValue(row());
  vi.spyOn(mocks.client, "fetchQuery").mockImplementation((options) => {
    const params = options.queryKey[3] as { kind: string; configId?: number };
    if (params.kind === "systemConfigDetail") {
      const payload = mocks.create.mock.calls.at(-1)?.[0] ?? mocks.update.mock.calls.at(-1)?.[0];
      return Promise.resolve(
        row({
          ...payload,
          id: params.configId,
          configType: payload.configType ?? mocks.detail.data?.configType,
        }),
      );
    }
    return mocks.read(options);
  });
});
afterEach(() => {
  harnesses.splice(0).forEach((h) => h.unmount());
  mocks.client.clear();
  useAuthStore.setState(original);
  vi.restoreAllMocks();
});
it("所有必填/全错误就近显示、编辑即清，blocker/dialog 外部常驻", () => {
  const h = mount(() => <SystemConfigFormDialog open configId={null} onClose={() => {}} />);
  choose(h, "数据类型（必填）", "");
  button(h.tree, "创建").onPress();
  h.render();
  expect(errors(h)).toHaveLength(4);
  change(h.tree, "名称", "名称");
  h.render();
  expect(errors(h)).toHaveLength(3);
  const markup = renderToStaticMarkup(h.tree);
  expect(markup).toContain('role="alert"');
  expect(markup).toContain('data-blocker="true"');
  expect(markup).toContain('data-discard="true"');
  const fields = nodes(h.tree).filter(
    (node) => node.props["aria-label"] === "名称" || node.props["aria-label"] === "配置键",
  );
  expect(fields.every((node) => node.props.isRequired === true)).toBe(true);
});
it.each(["string", "number", "boolean", "json"])("%s 受控编辑器及 String 载荷", async (type) => {
  const h = mount(() => (
    <SystemConfigFormDialog
      open
      configId={null}
      onClose={() => {
        mocks.events.push("close");
      }}
    />
  ));
  fill(h);
  choose(h, "数据类型（必填）", type);
  const values: Record<string, string> = {
    string: " raw text ",
    number: " +0000 ",
    boolean: "false",
    json: ' {"a":1} ',
  };
  value(h, values[type]);
  const selected = nodes(h.tree).find((node) => node.type === SystemConfigValueField)!;
  const editor = mount(() =>
    SystemConfigValueField(selected.props as Parameters<typeof SystemConfigValueField>[0]),
  );
  expect(renderToStaticMarkup(editor.tree)).toContain("必填");
  const expected = type === "number" ? "0" : type === "json" ? '{"a":1}' : values[type];
  mocks.read.mockImplementation(async () =>
    row({
      id: 9,
      name: "新名称",
      configKey: "中文.key &+#",
      configType: { string: "STRING", number: "INTEGER", boolean: "BOOLEAN", json: "JSON" }[type],
      configValue: expected,
      description: "",
    }),
  );
  button(h.tree, "创建").onPress();
  await settle(h);
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(mocks.create.mock.calls[0][0].configValue).toBe(expected);
  expect(typeof mocks.create.mock.calls[0][0].configValue).toBe("string");
  expect(mocks.validate).not.toHaveBeenCalled();
  expect(mocks.events.slice(-2)).toEqual(["clean", "close"]);
});
it.each([true, "failure", "malformed"])(
  "唯一性 %s 拒绝，不继续写；改 key 清结论",
  async (result) => {
    if (result === "failure") mocks.check.mockRejectedValue(new Error("failed"));
    else mocks.check.mockResolvedValue(result === "malformed" ? null : result);
    const h = mount(() => <SystemConfigFormDialog open configId={null} onClose={() => {}} />);
    fill(h);
    button(h.tree, "创建").onPress();
    await settle(h);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(errors(h)).toContain(result === true ? "配置键已存在" : "无法确认编码唯一性，请重试");
    change(h.tree, "配置键", "another.key");
    h.render();
    expect(errors(h)).toEqual([]);
  },
);
it("禁用详情来自 findById，原 key 跳过预检，清描述传空、false 保留、未改类型省略", async () => {
  detail(row({ enabled: false }));
  mocks.read.mockResolvedValue(null);
  const h = mount(() => <SystemConfigFormDialog open configId={1} onClose={() => {}} />);
  expect(mocks.detailArgs).toHaveBeenCalledWith(1, true);
  change(h.tree, "描述", "");
  h.render();
  button(h.tree, "保存").onPress();
  await settle(h);
  expect(mocks.update).toHaveBeenCalledWith({
    id: 1,
    name: "名称",
    configKey: "key.1",
    configValue: "text",
    description: "",
    enabled: false,
  });
  expect(mocks.check).not.toHaveBeenCalled();
  expect(mocks.validate).not.toHaveBeenCalled();
});
it("未知存量类型不盲写；明确转换后才发送类型", async () => {
  detail(row({ configType: "NUMBER", configValue: "0", enabled: false }));
  mocks.read.mockResolvedValue(null);
  const h = mount(() => <SystemConfigFormDialog open configId={1} onClose={() => {}} />);
  button(h.tree, "保存").onPress();
  h.render();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(errors(h)).toContain("类型不支持，请明确选择配置类型");
  choose(h, "数据类型（必填）", "number");
  button(h.tree, "保存").onPress();
  await settle(h);
  expect(mocks.update.mock.calls[0][0].configType).toBe("INTEGER");
});
it("改 key 做唯一性预检；改 type/禁用不跑旧类型远程校验", async () => {
  detail();
  const h = mount(() => <SystemConfigFormDialog open configId={1} onClose={() => {}} />);
  change(h.tree, "配置键", "new.key");
  h.render();
  button(h.tree, "保存").onPress();
  await settle(h);
  expect(mocks.check).toHaveBeenCalledWith("new.key");
  expect(mocks.validate).not.toHaveBeenCalled();
});
it.each([false, "failure", null])("适用远程值预检 %s 拒绝并就近报错", async (result) => {
  detail();
  if (result === "failure") mocks.validate.mockRejectedValue(new Error("failed"));
  else mocks.validate.mockResolvedValue(result);
  const h = mount(() => <SystemConfigFormDialog open configId={1} onClose={() => {}} />);
  value(h, "new value");
  button(h.tree, "保存").onPress();
  await settle(h);
  expect(mocks.update).not.toHaveBeenCalled();
  expect(errors(h).join("")).toContain(result === false ? "未通过" : "无法确认");
  expect(mocks.check).not.toHaveBeenCalled();
  value(h, "other");
  expect(errors(h)).toEqual([]);
});
it("本地坏 JSON 即使 remote=true 也不写", async () => {
  detail(row({ configType: "JSON", configValue: '{"a":1}' }));
  const h = mount(() => <SystemConfigFormDialog open configId={1} onClose={() => {}} />);
  value(h, "{bad");
  button(h.tree, "保存").onPress();
  await settle(h);
  expect(mocks.validate).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});
it("重复提交只写一次；预检及写入期间主动关闭禁用", async () => {
  const wait = deferred<boolean>();
  mocks.check.mockReturnValue(wait.promise);
  const h = mount(() => (
    <SystemConfigFormDialog
      open
      configId={null}
      onClose={() => {
        mocks.events.push("close");
      }}
    />
  ));
  fill(h);
  button(h.tree, "创建").onPress();
  button(h.tree, "创建").onPress();
  h.render();
  button(h.tree, "取消").onPress();
  expect(mocks.events).not.toContain("close");
  expect(mocks.check).toHaveBeenCalledOnce();
  wait.resolve(false);
  await settle(h);
  expect(mocks.create).toHaveBeenCalledOnce();
});
it.each(["record", "reopen", "permission"])("会话 %s 改变使迟到预检失效", async (kind) => {
  let open = true,
    id: number | null = null;
  const wait = deferred<boolean>();
  mocks.check.mockReturnValue(wait.promise);
  const h = mount(() => (
    <SystemConfigFormDialog
      open={open}
      configId={id}
      onClose={() => {
        mocks.events.push("close");
      }}
    />
  ));
  fill(h);
  button(h.tree, "创建").onPress();
  if (kind === "record") id = 2;
  else if (kind === "permission") useAuthStore.setState({ isAuthenticated: false });
  else {
    open = false;
    h.render();
    open = true;
  }
  h.render();
  wait.resolve(false);
  await settle(h);
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.events).not.toContain("clean");
  expect(mocks.events).not.toContain("close");
});
it("迟到写成功不关闭下一会话", async () => {
  let open = true;
  const write = deferred<number>();
  mocks.create.mockReturnValue(write.promise);
  const h = mount(() => (
    <SystemConfigFormDialog
      open={open}
      configId={null}
      onClose={() => {
        mocks.events.push("close");
      }}
    />
  ));
  fill(h);
  button(h.tree, "创建").onPress();
  await settle(h);
  open = false;
  h.render();
  open = true;
  h.render();
  write.resolve(9);
  await settle(h);
  expect(mocks.events).not.toContain("clean");
  expect(mocks.events).not.toContain("close");
});
it("取消/AppModal X遮罩Escape 同一 guard，继续编辑不清草稿，失败不 clean，重开重新保护", async () => {
  let open = true;
  const h = mount(() => (
    <SystemConfigFormDialog
      open={open}
      configId={null}
      onClose={() => {
        open = false;
        mocks.events.push("close");
      }}
    />
  ));
  fill(h);
  button(h.tree, "取消").onPress();
  expect(mocks.guards.get(h)?.pending).toBeTypeOf("function");
  expect(mocks.events).not.toContain("close");
  mocks.guards.get(h)!.pending = null;
  const modal = nodes(h.tree).find((node) => node.props.title === "新增配置")!;
  (modal.props.onClose as () => void)();
  expect(mocks.guards.get(h)?.pending).toBeTypeOf("function");
  expect(textOf(h.tree)).toContain("取消");
  mocks.create.mockRejectedValue(new Error("保存失败"));
  mocks.guards.get(h)!.pending = null;
  button(h.tree, "创建").onPress();
  await settle(h);
  expect(mocks.guards.get(h)?.dirty).toBe(true);
  expect(mocks.events).not.toContain("clean");
  mocks.guards.get(h)!.pending?.();
  h.render();
  open = true;
  h.render();
  fill(h);
  button(h.tree, "取消").onPress();
  expect(mocks.guards.get(h)?.pending).toBeTypeOf("function");
});
it("保存成功读回失败可重试，保存按钮锁定不再 create，读取失败已 clean", async () => {
  mocks.read.mockRejectedValue(new Error("read failed"));
  const h = mount(() => (
    <SystemConfigFormDialog
      open
      configId={null}
      onClose={() => {
        mocks.events.push("close");
      }}
    />
  ));
  fill(h);
  button(h.tree, "创建").onPress();
  await settle(h);
  expect(textOf(h.tree)).toContain("已保存，读取验证失败");
  expect(mocks.events).toContain("clean");
  expect(mocks.events).not.toContain("close");
  expect(mocks.guards.get(h)?.dirty).toBe(false);
  button(h.tree, "创建").onPress();
  expect(mocks.create).toHaveBeenCalledOnce();
  mocks.read.mockResolvedValue(
    row({
      id: 9,
      name: "新名称",
      configKey: "中文.key &+#",
      configValue: "raw text",
      description: "",
    }),
  );
  button(h.tree, "重试读取验证").onPress();
  await settle(h);
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(mocks.events.at(-1)).toBe("close");
});
it("后台重取保留用户已改字段，预检期间版本变化不写，错误分支 guard 常驻", async () => {
  detail();
  const wait = deferred<boolean>();
  mocks.validate.mockReturnValue(wait.promise);
  const h = mount(() => <SystemConfigFormDialog open configId={1} onClose={() => {}} />);
  value(h, "user changed");
  button(h.tree, "保存").onPress();
  detail(row({ description: "server changed" }), 2);
  h.render();
  wait.resolve(true);
  await settle(h);
  expect(mocks.update).not.toHaveBeenCalled();
  expect(textOf(h.tree)).toContain("请复核");
  expect(nodes(h.tree).find((node) => node.type === SystemConfigValueField)?.props.value).toBe(
    "user changed",
  );
  mocks.detail.isError = true;
  h.render();
  expect(renderToStaticMarkup(h.tree)).toContain('data-blocker="true"');
});
it("列表筛选草稿不请求，搜索/同参refetch/Enter/分页/pageSize/重置真实 params", () => {
  mocks.list.data = { list: [row()], total: 30, pageNumber: 1, pageSize: 10 };
  const h = mount(() => <SystemConfigListLive />);
  change(h.tree, "配置键筛选", " key.1 ");
  h.render();
  expect(mocks.listArgs.mock.calls.at(-1)?.[0].bean).toEqual({});
  choose(h, "类型筛选", "number");
  button(h.tree, "搜索").onPress();
  h.render();
  expect(mocks.listArgs.mock.calls.at(-1)?.[0]).toEqual({
    page: 1,
    pageSize: 10,
    bean: { configKey: "key.1", configType: "INTEGER" },
  });
  button(h.tree, "搜索").onPress();
  expect(mocks.list.refetch).toHaveBeenCalledOnce();
  button(h.tree, "下一页").onPress();
  h.render();
  expect(mocks.listArgs.mock.calls.at(-1)?.[0].page).toBe(2);
  choose(h, "每页条数", "20");
  expect(mocks.listArgs.mock.calls.at(-1)?.[0]).toMatchObject({ page: 1, pageSize: 20 });
  change(h.tree, "配置键筛选", "other");
  h.render();
  const input = nodes(h.tree).find((node) => typeof node.props.onKeyDown === "function")!;
  (input.props.onKeyDown as (e: { key: string }) => void)({ key: "Enter" });
  h.render();
  expect(mocks.listArgs.mock.calls.at(-1)?.[0].bean.configKey).toBe("other");
  button(h.tree, "重置").onPress();
  h.render();
  expect(mocks.listArgs.mock.calls.at(-1)?.[0]).toEqual({ page: 1, pageSize: 20, bean: {} });
});
it("列表 loading/empty/error/retry，未知 enabled 不猜操作，未知 type 原值提示，原文查看，无删除", async () => {
  const h = mount(() => <SystemConfigListLive />);
  mocks.list.isLoading = true;
  h.render();
  expect(textOf(h.tree)).toContain("正在加载");
  mocks.list.isLoading = false;
  mocks.list.isError = true;
  mocks.list.isSuccess = false;
  h.render();
  expect(textOf(h.tree)).toContain("加载失败");
  expect(textOf(h.tree)).not.toContain("暂无配置");
  button(h.tree, "重试").onPress();
  expect(mocks.list.refetch).toHaveBeenCalled();
  mocks.list.isError = false;
  mocks.list.isSuccess = true;
  mocks.list.data = { list: [], total: 0, pageNumber: 1, pageSize: 10 };
  h.render();
  expect(textOf(h.tree)).toContain("暂无配置");
  mocks.list.data.list = [
    row({ enabled: null, configType: "NUMBER", configValue: "x".repeat(90) }),
  ];
  h.render();
  expect(textOf(h.tree)).toContain("NUMBER（未知类型");
  expect(
    nodes(h.tree)
      .filter((node) => typeof node.props.onPress === "function")
      .map((node) => textOf(node.props.children as ReactNode)),
  ).not.toContain("禁用");
  expect(textOf(h.tree)).not.toContain("删除");
  button(h.tree, "查看原文").onPress();
  h.render();
  expect(textOf(h.tree)).toContain("x".repeat(90));
});
it.each([true, false])("行操作 enabled=%s 严格接线防重复，失败反馈", async (enabled) => {
  mocks.list.data = { list: [row({ enabled })], total: 1, pageNumber: 1, pageSize: 10 };
  const wait = deferred<string>();
  const action = enabled ? mocks.invalid : mocks.valid;
  action.mockReturnValue(wait.promise);
  const h = mount(() => <SystemConfigListLive />);
  button(h.tree, enabled ? "禁用" : "启用").onPress();
  button(h.tree, enabled ? "禁用" : "启用").onPress();
  h.render();
  expect(action).toHaveBeenCalledOnce();
  expect(action).toHaveBeenCalledWith(1);
  wait.reject(new Error("failed"));
  await settle(h);
  expect(textOf(h.tree)).toContain("操作失败");
});
it("类型切换保留 raw、只清类型/值错误；布尔 isRequired 和明确选择实际回调", () => {
  const h = mount(() => <SystemConfigFormDialog open configId={null} onClose={() => {}} />);
  value(h, "bad raw");
  button(h.tree, "创建").onPress();
  h.render();
  choose(h, "数据类型（必填）", "boolean");
  expect(errors(h)).toEqual(["请输入配置键", "请输入名称"]);
  const field = nodes(h.tree).find((node) => node.type === SystemConfigValueField)!;
  expect(field.props.value).toBe("bad raw");
  const editor = mount(() =>
    SystemConfigValueField(field.props as Parameters<typeof SystemConfigValueField>[0]),
  );
  const select = nodes(editor.tree).find((node) => node.props.label === "配置值（必填）")!;
  expect(select.props.isRequired).toBe(true);
  expect(select.props.value).toBe("");
  (select.props.onChange as (value: string) => void)("false");
  h.render();
  expect(nodes(h.tree).find((node) => node.type === SystemConfigValueField)?.props.value).toBe(
    "false",
  );
  choose(h, "数据类型（必填）", "string");
  expect(nodes(h.tree).find((node) => node.type === SystemConfigValueField)?.props.value).toBe(
    "false",
  );
});
it.each(["string", "number", "json"])("%s 文本控件实际编辑回调保持 String", (type) => {
  const changed = vi.fn();
  const h = mount(() => SystemConfigValueField({ type, value: "", onChange: changed }));
  change(h.tree, "配置值", type === "number" ? "-" : "raw\ntext");
  expect(changed).toHaveBeenCalledWith(type === "number" ? "-" : "raw\ntext");
});
it("详情初次失败/loading/无权分支也独立渲染 guard；无权列表不展示旧数据", () => {
  mocks.detail.isError = true;
  mocks.detail.error = new Error("detail failed");
  const h = mount(() => <SystemConfigFormDialog open configId={1} onClose={() => {}} />);
  expect(textOf(h.tree)).toContain("加载失败");
  expect(renderToStaticMarkup(h.tree)).toContain('data-blocker="true"');
  expect(nodes(h.tree).some((node) => textOf(node.props.children as ReactNode) === "保存")).toBe(
    false,
  );
  mocks.detail.isError = false;
  h.render();
  expect(textOf(h.tree)).toContain("正在加载");
  mocks.list.data = { list: [row({ name: "secret-name" })], total: 1, pageNumber: 1, pageSize: 10 };
  useAuthStore.setState({ isAuthenticated: false });
  h.render();
  expect(textOf(h.tree)).toContain("管理员权限");
  expect(renderToStaticMarkup(h.tree)).toContain('data-discard="true"');
  const list = mount(() => <SystemConfigListLive />);
  expect(textOf(list.tree)).not.toContain("secret-name");
  expect(textOf(list.tree)).toContain("管理员权限");
});
it("保存读取迟到不污染关闭重开的会话", async () => {
  const read = deferred<SystemConfigResponse>();
  mocks.read.mockReturnValue(read.promise);
  let open = true;
  const h = mount(() => (
    <SystemConfigFormDialog
      open={open}
      configId={null}
      onClose={() => {
        mocks.events.push("close");
      }}
    />
  ));
  fill(h);
  button(h.tree, "创建").onPress();
  await settle(h);
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(mocks.events).toContain("clean");
  open = false;
  h.render();
  open = true;
  h.render();
  fill(h);
  read.reject(new Error("old failure"));
  await settle(h);
  expect(textOf(h.tree)).not.toContain("old failure");
  expect(mocks.events).not.toContain("close");
  expect(mocks.guards.get(h)?.dirty).toBe(true);
});
it("保存关闭后重开再修改重新布防；clean 在 close 前", async () => {
  let open = true;
  mocks.read.mockResolvedValue(
    row({
      id: 9,
      name: "新名称",
      configKey: "中文.key &+#",
      configValue: "raw text",
      description: "",
    }),
  );
  const h = mount(() => (
    <SystemConfigFormDialog
      open={open}
      configId={null}
      onClose={() => {
        mocks.events.push("close");
        open = false;
      }}
    />
  ));
  fill(h);
  button(h.tree, "创建").onPress();
  await settle(h);
  expect(mocks.events.slice(-2)).toEqual(["clean", "close"]);
  h.render();
  open = true;
  h.render();
  change(h.tree, "名称", "again");
  h.render();
  button(h.tree, "取消").onPress();
  expect(mocks.guards.get(h)?.pending).toBeTypeOf("function");
});
it("禁用保存按键 null 后还校验 findById 的内容，读回不符仅重试读取", async () => {
  detail(row({ enabled: false }));
  mocks.read.mockResolvedValue(null);
  vi.mocked(mocks.client.fetchQuery).mockImplementation(async (options) => {
    const params = options.queryKey[3] as { kind: string };
    return params.kind === "systemConfigByKey"
      ? null
      : row({ enabled: false, configValue: "stale" });
  });
  const h = mount(() => (
    <SystemConfigFormDialog
      open
      configId={1}
      onClose={() => {
        mocks.events.push("close");
      }}
    />
  ));
  value(h, "new");
  button(h.tree, "保存").onPress();
  await settle(h);
  expect(mocks.update).toHaveBeenCalledOnce();
  expect(textOf(h.tree)).toContain("已保存，读取验证失败");
  expect(mocks.events).not.toContain("close");
});
it("后台重取脏表单保持整个 raw 草稿和 baseline，显式复核才同步未改字段", async () => {
  detail();
  const h = mount(() => <SystemConfigFormDialog open configId={1} onClose={() => {}} />);
  value(h, "user changed");
  detail(row({ description: "server changed", configValue: "server value" }), 2);
  h.render();
  expect(nodes(h.tree).find((node) => node.props["aria-label"] === "描述")?.props.value).toBe(
    "旧描述",
  );
  expect(nodes(h.tree).find((node) => node.type === SystemConfigValueField)?.props.value).toBe(
    "user changed",
  );
  expect(mocks.guards.get(h)?.dirty).toBe(true);
  button(h.tree, "保存").onPress();
  await settle(h);
  expect(mocks.update).not.toHaveBeenCalled();
  expect(textOf(h.tree)).toContain("请复核");
  button(h.tree, "复核后台更新").onPress();
  h.render();
  expect(nodes(h.tree).find((node) => node.props["aria-label"] === "描述")?.props.value).toBe(
    "server changed",
  );
  expect(nodes(h.tree).find((node) => node.type === SystemConfigValueField)?.props.value).toBe(
    "user changed",
  );
  expect(mocks.guards.get(h)?.dirty).toBe(true);
});
