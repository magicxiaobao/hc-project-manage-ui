import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
  type QueryObserverOptions,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { traceabilityRelationApi } from "../../api/trace";
import { defectApi } from "../../api/defect";
import type { DefectResponse } from "../../api/defect-types";
import { testCaseApi } from "../../api/test-case";
import { useAuthStore } from "../../api/auth-store";
import { ApiBusinessError } from "../../api/client";
import { relationPayload } from "../../trace-relations";
import { batchRelationFixture, relationFixture } from "../../__tests__/fixtures/trace-relations";
import { queryKeys } from "../keys";
import { setQueryCacheClearer, clearQueryCache } from "../session";
import {
  useTraceRelations,
  useLinkTraceRelation,
  useUnlinkTraceRelation,
  useTraceRelationCandidates,
  useTraceObjectTitle,
} from "../hooks/useTraceRelations";
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// SSR 不订阅 zustand，用当前会话快照验证实际门控。
vi.mock("../../api/auth-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/auth-store")>();
  return {
    ...actual,
    useAuthStore: Object.assign(
      (selector: (state: ReturnType<typeof actual.useAuthStore.getState>) => unknown) =>
        selector(actual.useAuthStore.getState()),
      actual.useAuthStore,
    ),
  };
});
const row = relationFixture();
const payload = relationPayload(row);
const clients: QueryClient[] = [];
const makeClient = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: 3 } },
  });
  clients.push(client);
  return client;
};
function renderHook<T>(client: QueryClient, hook: () => T): T {
  let result: T;
  function Probe() {
    result = hook();
    return null;
  }
  renderToString(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  );
  return result!;
}
beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  useAuthStore.setState({ isAuthenticated: true });
});
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  setQueryCacheClearer(null);
  useAuthStore.setState({ isAuthenticated: false });
});
describe("关联读取", () => {
  it.each([null, 0, -1, NaN, Number.MAX_SAFE_INTEGER + 1])("非法项目 %s 禁用", (projectId) => {
    const client = makeClient();
    renderHook(client, () =>
      useTraceRelations({ projectId, objects: [row.sourceObject], contextVerified: true }),
    );
    expect((client.getQueryCache().getAll()[0].options as QueryObserverOptions).enabled).toBe(
      false,
    );
  });
  it("未登录、归属未确认、空对象及非法对象均禁用", () => {
    const client = makeClient();
    renderHook(client, () => {
      useTraceRelations({ projectId: 7, objects: [row.sourceObject] });
      useTraceRelations({ projectId: 7, objects: [], contextVerified: true });
      useTraceRelations({
        projectId: 7,
        objects: [{ objectType: "TASK", objectId: 0 }],
        contextVerified: true,
      });
    });
    useAuthStore.setState({ isAuthenticated: false });
    renderHook(client, () =>
      useTraceRelations({ projectId: 8, objects: [row.targetObject], contextVerified: true }),
    );
    expect(
      client
        .getQueryCache()
        .getAll()
        .every((query) => (query.options as QueryObserverOptions).enabled === false),
    ).toBe(true);
  });
  it("参数去重排序共享缓存，项目不同区分；请求不携带 projectId", async () => {
    const client = makeClient();
    const spy = vi
      .spyOn(traceabilityRelationApi, "batchQuery")
      .mockResolvedValue(batchRelationFixture());
    const hook = renderHook(client, () =>
      useTraceRelations({
        projectId: 7,
        objects: [row.sourceObject, row.targetObject, row.sourceObject],
        relationTypes: ["TASK_IMPLEMENTS_REQUIREMENT", "TASK_IMPLEMENTS_REQUIREMENT"],
        contextVerified: true,
      }),
    );
    renderHook(client, () =>
      useTraceRelations({
        projectId: 7,
        objects: [row.targetObject, row.sourceObject],
        relationTypes: ["TASK_IMPLEMENTS_REQUIREMENT"],
        contextVerified: true,
      }),
    );
    expect(client.getQueryCache().getAll()).toHaveLength(1);
    expect((await hook.refetch({ throwOnError: true })).data).toEqual(batchRelationFixture());
    expect(spy).toHaveBeenCalledWith({
      objects: [row.targetObject, row.sourceObject],
      direction: "BOTH",
      relationTypes: ["TASK_IMPLEMENTS_REQUIREMENT"],
      activeOnly: true,
    });
    expect(queryKeys.traceRelation.batch(7, [row.sourceObject])).not.toEqual(
      queryKeys.traceRelation.batch(8, [row.sourceObject]),
    );
  });
  it("畸形响应、缺分组、错误项目均失败；后台失败保留旧数据", async () => {
    const client = makeClient();
    const hook = renderHook(client, () =>
      useTraceRelations({ projectId: 7, objects: [row.sourceObject], contextVerified: true }),
    );
    const spy = vi
      .spyOn(traceabilityRelationApi, "batchQuery")
      .mockResolvedValue(batchRelationFixture());
    await hook.refetch({ throwOnError: true });
    const key = queryKeys.traceRelation.batch(7, [row.sourceObject]);
    for (const invalid of [
      { items: [] },
      { items: [{ object: row.sourceObject, outgoing: null, incoming: [] }] },
      batchRelationFixture(relationFixture({ projectId: 8 })),
    ]) {
      spy.mockResolvedValue(invalid as ReturnType<typeof batchRelationFixture>);
      await expect(hook.refetch({ throwOnError: true })).rejects.toThrow("契约错误");
      expect(client.getQueryData(key)).toEqual(batchRelationFixture());
    }
  });
  it.each(["DEFECT", "TEST_CASE"])(
    "%s 候选分页按项目+title查询，排除无效/跨项目对象",
    async (type) => {
      const client = makeClient();
      const api = type === "DEFECT" ? defectApi : testCaseApi;
      const spy = vi.spyOn(api, "findByPage").mockResolvedValue({
        list: [
          { id: 2, title: "同项目", projectId: 7 },
          { id: 3, title: "跨项目", projectId: 8 },
          { id: 0, title: "无效 ID", projectId: 7 },
          { id: 4, title: null, projectId: null },
        ],
        total: 24,
        pageNumber: 2,
        pageSize: 20,
      });
      const hook = renderHook(client, () => useTraceRelationCandidates(type, 7, 2, " 标题 ", true));
      await hook.refetch({ throwOnError: true });
      expect(spy).toHaveBeenCalledWith({
        page: 2,
        pageSize: 20,
        bean: { projectId: 7, title: "标题" },
      });
      const current = renderHook(client, () =>
        useTraceRelationCandidates(type, 7, 2, "标题", true),
      );
      expect(current.candidates).toEqual([{ id: 2, title: "同项目", projectId: 7 }]);
    },
  );
  it("未确认/未登录不启用任何候选类型", () => {
    const client = makeClient();
    for (const type of ["TASK", "REQUIREMENT", "DEFECT", "TEST_CASE"])
      renderHook(client, () => useTraceRelationCandidates(type, 7, 1, "", false));
    useAuthStore.setState({ isAuthenticated: false });
    for (const type of ["TASK", "REQUIREMENT", "DEFECT", "TEST_CASE"])
      renderHook(client, () => useTraceRelationCandidates(type, 8, 1, "", true));
    expect(
      client
        .getQueryCache()
        .getAll()
        .every((query) => (query.options as QueryObserverOptions).enabled === false),
    ).toBe(true);
  });
  it("标题按 ID 读取，保留既有详情缓存结构并校验项目归属", async () => {
    const client = makeClient();
    const object = { objectType: "DEFECT" as const, objectId: 3 };
    const row = { id: 3, projectId: 7, title: "标题" } as DefectResponse;
    const spy = vi.spyOn(defectApi, "findById").mockResolvedValue(row);
    const hook = renderHook(client, () => useTraceObjectTitle(object, 7, true));
    expect((await hook.refetch({ throwOnError: true })).data).toEqual(row);
    expect(spy).toHaveBeenCalledWith(3);
    expect(client.getQueryData(queryKeys.defect.detail(3))).toEqual(row);
    spy.mockResolvedValue({ ...row, projectId: 8 } as DefectResponse);
    await expect(hook.refetch({ throwOnError: true })).rejects.toThrow("归属不匹配");
    expect(client.getQueryData(queryKeys.defect.detail(3))).toEqual(row);
  });
  it("额外三类对象不请求标题模块", () => {
    const client = makeClient();
    for (const objectType of ["TEST_RUN", "TEST_EXECUTION", "VERSION"] as const)
      renderHook(client, () => useTraceObjectTitle({ objectType, objectId: 4 }, 7, true));
    expect(
      client
        .getQueryCache()
        .getAll()
        .every((query) => (query.options as QueryObserverOptions).enabled === false),
    ).toBe(true);
  });
  it("会话清理覆盖新域", () => {
    const client = makeClient();
    client.setQueryData(
      queryKeys.traceRelation.batch(7, [row.sourceObject]),
      batchRelationFixture(),
    );
    client.setQueryData(queryKeys.defect.detail(2), { title: "旧会话" });
    client.setQueryData(queryKeys.testCase.list({}), { list: [] });
    setQueryCacheClearer(() => {
      void client.cancelQueries();
      client.clear();
    });
    clearQueryCache();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
});
const keys = [
  queryKeys.traceRelation.batch(7, [row.sourceObject]),
  queryKeys.traceRelation.batch(7, [row.targetObject]),
  queryKeys.traceRelation.batch(
    7,
    [row.sourceObject, row.targetObject],
    ["TASK_IMPLEMENTS_REQUIREMENT"],
  ),
  [...queryKeys.traceRelation.all, "batch", 7, { direction: "INCOMING", activeOnly: false }],
  queryKeys.requirement.trace(101),
  queryKeys.requirement.impact(101),
  queryKeys.requirement.matrix({ page: 1, pageSize: 20, bean: { projectId: 7 } }),
];
describe("关联写入缓存联动", () => {
  it.each(["link", "unlink"] as const)(
    "%s 成功失效整个 batch 域与既有 trace/impact/matrix",
    async (kind) => {
      const client = makeClient();
      keys.forEach((key) => client.setQueryData(key, "旧数据"));
      client.setQueryData(queryKeys.taskDependency.predecessors(201), []);
      client.setQueryData(queryKeys.requirement.detail(101), "需求详情");
      vi.spyOn(traceabilityRelationApi, kind).mockResolvedValue(
        kind === "link" ? row : relationFixture({ status: "INACTIVE", inactiveReason: "误关联" }),
      );
      if (kind === "link") await renderHook(client, useLinkTraceRelation).mutateAsync(payload);
      else
        await renderHook(client, useUnlinkTraceRelation).mutateAsync({
          ...payload,
          reason: "误关联",
        });
      keys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(true));
      expect(client.getQueryState(queryKeys.taskDependency.predecessors(201))?.isInvalidated).toBe(
        false,
      );
      expect(client.getQueryState(queryKeys.requirement.detail(101))?.isInvalidated).toBe(false);
      expect(toast.success).toHaveBeenCalledOnce();
    },
  );
  it.each(["link", "unlink"] as const)("%s 挂载的另一端与矩阵权威重查", async (kind) => {
    const client = makeClient();
    const reads = keys.map((key) => {
      client.setQueryData(key, ["旧"]);
      const queryFn = vi.fn().mockResolvedValue(["新"]);
      const observer = new QueryObserver(client, { queryKey: key, queryFn });
      const stop = observer.subscribe(() => {});
      return { key, queryFn, stop };
    });
    vi.spyOn(traceabilityRelationApi, kind).mockResolvedValue(
      kind === "link" ? row : relationFixture({ status: "INACTIVE", inactiveReason: "误关联" }),
    );
    if (kind === "link") await renderHook(client, useLinkTraceRelation).mutateAsync(payload);
    else
      await renderHook(client, useUnlinkTraceRelation).mutateAsync({
        ...payload,
        reason: "误关联",
      });
    await vi.waitFor(() => reads.forEach((read) => expect(read.queryFn).toHaveBeenCalledOnce()));
    reads.forEach((read) => {
      expect(client.getQueryData(read.key)).toEqual(["新"]);
      read.stop();
    });
  });
  it.each([10015, 10018, 10019])(
    "业务写失败 %s 不成功、不失效、不重试、不 relink",
    async (code) => {
      const client = makeClient();
      keys.forEach((key) => client.setQueryData(key, []));
      const error = new ApiBusinessError({ code, msg: "业务拒绝", result: null });
      const spy = vi.spyOn(traceabilityRelationApi, "link").mockRejectedValue(error);
      const relink = vi.spyOn(traceabilityRelationApi, "relink");
      await expect(renderHook(client, useLinkTraceRelation).mutateAsync(payload)).rejects.toBe(
        error,
      );
      expect(spy).toHaveBeenCalledOnce();
      expect(relink).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
      keys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(false));
    },
  );
  it("缺字段的合成失败保留调用者草稿，不成功失效", async () => {
    const client = makeClient();
    keys.forEach((key) => client.setQueryData(key, []));
    const draft = { ...payload };
    const error = new ApiBusinessError({ code: 0, msg: "合成的非字段错误", result: null });
    vi.spyOn(traceabilityRelationApi, "link").mockRejectedValue(error);
    await expect(renderHook(client, useLinkTraceRelation).mutateAsync(draft)).rejects.toBe(error);
    expect(draft).toEqual(payload);
    expect(toast.error).toHaveBeenCalledWith("合成的非字段错误");
    expect(toast.success).not.toHaveBeenCalled();
    keys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(false));
  });
  it("写入结果畸形或解除仍 ACTIVE 时要求重查，不发成功提示", async () => {
    const client = makeClient();
    vi.spyOn(traceabilityRelationApi, "link").mockResolvedValue({} as typeof row);
    vi.spyOn(traceabilityRelationApi, "unlink").mockResolvedValue(row);
    await expect(renderHook(client, useLinkTraceRelation).mutateAsync(payload)).rejects.toThrow(
      "契约错误",
    );
    await expect(
      renderHook(client, useUnlinkTraceRelation).mutateAsync({ ...payload, reason: "误关联" }),
    ).rejects.toThrow("契约错误");
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("请先重查关联"));
  });
  it("unlink 网络失败不重试，不宣称已解除，提示先重查", async () => {
    const client = makeClient();
    const spy = vi
      .spyOn(traceabilityRelationApi, "unlink")
      .mockRejectedValue(new TypeError("网络中断"));
    await expect(
      renderHook(client, useUnlinkTraceRelation).mutateAsync({ ...payload, reason: "误关联" }),
    ).rejects.toThrow("网络中断");
    expect(spy).toHaveBeenCalledOnce();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("请先重查关联"));
  });
  it("写成功后重读失败仍是成功，保留旧数据并提示读取失败", async () => {
    const client = makeClient();
    const key = keys[1];
    client.setQueryData(key, batchRelationFixture());
    const queryFn = vi.fn().mockRejectedValue(new Error("重读失败"));
    const observer = new QueryObserver(client, { queryKey: key, queryFn });
    const stop = observer.subscribe(() => {});
    const spy = vi
      .spyOn(traceabilityRelationApi, "unlink")
      .mockResolvedValue(relationFixture({ status: "INACTIVE", inactiveReason: "误关联" }));
    expect(
      (
        await renderHook(client, useUnlinkTraceRelation).mutateAsync({
          ...payload,
          reason: "误关联",
        })
      ).status,
    ).toBe("INACTIVE");
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("操作已成功，刷新失败，请重试读取"),
    );
    expect(client.getQueryData(key)).toEqual(batchRelationFixture());
    expect(spy).toHaveBeenCalledOnce();
    expect(queryFn).toHaveBeenCalledOnce();
    stop();
  });
});
