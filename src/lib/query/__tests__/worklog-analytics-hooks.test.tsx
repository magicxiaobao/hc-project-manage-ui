// @vitest-environment jsdom
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { workLogApi } from "@/lib/api/worklog";
import { useAuthStore } from "@/lib/api/auth-store";
import { useWorkLogAnalytics, useWorkLogStatistics } from "../hooks/useWorkLogAnalytics";
import { statisticsFixture, analyticsFixture } from "@/lib/__tests__/worklog-analytics-fixtures";
const params = { startDate: "2026-10-01", endDate: "2026-10-31", projectIds: [7] };
const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return {
    client,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}
beforeEach(() => useAuthStore.setState({ isAuthenticated: true }));
afterEach(() => {
  cleanup();
  clients.forEach((c) => c.clear());
  clients.length = 0;
  vi.restoreAllMocks();
  useAuthStore.setState({ isAuthenticated: false });
});
it("未登录/无应用/关闭/无项目/非法日期/ID 不请求；queryFn 再防手动 refetch", async () => {
  const api = vi.spyOn(workLogApi, "getAnalytics");
  const stat = vi.spyOn(workLogApi, "getProjectStatisticsList");
  const s = setup();
  for (const input of [
    null,
    { ...params, projectIds: [] },
    { ...params, endDate: "bad" },
    { ...params, startDate: "2026-11-01" },
    { ...params, projectIds: [0] },
  ]) {
    const h = renderHook(() => useWorkLogAnalytics(input), s);
    expect(h.result.current.fetchStatus).toBe("idle");
    await act(async () => {
      await h.result.current.refetch();
    });
    h.unmount();
  }
  renderHook(() => useWorkLogAnalytics(params, false), s);
  useAuthStore.setState({ isAuthenticated: false });
  const h = renderHook(() => useWorkLogStatistics("projects", params), s);
  await act(async () => {
    await h.result.current.refetch();
  });
  expect(api).not.toHaveBeenCalled();
  expect(stat).not.toHaveBeenCalled();
});
it.each(["projects", "users", "tasks"] as const)(
  "POST statistics/%s 精确消费字段/归一 key",
  async (dimension) => {
    const method = {
      projects: "getProjectStatisticsList",
      users: "getUserStatisticsList",
      tasks: "getTaskStatisticsList",
    } as const;
    const api = vi.spyOn(workLogApi, method[dimension]).mockResolvedValue([statisticsFixture()]);
    const h = renderHook(
      () =>
        useWorkLogStatistics(dimension, {
          ...params,
          projectIds: [9, 7, 9],
          userIds: [42, 4, 42],
          taskIds: [8, 3, 8],
        }),
      setup(),
    );
    await waitFor(() => expect(h.result.current.isSuccess).toBe(true));
    expect(api).toHaveBeenCalledWith({
      ...params,
      projectIds: [7, 9],
      ...(dimension === "users"
        ? { userIds: [4, 42] }
        : dimension === "tasks"
          ? { taskIds: [3, 8] }
          : {}),
    });
  },
);
it("POST analytics 只消费日期/项目；相同月/范围去重，不同月份独立失败", async () => {
  const api = vi.spyOn(workLogApi, "getAnalytics").mockImplementation(async (p) => {
    if (p.startDate === "2026-09-01") throw new Error("九月失败");
    return analyticsFixture();
  });
  const s = setup();
  const h = renderHook(
    () => ({
      range: useWorkLogAnalytics({ ...params, userIds: [42], taskIds: [8] }),
      month: useWorkLogAnalytics({ ...params, projectIds: [7, 7] }),
    }),
    s,
  );
  await waitFor(() => expect(h.result.current.month.isSuccess).toBe(true));
  expect(api).toHaveBeenCalledTimes(1);
  expect(api).toHaveBeenCalledWith(params);
  const other = renderHook(() => useWorkLogAnalytics({ ...params, startDate: "2026-09-01" }), s);
  await waitFor(() => expect(other.result.current.isError).toBe(true));
  expect(h.result.current.range.isSuccess).toBe(true);
});
it("迟到旧项目响应隔离；新 key 无 placeholderData；结果不污染新项目", async () => {
  let resolveOld!: (rows: ReturnType<typeof statisticsFixture>[]) => void;
  const api = vi.spyOn(workLogApi, "getProjectStatisticsList").mockImplementation((p) =>
    p.projectIds?.[0] === 7
      ? new Promise((resolve) => {
          resolveOld = resolve;
        })
      : Promise.resolve([statisticsFixture({ projectId: 9, totalHours: 9 })]),
  );
  const h = renderHook(
    ({ id }) => useWorkLogStatistics("projects", { ...params, projectIds: [id] }),
    { ...setup(), initialProps: { id: 7 } },
  );
  await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
  h.rerender({ id: 9 });
  expect(h.result.current.data).toBeUndefined();
  await waitFor(() => expect(h.result.current.data?.[0].totalHours).toBe(9));
  await act(async () => resolveOld([statisticsFixture({ totalHours: 999 })]));
  expect(h.result.current.data?.[0].projectId).toBe(9);
});
