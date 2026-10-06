// @vitest-environment jsdom
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAuthStore } from "../../api/auth-store";
import { projectApi } from "../../api/project";
import { taskApi } from "../../api/task";
import { defectApi } from "../../api/defect";
import { requirementApi } from "../../api/requirement";
import { testCaseApi } from "../../api/testCase";
import { ApiBusinessError, HttpResponseError } from "../../api/client";
import type { PageRequest, PageResult, ProjectResponse } from "../../api/types";
import type { TaskResponse } from "../../api/task-types";
import type { SearchRecord } from "../hooks/useGlobalSearch";
import { useGlobalSearch, visibleSearchProjectsOptions } from "../hooks/useGlobalSearch";
import { queryKeys } from "../keys";
import { createQueryClient } from "../client";
const apis = [taskApi, defectApi, requirementApi, testCaseApi] as const;
const clients: QueryClient[] = [];
const user = {
  userId: "42",
  userName: "用户",
  cnName: null,
  roles: [],
  authorities: [],
  extraInfo: {},
};
const project = (id: number, key = `P${id}`) =>
  ({ id, projectKey: key, projectName: `项目${id}` }) as ProjectResponse;
const empty = { list: [], total: 0, pageNumber: 1, pageSize: 10 };
const page = (projectId: number, title: string, total = 1): PageResult<TaskResponse> => ({
  ...empty,
  total,
  list: [{ id: 1, title, projectId, status: "TODO", statusLabel: "待开始" } as TaskResponse],
});
function setup(retry = false) {
  const client = retry
    ? createQueryClient()
    : new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  if (retry)
    client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retryDelay: 0 } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}
beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: true, user });
  vi.spyOn(projectApi, "findByPage").mockResolvedValue({
    list: [project(7, "HC")],
    total: 1,
    pageNumber: 1,
    pageSize: 100,
  });
  apis.forEach((api) => vi.spyOn(api, "findByPage").mockResolvedValue(empty));
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.restoreAllMocks();
  useAuthStore.setState({ isAuthenticated: false, user: null });
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
it("四域在任一完成前启动，沿用域 key、total，而非 list.length", async () => {
  const waits = apis.map((api) => {
    const pending = deferred<typeof empty>();
    vi.mocked(api.findByPage).mockReturnValue(pending.promise);
    return pending;
  });
  const s = setup();
  const h = renderHook(() => useGlobalSearch(" 登录 "), s);
  await waitFor(() => apis.forEach((api) => expect(api.findByPage).toHaveBeenCalledTimes(1)));
  expect(h.result.current.domains.task.state).toBe("pending");
  await act(async () => waits.forEach((wait) => wait.resolve({ ...empty, total: 42 })));
  await waitFor(() => expect(h.result.current.domains.task.state).toBe("success"));
  expect(h.result.current.domains.task.total).toBe(42);
  apis.forEach((api) =>
    expect(api.findByPage).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
      bean: { projectId: 7, title: "登录" },
    }),
  );
  expect(
    s.client.getQueryData(
      queryKeys.task.list({ page: 1, pageSize: 10, bean: { projectId: 7, title: "登录" } }),
    ),
  ).toEqual({ ...empty, total: 42 });
  h.rerender();
  expect(taskApi.findByPage).toHaveBeenCalledTimes(1);
});
it("多个项目共享最多 4 个在途；按项目 key 派发并只查第一页", async () => {
  vi.mocked(projectApi.findByPage).mockResolvedValue({
    list: [project(2, "B"), project(1, "A"), project(3, "C")],
    total: 3,
    pageNumber: 1,
    pageSize: 100,
  });
  let active = 0;
  let max = 0;
  const calls: number[] = [];
  const waits: Array<ReturnType<typeof deferred<typeof empty>>> = [];
  apis.forEach((api) =>
    vi.mocked(api.findByPage).mockImplementation((params) => {
      active++;
      max = Math.max(max, active);
      calls.push(params.bean.projectId!);
      const wait = deferred<typeof empty>();
      waits.push(wait);
      return wait.promise.finally(() => {
        active--;
      });
    }),
  );
  const h = renderHook(() => useGlobalSearch("登录"), setup());
  await waitFor(() => expect(waits).toHaveLength(4));
  expect(calls).toEqual([1, 1, 1, 1]);
  await act(async () => waits.slice(0, 4).forEach((wait) => wait.resolve(empty)));
  await waitFor(() => expect(waits).toHaveLength(8));
  expect(calls.slice(4)).toEqual([2, 2, 2, 2]);
  await act(async () => waits.slice(4, 8).forEach((wait) => wait.resolve(empty)));
  await waitFor(() => expect(waits).toHaveLength(12));
  await act(async () => waits.slice(8).forEach((wait) => wait.resolve(empty)));
  await waitFor(() => expect(h.result.current.domains.testCase.state).toBe("success"));
  expect(max).toBe(4);
  apis.forEach((api) =>
    vi.mocked(api.findByPage).mock.calls.forEach(([params]) => expect(params.page).toBe(1)),
  );
});
it("尾页第 101 个项目仍参与搜索，项目枚举不随关键词刷新", async () => {
  vi.mocked(projectApi.findByPage).mockImplementation(async (params) => ({
    list:
      params.page === 1 ? Array.from({ length: 100 }, (_, i) => project(i + 1)) : [project(101)],
    total: 101,
    pageNumber: params.page,
    pageSize: 100,
  }));
  const h = renderHook(({ keyword }) => useGlobalSearch(keyword), {
    ...setup(),
    initialProps: { keyword: "A" },
  });
  await waitFor(() => expect(taskApi.findByPage).toHaveBeenCalledTimes(101));
  expect(taskApi.findByPage).toHaveBeenCalledWith({
    page: 1,
    pageSize: 10,
    bean: { projectId: 101, title: "A" },
  });
  h.rerender({ keyword: "B" });
  await waitFor(() => expect(taskApi.findByPage).toHaveBeenCalledTimes(202));
  expect(projectApi.findByPage).toHaveBeenCalledTimes(2);
});
it.each(["", "   ", "x".repeat(201), "中\u0000文"])("无效关键词 %s 禁用四域", async (keyword) => {
  const h = renderHook(() => useGlobalSearch(keyword), setup());
  await waitFor(() => expect(h.result.current.scope.isSuccess).toBe(true));
  apis.forEach((api) => expect(api.findByPage).not.toHaveBeenCalled());
  expect(h.result.current.enabled).toBe(false);
});
it("未登录、范围 pending/失败/空、不可见 key 禁用请求", async () => {
  useAuthStore.setState({ isAuthenticated: false });
  const h = renderHook(({ key }) => useGlobalSearch("登录", key), {
    ...setup(),
    initialProps: { key: "NO" },
  });
  expect(projectApi.findByPage).not.toHaveBeenCalled();
  const scope = deferred<PageResult<ProjectResponse>>();
  vi.mocked(projectApi.findByPage).mockReturnValue(scope.promise);
  act(() => useAuthStore.setState({ isAuthenticated: true }));
  apis.forEach((api) => expect(api.findByPage).not.toHaveBeenCalled());
  await act(async () => scope.resolve({ list: [], total: 0, pageNumber: 1, pageSize: 100 }));
  await waitFor(() => expect(h.result.current.unavailable).toBe(true));
  apis.forEach((api) => expect(api.findByPage).not.toHaveBeenCalled());
  h.unmount();
  vi.mocked(projectApi.findByPage).mockRejectedValue(
    new ApiBusinessError({ code: 2, msg: "范围失败", result: null }),
  );
  const failed = renderHook(() => useGlobalSearch("登录"), setup());
  await waitFor(() => expect(failed.result.current.scope.isError).toBe(true));
  apis.forEach((api) => expect(api.findByPage).not.toHaveBeenCalled());
});
it("范围变更/切词取消未派发任务，迟到 A 不能覆盖 B，旧 HTTP 占用槽直到结束", async () => {
  vi.mocked(projectApi.findByPage).mockResolvedValue({
    list: [project(7, "HC"), project(8, "ZZ")],
    total: 2,
    pageNumber: 1,
    pageSize: 100,
  });
  const old = apis.map((api) => {
    const pending = deferred<PageResult<SearchRecord>>();
    vi.mocked(
      api.findByPage as (
        params: PageRequest<{ projectId: number; title?: string }>,
      ) => Promise<PageResult<SearchRecord>>,
    ).mockImplementation((params) =>
      params.bean.title === "A"
        ? pending.promise
        : Promise.resolve(page(params.bean.projectId, "B命中")),
    );
    return pending;
  });
  const h = renderHook(({ keyword, key }) => useGlobalSearch(keyword, key), {
    ...setup(),
    initialProps: { keyword: "A", key: undefined as string | undefined },
  });
  await waitFor(() => expect(taskApi.findByPage).toHaveBeenCalledTimes(1));
  h.rerender({ keyword: "B", key: "HC" });
  expect(taskApi.findByPage).toHaveBeenCalledTimes(1);
  await act(async () => old[0].resolve(page(7, "A迟到")));
  await waitFor(() => expect(h.result.current.domains.task.rows[0]?.item.title).toBe("B命中"));
  expect(taskApi.findByPage).toHaveBeenCalledTimes(2);
  await act(async () => old.slice(1).forEach((wait) => wait.resolve(page(7, "A迟到"))));
  await waitFor(() => expect(h.result.current.domains.testCase.state).toBe("success"));
  apis.forEach((api) => {
    expect(api.findByPage).toHaveBeenCalledTimes(2);
    expect(
      vi.mocked(api.findByPage).mock.calls.every(([params]) => params.bean.projectId === 7),
    ).toBe(true);
  });
  expect(h.result.current.domains.task.rows[0]?.item.title).toBe("B命中");
});
it("确定性 top N/去重，保留截去项目计数；项目响应错配作为错误", async () => {
  vi.mocked(projectApi.findByPage).mockResolvedValue({
    list: [project(2, "B"), project(1, "A")],
    total: 2,
    pageNumber: 1,
    pageSize: 100,
  });
  const late = deferred<PageResult<TaskResponse>>();
  const records = (projectId: number) => ({
    ...empty,
    total: 50,
    list: Array.from({ length: 10 }, (_, i) => ({
      ...page(projectId, "命中").list[0],
      id: i,
      title: `${projectId}-${i}`,
    })),
  });
  vi.mocked(taskApi.findByPage).mockImplementation(async (params) =>
    params.bean.projectId === 1 ? late.promise : records(params.bean.projectId!),
  );
  vi.mocked(defectApi.findByPage).mockResolvedValue(
    page(999, "越范围") as unknown as Awaited<ReturnType<typeof defectApi.findByPage>>,
  );
  const h = renderHook(() => useGlobalSearch("登录"), setup());
  await waitFor(() => expect(h.result.current.domains.task.rows[0]?.project.id).toBe(2));
  await act(async () => late.resolve(records(1)));
  await waitFor(() => expect(h.result.current.domains.task.state).toBe("success"));
  expect(h.result.current.domains.task.rows.map((row) => row.item.title)).toEqual(
    Array.from({ length: 10 }, (_, i) => `1-${i}`),
  );
  expect(h.result.current.domains.task.total).toBe(100);
  expect(h.result.current.domains.task.projects).toHaveLength(2);
  await waitFor(() => expect(h.result.current.domains.defect.state).toBe("error"));
  expect(h.result.current.domains.defect.rows).toEqual([]);
});
it("部分失败/单项目重试；权限不重试、瞬时故障两次重试，刷新失败保留并标记旧数据", async () => {
  vi.mocked(projectApi.findByPage).mockResolvedValue({
    list: [project(1, "A"), project(2, "B")],
    total: 2,
    pageNumber: 1,
    pageSize: 100,
  });
  const denied = new ApiBusinessError({ code: 403, msg: "无权限", result: null }, 403);
  vi.mocked(taskApi.findByPage).mockImplementation(async (params) => {
    if (params.bean.projectId === 2) throw denied;
    return page(1, "成功", 20);
  });
  vi.mocked(defectApi.findByPage).mockRejectedValue(new HttpResponseError("瞬时故障", 500));
  const s = setup(true);
  const h = renderHook(() => useGlobalSearch("登录"), s);
  await waitFor(() => expect(h.result.current.domains.task.state).toBe("partial"));
  expect(taskApi.findByPage).toHaveBeenCalledTimes(2);
  expect(h.result.current.domains.task.total).toBe(20);
  await waitFor(() => expect(h.result.current.domains.defect.state).toBe("error"));
  expect(defectApi.findByPage).toHaveBeenCalledTimes(6);
  vi.mocked(taskApi.findByPage).mockImplementation(async (params) =>
    page(params.bean.projectId!, "成功", 20),
  );
  act(() => h.result.current.domains.task.projects[1].retry());
  await waitFor(() => expect(h.result.current.domains.task.state).toBe("success"));
  expect(h.result.current.domains.task.total).toBe(40);
  vi.mocked(taskApi.findByPage).mockRejectedValue(denied);
  await act(async () => {
    await s.client.invalidateQueries({ queryKey: queryKeys.task.all });
  });
  await waitFor(() => expect(h.result.current.domains.task.state).toBe("error"));
  expect(h.result.current.domains.task.rows).toHaveLength(2);
  expect(
    h.result.current.domains.task.projects.every((result) => result.failed && result.data),
  ).toBe(true);
});
it("卸载/清空取消所有未派发任务；范围缓存属于 project 命名空间", async () => {
  vi.mocked(projectApi.findByPage).mockResolvedValue({
    list: [project(1), project(2)],
    total: 2,
    pageNumber: 1,
    pageSize: 100,
  });
  const waits = apis.map((api) => {
    const pending = deferred<typeof empty>();
    vi.mocked(api.findByPage).mockReturnValue(pending.promise);
    return pending;
  });
  const s = setup();
  const h = renderHook(({ keyword }) => useGlobalSearch(keyword), {
    ...s,
    initialProps: { keyword: "A" },
  });
  await waitFor(() => expect(taskApi.findByPage).toHaveBeenCalledTimes(1));
  h.rerender({ keyword: "" });
  h.unmount();
  await act(async () => waits.forEach((wait) => wait.resolve(empty)));
  apis.forEach((api) => expect(api.findByPage).toHaveBeenCalledTimes(1));
  expect(visibleSearchProjectsOptions().queryKey.slice(0, 2)).toEqual(queryKeys.project.all);
});

