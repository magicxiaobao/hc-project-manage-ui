import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { renderToString } from "react-dom/server";
import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
  type QueryObserverOptions,
} from "@tanstack/react-query";
import { taskDependencyApi } from "../../api/task-dependency";
import type { TaskDependencyResponse } from "../../api/task-dependency-types";
import { queryKeys } from "../keys";
import {
  fetchAllTaskDependencies,
  useTaskDependencyListAll,
  useTaskDependencyStatistics,
  useDependencyConflicts,
  useTaskPredecessors,
  useTaskSuccessors,
  useCheckCircularDependency,
  useCreateTaskDependency,
  useInvalidTaskDependency,
  useBatchDeleteTaskDependencies,
} from "../hooks/useTaskDependencies";
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const payload = {
  predecessorId: 1,
  successorId: 2,
  projectId: 7,
  dependencyType: "finish-to-start",
  lag: 3,
  description: "等待验收",
};
const row = (id: number): TaskDependencyResponse => ({
  id,
  predecessorId: 1,
  successorId: 2,
  projectId: 7,
  createdAt: null,
  updatedAt: null,
});
const makeClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: 3 } },
  });
beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
function renderHook<T>(client: QueryClient, hook: () => T): T {
  let value: T;
  function Probe() {
    value = hook();
    return null;
  }
  renderToString(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  );
  return value!;
}
describe("读取门控与缓存 key", () => {
  it.each([undefined, null, 0, -1, Number.MAX_SAFE_INTEGER + 1, NaN])(
    "项目/任务 ID %s 全部禁用",
    (id) => {
      const client = makeClient();
      renderHook(client, () => {
        useTaskDependencyListAll({ projectId: id });
        useTaskDependencyStatistics(id);
        useDependencyConflicts(id, true);
        useTaskPredecessors(id, true);
        useTaskSuccessors(id, true);
      });
      expect(
        client
          .getQueryCache()
          .getAll()
          .every((query) => (query.options as QueryObserverOptions).enabled === false),
      ).toBe(true);
      client.clear();
    },
  );
  it("详情归属未确认禁用、冲突初始不自动查询", () => {
    const client = makeClient();
    renderHook(client, () => {
      useTaskPredecessors(1, false);
      useTaskSuccessors(1, false);
      useDependencyConflicts(7);
    });
    expect(
      client
        .getQueryCache()
        .getAll()
        .every((query) => (query.options as QueryObserverOptions).enabled === false),
    ).toBe(true);
    client.clear();
  });
  it("相同参数共享缓存，项目/任务各自区分 key", () => {
    const client = makeClient();
    renderHook(client, () => {
      useTaskDependencyListAll({ projectId: 7 });
      useTaskDependencyListAll({ projectId: 7 });
      useTaskDependencyListAll({ projectId: 8 });
    });
    expect(client.getQueryCache().getAll()).toHaveLength(2);
    expect(queryKeys.taskDependency.statistics(7)).not.toEqual(
      queryKeys.taskDependency.statistics(8),
    );
    expect(queryKeys.taskDependency.predecessors(1)).not.toEqual(
      queryKeys.taskDependency.predecessors(2),
    );
    expect(queryKeys.taskDependency.successors(1)).not.toEqual(
      queryKeys.taskDependency.predecessors(1),
    );
    client.clear();
  });
});
describe("列表全页读取", () => {
  it.each([0, 199, 200, 201, 1201])("读取 %s 条，每页 200，满页后继续", async (count) => {
    const spy = vi.spyOn(taskDependencyApi, "findByPage").mockImplementation(async ({ page }) => ({
      list: Array.from({ length: Math.max(0, Math.min(200, count - (page - 1) * 200)) }, (_, i) =>
        row((page - 1) * 200 + i + 1),
      ),
      total: count,
      pageNumber: page,
      pageSize: 200,
    }));
    expect(await fetchAllTaskDependencies(7)).toHaveLength(count);
    expect(spy).toHaveBeenCalledTimes(Math.floor(count / 200) + 1);
    spy.mock.calls.forEach(([args], index) =>
      expect(args).toEqual({ page: index + 1, pageSize: 200, bean: { projectId: 7 } }),
    );
  });
  it("中途失败丢弃部分数据，后台失败仍保留旧全集", async () => {
    const client = makeClient();
    const key = queryKeys.taskDependency.list({ all: true, projectId: 7, pageSize: 200 });
    client.setQueryData(key, [row(999)]);
    vi.spyOn(taskDependencyApi, "findByPage")
      .mockResolvedValueOnce({
        list: Array.from({ length: 200 }, (_, i) => row(i + 1)),
        total: 201,
        pageNumber: 1,
        pageSize: 200,
      })
      .mockRejectedValueOnce(new Error("第二页失败"));
    await client.invalidateQueries({ queryKey: key });
    await expect(
      client.fetchQuery({ queryKey: key, queryFn: () => fetchAllTaskDependencies(7) }),
    ).rejects.toThrow("第二页失败");
    expect(client.getQueryData(key)).toEqual([row(999)]);
    client.clear();
  });
});
const keys = [
  queryKeys.taskDependency.list({ all: true, projectId: 7, pageSize: 200 }),
  queryKeys.taskDependency.statistics(7),
  queryKeys.taskDependency.predecessors(2),
  queryKeys.taskDependency.successors(1),
  [...queryKeys.gantt.all, "data", 7],
  [...queryKeys.gantt.all, "criticalPath", 7],
  [...queryKeys.gantt.all, "dependencies", 1],
  queryKeys.task.detail(1),
];
describe("写入与失效", () => {
  it.each(["create", "invalid", "batch"] as const)(
    "%s 成功失效三域，已离开的组件仍失效",
    async (kind) => {
      const client = makeClient();
      keys.forEach((key) => client.setQueryData(key, []));
      vi.spyOn(taskDependencyApi, "createTaskDependency").mockResolvedValue(9);
      vi.spyOn(taskDependencyApi, "invalidDependency").mockResolvedValue("ok");
      vi.spyOn(taskDependencyApi, "batchDelete").mockResolvedValue("ok");
      // SSR 组件已不挂载；mutation 回调必须仍执行，不依赖组件 mutate 的临时回调。
      if (kind === "create")
        expect(await renderHook(client, useCreateTaskDependency).mutateAsync(payload)).toBe(9);
      else if (kind === "invalid")
        await renderHook(client, useInvalidTaskDependency).mutateAsync(9);
      else await renderHook(client, useBatchDeleteTaskDependencies).mutateAsync([9, 9, 10]);
      keys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(true));
      if (kind === "batch") expect(taskDependencyApi.batchDelete).toHaveBeenCalledWith([9, 10]);
      client.clear();
    },
  );
  it("检查 true/false 严格解包，非 boolean/请求失败不继续；检查不失效", async () => {
    const client = makeClient();
    keys.forEach((key) => client.setQueryData(key, []));
    const check = renderHook(client, useCheckCircularDependency);
    const spy = vi
      .spyOn(taskDependencyApi, "checkCircularDependency")
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce("false" as unknown as boolean)
      .mockRejectedValueOnce(new Error("失败"));
    expect(await check.mutateAsync(payload)).toBe(true);
    expect(await check.mutateAsync(payload)).toBe(false);
    await expect(check.mutateAsync(payload)).rejects.toThrow("boolean");
    await expect(check.mutateAsync(payload)).rejects.toThrow("失败");
    expect(spy).toHaveBeenCalledTimes(4);
    keys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(false));
    client.clear();
  });
  it.each(["create", "invalid", "batch"] as const)("%s 失败不重试，不失效", async (kind) => {
    const client = makeClient();
    keys.forEach((key) => client.setQueryData(key, []));
    const spy = vi
      .spyOn(
        taskDependencyApi,
        kind === "create"
          ? "createTaskDependency"
          : kind === "invalid"
            ? "invalidDependency"
            : "batchDelete",
      )
      .mockRejectedValue(new Error("写失败"));
    if (kind === "create")
      await expect(
        renderHook(client, useCreateTaskDependency).mutateAsync(payload),
      ).rejects.toThrow("写失败");
    else if (kind === "invalid")
      await expect(renderHook(client, useInvalidTaskDependency).mutateAsync(9)).rejects.toThrow(
        "写失败",
      );
    else
      await expect(
        renderHook(client, useBatchDeleteTaskDependencies).mutateAsync([9]),
      ).rejects.toThrow("写失败");
    expect(spy).toHaveBeenCalledTimes(1);
    keys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(false));
    client.clear();
  });
  it("写成功但刷新失败只提示读失败，不拒绝成功 ID、不重发写入", async () => {
    const client = makeClient();
    const key = queryKeys.taskDependency.statistics(7);
    client.setQueryData(key, { totalDependencies: 1, conflicts: 0, circularDependencies: 0 });
    const read = vi.fn().mockRejectedValue(new Error("刷新失败"));
    const observer = new QueryObserver(client, { queryKey: key, queryFn: read });
    const stop = observer.subscribe(() => {});
    const write = vi.spyOn(taskDependencyApi, "createTaskDependency").mockResolvedValue(9);
    expect(await renderHook(client, useCreateTaskDependency).mutateAsync(payload)).toBe(9);
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("操作已成功，刷新失败，请重试读取"),
    );
    expect(write).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledOnce();
    expect(client.getQueryData(key)).toEqual({
      totalDependencies: 1,
      conflicts: 0,
      circularDependencies: 0,
    });
    stop();
    client.clear();
  });
  it("创建非数字 ID 不进入成功路径；批删空/非法集合不发请求", async () => {
    const client = makeClient();
    keys.forEach((key) => client.setQueryData(key, []));
    vi.spyOn(taskDependencyApi, "createTaskDependency").mockResolvedValue("9" as unknown as number);
    await expect(renderHook(client, useCreateTaskDependency).mutateAsync(payload)).rejects.toThrow(
      "数字 ID",
    );
    const batchSpy = vi.spyOn(taskDependencyApi, "batchDelete");
    const batch = renderHook(client, useBatchDeleteTaskDependencies);
    for (const ids of [[], [0], [-1], [Number.MAX_SAFE_INTEGER + 1]])
      await expect(batch.mutateAsync(ids)).rejects.toThrow("有效的依赖 ID");
    expect(batchSpy).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    keys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(false));
    client.clear();
  });
  it("挂载统计/侧栏与甘特读取重新获取，缓存不再 fresh 命中", async () => {
    const client = makeClient();
    const queries = keys.map((key) => {
      const queryFn = vi.fn().mockResolvedValue(["new"]);
      client.setQueryData(key, ["old"]);
      const observer = new QueryObserver(client, { queryKey: key, queryFn });
      const stop = observer.subscribe(() => {});
      return { key, queryFn, stop };
    });
    vi.spyOn(taskDependencyApi, "invalidDependency").mockResolvedValue("ok");
    await renderHook(client, useInvalidTaskDependency).mutateAsync(9);
    await vi.waitFor(() =>
      queries.forEach(({ queryFn }) => expect(queryFn).toHaveBeenCalledOnce()),
    );
    queries.forEach(({ key, stop }) => {
      expect(client.getQueryData(key)).toEqual(["new"]);
      stop();
    });
    client.clear();
  });
});
