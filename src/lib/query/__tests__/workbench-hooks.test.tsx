// @vitest-environment jsdom
import { Fragment, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAuthStore } from "../../api/auth-store";
import { projectApi } from "../../api/project";
import { taskApi } from "../../api/task";
import { workLogApi } from "../../api/worklog";
import { notificationApi } from "../../api/notification";
import type { ProjectResponse, PageResult } from "../../api/types";
import type { TaskResponse } from "../../api/task-types";
import { useWorkbench, useWorkbenchDates } from "../hooks/useWorkbench";
import {
  useNotificationUnreadCount,
  useMarkAllNotificationsAsRead,
} from "../hooks/useNotifications";
import { useCreateTask, useAssignTask, useUpdateTaskStatus } from "../hooks/useTasks";
import { queryKeys } from "../keys";
import { workbenchDates, workbenchTaskParams } from "../../workbench-data";
const user = {
  userId: "42",
  userName: "用户",
  cnName: null,
  roles: [],
  authorities: [],
  extraInfo: {},
};
const project = (id: number) =>
  ({ id, projectKey: `P${id}`, projectName: `项目${id}` }) as ProjectResponse;
const empty: PageResult<TaskResponse> = { list: [], total: 0, pageNumber: 1, pageSize: 10 };
const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => {
    const accountKey = useAuthStore((s) => s.user?.userId ?? "anonymous");
    return (
      <QueryClientProvider client={client}>
        <Fragment key={accountKey}>{children}</Fragment>
      </QueryClientProvider>
    );
  };
  return { client, wrapper };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: true, user });
  vi.spyOn(projectApi, "findByPage").mockResolvedValue({
    list: [project(7), project(2)],
    total: 2,
    pageNumber: 1,
    pageSize: 100,
  });
  vi.spyOn(taskApi, "findByPage").mockResolvedValue(empty);
  vi.spyOn(workLogApi, "getUserStatistics").mockResolvedValue(null);
  vi.spyOn(notificationApi, "getUnreadCount").mockResolvedValue(3);
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  useAuthStore.setState({ isAuthenticated: false, user: null });
});
it("项目与通知并行；范围完成后任务与两个工时区块并行，队列上限 4", async () => {
  const scope = deferred<Awaited<ReturnType<typeof projectApi.findByPage>>>();
  const count = deferred<number>();
  vi.mocked(projectApi.findByPage).mockReturnValue(scope.promise);
  vi.mocked(notificationApi.getUnreadCount).mockReturnValue(count.promise);
  const tasks: Array<ReturnType<typeof deferred<typeof empty>>> = [];
  let active = 0,
    max = 0;
  vi.mocked(taskApi.findByPage).mockImplementation(() => {
    active++;
    max = Math.max(max, active);
    const wait = deferred<typeof empty>();
    tasks.push(wait);
    return wait.promise.finally(() => {
      active--;
    });
  });
  const hours: Array<ReturnType<typeof deferred<unknown>>> = [];
  vi.mocked(workLogApi.getUserStatistics).mockImplementation(() => {
    const wait = deferred<unknown>();
    hours.push(wait);
    return wait.promise;
  });
  const h = renderHook(
    () => ({ w: useWorkbench(), n: useNotificationUnreadCount(false) }),
    setup(),
  );
  expect(projectApi.findByPage).toHaveBeenCalledTimes(1);
  expect(notificationApi.getUnreadCount).toHaveBeenCalledTimes(1);
  expect(taskApi.findByPage).not.toHaveBeenCalled();
  await act(async () =>
    scope.resolve({ list: [project(7), project(2)], total: 2, pageNumber: 1, pageSize: 100 }),
  );
  await waitFor(() => expect(tasks).toHaveLength(4));
  expect(hours.length).toBe(workbenchDates().today === workbenchDates().weekStart ? 1 : 2);
  expect(h.result.current.n.isPending).toBe(true);
  await act(async () => tasks.slice(0, 4).forEach((t) => t.resolve({ ...empty, total: 20 })));
  await waitFor(() => expect(tasks).toHaveLength(6));
  await act(async () => {
    tasks.slice(4).forEach((t) => t.resolve({ ...empty, total: 20 }));
    hours.forEach((t) => t.resolve(null));
    count.resolve(3);
  });
  await waitFor(() => expect(h.result.current.w.summary.total).toBe(120));
  expect(max).toBe(4);
  expect(vi.mocked(taskApi.findByPage).mock.calls.map(([p]) => p.bean.status)).toEqual([
    "TODO",
    "IN_PROGRESS",
    "PAUSED",
    "TODO",
    "IN_PROGRESS",
    "PAUSED",
  ]);
});
it("尾页项目进入排序统计范围；共享 scope key，参数与来源页一致", async () => {
  vi.mocked(projectApi.findByPage).mockImplementation(async (p) => ({
    list: [project(p.page === 1 ? 7 : 101)],
    total: 101,
    pageNumber: p.page,
    pageSize: 100,
  }));
  const s = setup();
  const h = renderHook(() => useWorkbench(), s);
  await waitFor(() => expect(h.result.current.summary.total).toBe(0));
  expect(projectApi.findByPage).toHaveBeenCalledTimes(2);
  expect(s.client.getQueryData(queryKeys.project.searchScope())).toHaveLength(2);
  expect(taskApi.findByPage).toHaveBeenCalledWith(workbenchTaskParams(101, 42, "PAUSED"));
  expect(workLogApi.getUserStatistics).toHaveBeenCalledWith(42, {
    startDate: h.result.current.dates.weekStart,
    endDate: h.result.current.dates.today,
    projectIds: [7, 101],
  });
  expect(
    queryKeys.workLog.userStatistics({
      userId: 42,
      startDate: "a",
      endDate: "b",
      projectIds: [7, 2, 7],
    }),
  ).toEqual([
    "hc",
    "workLog",
    "userStatistics",
    { userId: 42, startDate: "a", endDate: "b", projectIds: [2, 7] },
  ]);
  expect(
    s.client
      .getQueryCache()
      .findAll({ queryKey: queryKeys.task.all })
      .every((q) => (q.options as { staleTime?: number }).staleTime === 30_000),
  ).toBe(true);
});
it.each(["", "01", "0", "9007199254740992", null])(
  "无效身份 %s 禁用数据查询，手动 scope 重试也无请求",
  async (raw) => {
    useAuthStore.setState({ user: raw === null ? null : { ...user, userId: raw } });
    const h = renderHook(() => useWorkbench(), setup());
    await act(async () => {
      await h.result.current.scope.refetch();
      await h.result.current.today.refetch();
    });
    expect(projectApi.findByPage).not.toHaveBeenCalled();
    expect(taskApi.findByPage).not.toHaveBeenCalled();
    expect(workLogApi.getUserStatistics).not.toHaveBeenCalled();
  },
);
it("未登录不发请求", () => {
  useAuthStore.setState({ isAuthenticated: false });
  renderHook(() => useWorkbench(), setup());
  expect(projectApi.findByPage).not.toHaveBeenCalled();
  expect(workLogApi.getUserStatistics).not.toHaveBeenCalled();
});
it("第二页失败不发布第一页；通知继续工作，scope 独立重试", async () => {
  vi.mocked(projectApi.findByPage)
    .mockResolvedValueOnce({ list: [project(7)], total: 101, pageNumber: 1, pageSize: 100 })
    .mockRejectedValueOnce(new Error("第二页失败"));
  const h = renderHook(
    () => ({ w: useWorkbench(), n: useNotificationUnreadCount(false) }),
    setup(),
  );
  await waitFor(() => expect(h.result.current.w.scope.isError).toBe(true));
  expect(h.result.current.w.projects).toEqual([]);
  expect(taskApi.findByPage).not.toHaveBeenCalled();
  expect(workLogApi.getUserStatistics).not.toHaveBeenCalled();
  expect(h.result.current.n.data).toBe(3);
  await act(async () => {
    await h.result.current.w.scope.refetch();
  });
  await waitFor(() => expect(h.result.current.w.summary.total).toBe(0));
  expect(notificationApi.getUnreadCount).toHaveBeenCalledTimes(1);
});
it("完整空范围不请求任务和空 projectIds，通知仍运行", async () => {
  vi.mocked(projectApi.findByPage).mockResolvedValue({
    list: [],
    total: 0,
    pageNumber: 1,
    pageSize: 100,
  });
  const h = renderHook(
    () => ({ w: useWorkbench(), n: useNotificationUnreadCount(false) }),
    setup(),
  );
  await waitFor(() => expect(h.result.current.w.scope.isSuccess).toBe(true));
  expect(h.result.current.w.summary.total).toBeNull();
  expect(taskApi.findByPage).not.toHaveBeenCalled();
  expect(workLogApi.getUserStatistics).not.toHaveBeenCalled();
  expect(h.result.current.n.data).toBe(3);
});
it.each(["projectId", "assigneeId", "status"] as const)(
  "异常 %s 只影响一组；total 未知，其他卡片继续",
  async (field) => {
    vi.mocked(taskApi.findByPage).mockImplementation(async (p) => ({
      ...empty,
      total: 12,
      list:
        p.bean.projectId === 2 && p.bean.status === "TODO"
          ? [
              {
                id: 1,
                title: "异常",
                ...p.bean,
                [field]: field === "status" ? "COMPLETED" : 99,
              } as TaskResponse,
            ]
          : [],
    }));
    const h = renderHook(() => useWorkbench(), setup());
    await waitFor(() => expect(h.result.current.groups.filter((g) => g.isError)).toHaveLength(1));
    expect(h.result.current.summary.total).toBeNull();
    expect(h.result.current.summary.subtotal).toBe(60);
    expect(h.result.current.week.isSuccess).toBe(true);
    vi.mocked(taskApi.findByPage).mockResolvedValue({ ...empty, total: 12 });
    await act(async () => {
      await h.result.current.groups.find((g) => g.isError)!.refetch();
    });
    await waitFor(() => expect(h.result.current.summary.total).toBe(72));
  },
);
it("任务和工时刷新失败保留同范围旧数据；范围失败禁用新的聚合", async () => {
  vi.mocked(taskApi.findByPage).mockResolvedValue({ ...empty, total: 20 });
  const h = renderHook(() => useWorkbench(), setup());
  await waitFor(() => expect(h.result.current.summary.total).toBe(120));
  await waitFor(() => expect(h.result.current.today.isSuccess).toBe(true));
  vi.mocked(taskApi.findByPage).mockRejectedValue(new Error("刷新失败"));
  vi.mocked(workLogApi.getUserStatistics).mockRejectedValue(new Error("统计拒绝"));
  await act(async () => {
    await h.result.current.groups[0].refetch();
    await h.result.current.today.refetch();
  });
  await waitFor(() => expect(h.result.current.summary.stale).toBe(true));
  expect(h.result.current.summary.total).toBe(120);
  expect(h.result.current.today.data).toBeNull();
  vi.mocked(projectApi.findByPage).mockRejectedValue(new Error("范围拒绝"));
  await act(async () => {
    await h.result.current.scope.refetch();
  });
  expect(h.result.current.projects).toHaveLength(2);
  await waitFor(() => expect(h.result.current.scope.isError).toBe(true));
});
it("Shell、工作台、通知三个 observer 合并请求，仅 Shell 轮询，已读同步", async () => {
  const pending = deferred<number>();
  vi.mocked(notificationApi.getUnreadCount)
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValue(0);
  vi.spyOn(notificationApi, "markAllAsRead").mockResolvedValue("ok");
  const interval = vi.spyOn(window, "setInterval");
  const clearInterval = vi.spyOn(window, "clearInterval");
  const s = setup();
  const h = renderHook(
    () => ({
      shell: useNotificationUnreadCount(true),
      w: useWorkbench(),
      card: useNotificationUnreadCount(false),
      list: useNotificationUnreadCount(false),
      mark: useMarkAllNotificationsAsRead(),
    }),
    s,
  );
  expect(notificationApi.getUnreadCount).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve(3));
  await waitFor(() => expect(h.result.current.card.data).toBe(3));
  // 除一个日期检查计时器外，只有 Shell 的通知 observer 建立 60 秒轮询。
  expect(
    interval.mock.calls.filter(
      (call, index) =>
        call[1] === 60_000 &&
        !clearInterval.mock.calls.some(([id]) => id === interval.mock.results[index].value),
    ),
  ).toHaveLength(1);
  expect(s.client.getQueryCache().findAll({ queryKey: queryKeys.notification.all })).toHaveLength(
    1,
  );
  await act(async () => {
    await h.result.current.mark.mutateAsync(undefined);
  });
  await waitFor(() => expect(h.result.current.shell.data).toBe(0));
  expect(h.result.current.card.data).toBe(0);
  expect(h.result.current.list.data).toBe(0);
});
it("账号切换/登出：复用根账户重挂载与 cancel+clear，晚到数据不恢复旧缓存、旧队列不启动", async () => {
  const waits: Array<ReturnType<typeof deferred<typeof empty>>> = [];
  vi.mocked(taskApi.findByPage).mockImplementation((p) => {
    if (p.bean.assigneeId === 43) return Promise.resolve({ ...empty, total: 2 });
    const wait = deferred<typeof empty>();
    waits.push(wait);
    return wait.promise;
  });
  const oldHours = deferred<unknown>();
  vi.mocked(workLogApi.getUserStatistics).mockImplementation((id) =>
    id === 42 ? oldHours.promise : Promise.resolve(null),
  );
  const s = setup();
  const h = renderHook(() => useWorkbench(), s);
  await waitFor(() => expect(waits).toHaveLength(4));
  act(() => {
    void s.client.cancelQueries();
    s.client.clear();
    useAuthStore.setState({ user: { ...user, userId: "43" } });
  });
  await waitFor(() => expect(h.result.current.userId).toBe(43));
  expect(h.result.current.summary.total).toBeNull();
  await act(async () => {
    waits.forEach((t) => t.resolve({ ...empty, total: 100 }));
    oldHours.resolve([{ userId: 42, statisticDate: workbenchDates().today, totalHours: 100 }]);
  });
  await waitFor(() => expect(h.result.current.summary.total).toBe(12));
  expect(
    vi.mocked(taskApi.findByPage).mock.calls.filter(([p]) => p.bean.assigneeId === 42),
  ).toHaveLength(4);
  expect(
    s.client.getQueryData(queryKeys.task.list(workbenchTaskParams(2, 42, "TODO"))),
  ).toBeUndefined();
  act(() => {
    void s.client.cancelQueries();
    s.client.clear();
    useAuthStore.setState({ isAuthenticated: false, user: null });
  });
  expect(h.result.current.userId).toBeNull();
  expect(h.result.current.groups).toEqual([]);
  expect(h.result.current.today.data).toBeUndefined();
});
it("工时 GET 编码准确本地日期和非空重复键项目集合（不是 schema 契约）", async () => {
  vi.mocked(workLogApi.getUserStatistics).mockRestore();
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(
      new Response(JSON.stringify({ code: 1, msg: "ok", result: null }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  vi.stubGlobal("fetch", fetch);
  const h = renderHook(() => useWorkbench(), setup());
  await waitFor(() => expect(h.result.current.today.isSuccess).toBe(true));
  const urls = fetch.mock.calls.map(([url]) => new URL(String(url), "http://test"));
  expect(urls.every((url) => url.searchParams.getAll("projectIds").join(",") === "2,7")).toBe(true);
  expect(
    urls.some((url) => url.searchParams.get("startDate") === h.result.current.dates.today),
  ).toBe(true);
  expect(
    urls.every((url) => url.searchParams.get("endDate") === h.result.current.dates.today),
  ).toBe(true);
});
it("日期计时器跨午夜/周一更新 key；窗口回前台重新计算，旧日期无 placeholder", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 11, 23, 59, 50));
  const s = setup();
  const h = renderHook(() => useWorkbench(), s);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
  expect(h.result.current.dates.weekStart).toBe("2026-10-05");
  vi.mocked(workLogApi.getUserStatistics).mockImplementation(() => new Promise(() => {}));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(h.result.current.dates).toEqual({ today: "2026-10-12", weekStart: "2026-10-12" });
  expect(h.result.current.today.data).toBeUndefined();
  expect(h.result.current.week.data).toBeUndefined();
  expect(
    vi
      .mocked(workLogApi.getUserStatistics)
      .mock.calls.filter(([, p]) => p.startDate === "2026-10-12"),
  ).toHaveLength(1);
  vi.setSystemTime(new Date(2026, 9, 13, 0, 0));
  act(() => window.dispatchEvent(new Event("focus")));
  expect(h.result.current.dates.today).toBe("2026-10-13");
});
it("周一同义范围只请求一次；计时器只检查日期", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 5, 12));
  const h = renderHook(() => useWorkbench(), setup());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
  expect(workLogApi.getUserStatistics).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(workLogApi.getUserStatistics).toHaveBeenCalledTimes(1);
  expect(h.result.current.today.data).toBeNull();
  expect(h.result.current.week.data).toBeNull();
});
it("今日失败不遮本周，独立重试不再取任务/通知", async () => {
  // 固定非周一，确保两个不同条件。
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 6, 12));
  vi.mocked(workLogApi.getUserStatistics).mockImplementation(async (_id, p) => {
    if (p.startDate === p.endDate) throw new Error("今日拒绝");
    return null;
  });
  const h = renderHook(() => useWorkbench(), setup());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
  expect(h.result.current.today.isError).toBe(true);
  expect(h.result.current.week.isSuccess).toBe(true);
  vi.mocked(workLogApi.getUserStatistics).mockResolvedValue(null);
  const before = vi.mocked(taskApi.findByPage).mock.calls.length;
  await act(async () => {
    await h.result.current.today.refetch();
    await vi.advanceTimersByTimeAsync(10);
  });
  expect(h.result.current.today.isSuccess).toBe(true);
  expect(taskApi.findByPage).toHaveBeenCalledTimes(before);
});
it.each(["create", "assign", "status"] as const)(
  "任务 %s 沿用 task.all 失效工作台 list",
  async (kind) => {
    vi.spyOn(taskApi, "createTask").mockResolvedValue(1);
    vi.spyOn(taskApi, "assignTask").mockResolvedValue("ok");
    vi.spyOn(taskApi, "updateTaskStatus").mockResolvedValue("ok");
    const s = setup();
    const key = queryKeys.task.list(workbenchTaskParams(7, 42, "TODO"));
    s.client.setQueryData(key, empty);
    const h = renderHook(
      () => ({ create: useCreateTask(), assign: useAssignTask(), status: useUpdateTaskStatus() }),
      s,
    );
    await act(async () => {
      if (kind === "create")
        await h.result.current.create.mutateAsync({ title: "任务", projectId: 7 });
      else if (kind === "assign")
        await h.result.current.assign.mutateAsync({ taskId: 1, assigneeId: 43, reason: "改派" });
      else
        await h.result.current.status.mutateAsync({ taskId: 1, status: "PAUSED", reason: "暂停" });
    });
    expect(s.client.getQueryState(key)?.isInvalidated).toBe(true);
  },
);