it("账号切换清缓存后，旧范围队列/响应隔离，不以新账号继续派发旧范围", async () => {
  vi.mocked(projectApi.findByPage).mockImplementation(async () => {
    const switched = useAuthStore.getState().user?.userId === "7";
    return {
      list: switched ? [project(3, "NEW")] : [project(1, "A"), project(2, "B")],
      total: switched ? 1 : 2,
      pageNumber: 1,
      pageSize: 100,
    };
  });
  const old = apis.map((api) => {
    const pending = deferred<typeof empty>();
    vi.mocked(api.findByPage).mockImplementation((params) =>
      params.bean.projectId === 1 ? pending.promise : Promise.resolve(empty),
    );
    return pending;
  });
  const s = setup();
  const h = renderHook(() => useGlobalSearch("同词"), s);
  await waitFor(() => expect(taskApi.findByPage).toHaveBeenCalledTimes(1));
  act(() => {
    s.client.clear();
    useAuthStore.setState({ user: { ...user, userId: "7" } });
  });
  await waitFor(() => expect(h.result.current.projects[0]?.id).toBe(3));
  await act(async () => old.forEach((pending) => pending.resolve(empty)));
  await waitFor(() => expect(h.result.current.domains.task.projects[0]?.project.id).toBe(3));
  await waitFor(() => expect(h.result.current.domains.task.state).toBe("success"));
  apis.forEach((api) => {
    expect(api.findByPage).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.findByPage).mock.calls.map(([params]) => params.bean.projectId)).toEqual([
      1, 3,
    ]);
  });
});
