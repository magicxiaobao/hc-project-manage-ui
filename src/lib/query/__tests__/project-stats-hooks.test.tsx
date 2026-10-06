// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "../../api/auth-store";
import { projectStatsApi } from "../../api/project-stats";
import {
  dashboardFixture,
  progressFixture,
  statisticsFixture,
} from "../../__tests__/project-dashboard-fixtures";
import { queryKeys } from "../keys";
import { setQueryCacheClearer } from "../session";
import {
  useProjectDashboard,
  useProjectDashboardCompare,
  useProjectProgress,
  useProjectStatistics,
  useStatisticsProjectOptions,
} from "../hooks/useProjectStats";
let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  useAuthStore.setState({ isAuthenticated: true });
  vi.spyOn(projectStatsApi, "getDashboard").mockImplementation(async (id) => dashboardFixture(id));
  vi.spyOn(projectStatsApi, "getProgress").mockImplementation(async (id) => progressFixture(id));
  vi.spyOn(projectStatsApi, "compareDashboards").mockImplementation(async (ids) =>
    ids.map((id) => dashboardFixture(id)),
  );
  vi.spyOn(projectStatsApi, "getStatistics").mockResolvedValue(statisticsFixture);
  vi.spyOn(projectStatsApi, "findStatisticsProjectOptions").mockResolvedValue({
    list: [],
    total: 0,
    pageNumber: 1,
    pageSize: 20,
  });
});
afterEach(() => {
  cleanup();
  client.clear();
  setQueryCacheClearer(null);
  vi.restoreAllMocks();
  useAuthStore.setState({ isAuthenticated: false, user: null });
});
describe("project-stats hooks", () => {
  it("五个 hook 使用精确 key 和已归一参数，与 dashboard 实体隔离", async () => {
    const hook = renderHook(
      () => ({
        dashboard: useProjectDashboard(3),
        progress: useProjectProgress(3),
        compare: useProjectDashboardCompare([4, 3, 4]),
        statistics: useProjectStatistics(),
        options: useStatisticsProjectOptions({
          page: 2,
          pageSize: 20,
          bean: { projectName: " 名称 " },
        }),
      }),
      { wrapper },
    );
    await waitFor(() =>
      expect(Object.values(hook.result.current).every((q) => q.isSuccess)).toBe(true),
    );
    expect(projectStatsApi.getDashboard).toHaveBeenCalledWith(3);
    expect(projectStatsApi.getProgress).toHaveBeenCalledWith(3);
    expect(projectStatsApi.compareDashboards).toHaveBeenCalledWith([3, 4]);
    expect(projectStatsApi.findStatisticsProjectOptions).toHaveBeenCalledWith({
      page: 2,
      pageSize: 20,
      bean: { projectName: "名称" },
    });
    expect(queryKeys.project.dashboard(3)).toEqual(["hc", "project", "dashboard", 3]);
    expect(queryKeys.project.progress(3)).toEqual(["hc", "project", "progress", 3]);
    expect(queryKeys.project.dashboardCompare([4, 3, 4])).toEqual([
      "hc",
      "project",
      "dashboardCompare",
      [3, 4],
    ]);
    expect(queryKeys.project.statistics()).toEqual(["hc", "project", "statistics"]);
    expect(
      client.getQueryData(
        queryKeys.project.statisticsOptions({
          page: 2,
          pageSize: 20,
          bean: { projectName: "名称" },
        }),
      ),
    ).toEqual(hook.result.current.options.data);
    expect(client.getQueryData(queryKeys.dashboard.detail(3))).toBeUndefined();
  });
  it("未登录所有禁用，候选未开启不读取，首屏 bean 为 {}", async () => {
    useAuthStore.setState({ isAuthenticated: false });
    const hook = renderHook(
      () => [
        useProjectDashboard(3),
        useProjectProgress(3),
        useProjectDashboardCompare([3]),
        useProjectStatistics(),
        useStatisticsProjectOptions({ page: 1, pageSize: 20, bean: {} }, false),
      ],
      { wrapper },
    );
    expect(hook.result.current.every((q) => q.fetchStatus === "idle")).toBe(true);
    act(() => useAuthStore.setState({ isAuthenticated: true }));
    await waitFor(() => expect(projectStatsApi.getDashboard).toHaveBeenCalled());
    expect(projectStatsApi.findStatisticsProjectOptions).not.toHaveBeenCalled();
    const options = renderHook(
      () => useStatisticsProjectOptions({ page: 1, pageSize: 20, bean: {} }),
      { wrapper },
    );
    await waitFor(() => expect(options.result.current.isSuccess).toBe(true));
    expect(projectStatsApi.findStatisticsProjectOptions).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      bean: {},
    });
  });
  it.each([0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1])("非法 ID %s 禁用核心读取", (id) => {
    const hook = renderHook(
      () => [useProjectDashboard(id), useProjectProgress(id), useProjectDashboardCompare([3, id])],
      { wrapper },
    );
    expect(hook.result.current.every((q) => q.fetchStatus === "idle")).toBe(true);
    expect(projectStatsApi.getDashboard).not.toHaveBeenCalled();
    expect(projectStatsApi.getProgress).not.toHaveBeenCalled();
    expect(projectStatsApi.compareDashboards).not.toHaveBeenCalled();
  });
  it("空选择和 51 项禁用", () => {
    renderHook(
      () => [
        useProjectDashboardCompare([]),
        useProjectDashboardCompare(Array.from({ length: 51 }, (_, i) => i + 1)),
      ],
      { wrapper },
    );
    expect(projectStatsApi.compareDashboards).not.toHaveBeenCalled();
  });
  it("同集合重排命中缓存；新集合无旧数据；A 迟到响应不覆盖 B", async () => {
    const hook = renderHook(({ ids }) => useProjectDashboardCompare(ids), {
      wrapper,
      initialProps: { ids: [3, 4] },
    });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    hook.rerender({ ids: [4, 3, 4] });
    expect(projectStatsApi.compareDashboards).toHaveBeenCalledTimes(1);
    let resolveA!: (data: ReturnType<typeof dashboardFixture>[]) => void;
    vi.mocked(projectStatsApi.compareDashboards).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveA = resolve;
        }),
    );
    hook.rerender({ ids: [5] });
    expect(hook.result.current.data).toBeUndefined();
    hook.rerender({ ids: [6] });
    await waitFor(() => expect(hook.result.current.data?.[0].projectId).toBe(6));
    await act(async () => resolveA([dashboardFixture(5)]));
    expect(hook.result.current.data?.[0].projectId).toBe(6);
  });
  it("首次失败、后台失败保留 data，成功 null 不恢复旧数据", async () => {
    vi.mocked(projectStatsApi.getDashboard).mockRejectedValueOnce(new Error("首次失败"));
    const hook = renderHook(() => useProjectDashboard(3), { wrapper });
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(hook.result.current.data).toBeUndefined();
    await act(async () => {
      await hook.result.current.refetch();
    });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    const good = hook.result.current.data;
    vi.mocked(projectStatsApi.getDashboard).mockRejectedValueOnce(new Error("后台失败"));
    await act(async () => {
      await hook.result.current.refetch();
    });
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(hook.result.current.data).toEqual(good);
    vi.mocked(projectStatsApi.getDashboard).mockResolvedValueOnce(null as never);
    await act(async () => {
      await hook.result.current.refetch();
    });
    await waitFor(() => expect(hook.result.current.data).toBeNull());
  });
  it("不匹配的主项目和异常 compare 进入错误分支", async () => {
    vi.mocked(projectStatsApi.getDashboard).mockResolvedValue(dashboardFixture(8));
    vi.mocked(projectStatsApi.compareDashboards).mockResolvedValue([dashboardFixture(3)]);
    const hook = renderHook(() => [useProjectDashboard(3), useProjectDashboardCompare([3, 4])], {
      wrapper,
    });
    await waitFor(() => expect(hook.result.current.every((q) => q.isError)).toBe(true));
  });
  it("会话失效取消查询、清缓存，旧会话迟到响应不能复活", async () => {
    let resolve!: (data: ReturnType<typeof dashboardFixture>) => void;
    vi.mocked(projectStatsApi.getDashboard).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    setQueryCacheClearer(() => {
      void client.cancelQueries();
      client.clear();
    });
    const hook = renderHook(() => useProjectDashboard(3), { wrapper });
    await waitFor(() => expect(projectStatsApi.getDashboard).toHaveBeenCalled());
    act(() => useAuthStore.getState().invalidateSessionFromClient());
    await act(async () => resolve(dashboardFixture(3)));
    expect(hook.result.current.data).toBeUndefined();
    expect(client.getQueryData(queryKeys.project.dashboard(3))).toBeUndefined();
    act(() => useAuthStore.setState({ isAuthenticated: true }));
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(projectStatsApi.getDashboard).toHaveBeenCalledTimes(2);
  });
});
