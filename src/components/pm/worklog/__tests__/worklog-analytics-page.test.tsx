// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  createRoute,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { readFileSync } from "node:fs";
import { mockWorkLogApis, renderWorkLogContent } from "./worklog-test-support";
import { WorkLogAnalyticsPage } from "../../worklog-analytics-page";
import { WorkLogListPage } from "../../worklog-list-page";
import { workLogApi } from "@/lib/api/worklog";
import {
  TOKEN_STORAGE_KEY,
  REFRESH_TOKEN_STORAGE_KEY,
  USER_INFO_STORAGE_KEY,
} from "@/lib/api/client";
import { projectApi } from "@/lib/api/project";
import { useAuthStore } from "@/lib/api/auth-store";
import { queryKeys } from "@/lib/query/keys";
import { statisticsFixture, analyticsFixture } from "@/lib/__tests__/worklog-analytics-fixtures";
import { Route as analyticsRoute } from "@/routes/worklogs_.analytics";
vi.mock("@/components/pm/shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
const clients: QueryClient[] = [];
const histories: { destroy: () => void }[] = [];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 5));
  mockWorkLogApis();
  vi.spyOn(workLogApi, "getProjectStatisticsList").mockResolvedValue([
    statisticsFixture(),
    statisticsFixture({ statisticDate: "2026-10-06", totalHours: 2.5 }),
  ]);
  vi.spyOn(workLogApi, "getUserStatisticsList").mockResolvedValue([
    statisticsFixture({ userId: 42, userCnName: "用户四二" }),
  ]);
  vi.spyOn(workLogApi, "getTaskStatisticsList").mockResolvedValue([
    statisticsFixture({ taskId: null }),
  ]);
  vi.spyOn(workLogApi, "getAnalytics").mockResolvedValue(analyticsFixture());
});
afterEach(() => {
  cleanup();
  histories.forEach((h) => h.destroy());
  histories.length = 0;
  clients.forEach((c) => c.clear());
  clients.length = 0;
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
  useAuthStore.setState({ isAuthenticated: false, user: null });
});
async function mount(browser = false) {
  const view = await renderWorkLogContent(<WorkLogAnalyticsPage />, browser);
  clients.push(view.client);
  histories.push(view.router.history);
  return view;
}
function field(label: string) {
  return screen.getByLabelText(new RegExp(label)) as HTMLInputElement;
}
async function addProject(id = "7") {
  const picker = await screen.findByLabelText("项目集合");
  await waitFor(() => expect(picker.querySelector(`option[value="${id}"]`)).toBeTruthy());
  fireEvent.change(picker, { target: { value: id } });
}
async function apply() {
  fireEvent.click(screen.getByText("应用筛选"));
  await screen.findByRole("region", { name: "所选范围总工时" });
}
const rangeCard = () => within(screen.getByRole("region", { name: "所选范围总工时" }));
it("未登录/未应用不查询；本月与范围去重，编辑/本月快捷不请求，完整卡片/柱/表一致", async () => {
  useAuthStore.setState({ isAuthenticated: false });
  await mount();
  expect(projectApi.getProjectList).not.toHaveBeenCalled();
  expect(workLogApi.getProjectStatisticsList).not.toHaveBeenCalled();
  act(() => useAuthStore.setState({ isAuthenticated: true }));
  await addProject();
  expect(workLogApi.getProjectStatisticsList).not.toHaveBeenCalled();
  await apply();
  await waitFor(() => expect(rangeCard().getByText("3.75 小时")).toBeTruthy());
  expect(workLogApi.getProjectStatisticsList).toHaveBeenCalledTimes(1);
  expect(workLogApi.getProjectStatisticsList).toHaveBeenCalledWith({
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    projectIds: [7],
  });
  expect(screen.getByRole("img", { name: /按实体分组/ })).toBeTruthy();
  expect(within(screen.getByRole("table")).getByText("3.75")).toBeTruthy();
  fireEvent.change(field("开始日期"), { target: { value: "2026-09-01" } });
  fireEvent.click(screen.getByText("本月"));
  expect(field("开始日期").value).toBe("2026-10-01");
  expect(workLogApi.getProjectStatisticsList).toHaveBeenCalledTimes(1);
});
it("RequiredMark/所有字段错误都紧贴输入，首错获焦点；编辑只清自身错误", async () => {
  await mount();
  fireEvent.change(field("开始日期"), { target: { value: "" } });
  fireEvent.change(field("结束日期"), { target: { value: "" } });
  fireEvent.click(screen.getByText("应用筛选"));
  expect(document.querySelectorAll(".sr-only")).toHaveLength(3);
  for (const key of ["startDate", "endDate", "projectIds"]) {
    const input = document.getElementById(`analytics-${key}`)!;
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.nextElementSibling?.id).toBe(`analytics-${key}-error`);
    expect(within(input.nextElementSibling as HTMLElement).getByRole("alert")).toBeTruthy();
  }
  expect(document.activeElement).toBe(field("开始日期"));
  fireEvent.change(field("开始日期"), { target: { value: "2026-10-01" } });
  expect(screen.queryByText("开始日期不能为空")).toBeNull();
  expect(screen.getByText("结束日期不能为空")).toBeTruthy();
  expect(screen.getByText("请至少选择一个项目")).toBeTruthy();
});
it("逆序只报 endDate；编辑 startDate 清跨字段错误，无效应用保留已应用数据", async () => {
  await mount();
  await addProject();
  await apply();
  await waitFor(() => expect(rangeCard().getByText("3.75 小时")).toBeTruthy());
  fireEvent.change(field("开始日期"), { target: { value: "2026-11-01" } });
  fireEvent.click(screen.getByText("应用筛选"));
  expect(document.getElementById("analytics-endDate-error")?.textContent).toBe(
    "结束日期不能早于开始日期",
  );
  expect(document.getElementById("analytics-startDate-error")?.textContent).toBe("");
  expect(workLogApi.getProjectStatisticsList).toHaveBeenCalledTimes(1);
  expect(rangeCard().getByText("3.75 小时")).toBeTruthy();
  fireEvent.change(field("开始日期"), { target: { value: "2026-10-02" } });
  expect(screen.queryByText("结束日期不能早于开始日期")).toBeNull();
});
it("集合跨选项分页保留名称/可移除；用户/任务仅应用对应 ID，专项六路径不主动请求", async () => {
  const untyped = [
    "getTrendAnalysis",
    "getEfficiencyAnalysis",
    "getCollaborationAnalysis",
    "getProjectStatistics",
    "getUserStatistics",
    "getTaskStatistics",
  ] as const;
  for (const name of untyped) vi.spyOn(workLogApi, name);
  await mount();
  await addProject();
  vi.mocked(projectApi.getProjectList).mockResolvedValue({
    list: [{ id: 9, projectName: "项目九", projectKey: "P9" }] as never[],
    total: 21,
    pageNumber: 2,
    pageSize: 20,
  });
  fireEvent.click(screen.getByText("项目下一页"));
  await addProject("9");
  expect(screen.getByText("项目七 (P7)")).toBeTruthy();
  fireEvent.change(field("统计视图"), { target: { value: "users" } });
  fireEvent.change(field("用户 ID 集合"), { target: { value: "42,4,42" } });
  await apply();
  await waitFor(() =>
    expect(workLogApi.getUserStatisticsList).toHaveBeenCalledWith({
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      projectIds: [7, 9],
      userIds: [4, 42],
    }),
  );
  fireEvent.change(field("统计视图"), { target: { value: "tasks" } });
  fireEvent.change(field("任务 ID 集合"), { target: { value: "0,,8" } });
  fireEvent.click(screen.getByText("应用筛选"));
  expect(screen.getByText("ID 须为逗号分隔的正安全整数，不得包含空项")).toBeTruthy();
  expect(workLogApi.getTaskStatisticsList).not.toHaveBeenCalled();
  fireEvent.change(field("任务 ID 集合"), { target: { value: "8,3,8" } });
  await apply();
  await waitFor(() =>
    expect(workLogApi.getTaskStatisticsList).toHaveBeenCalledWith({
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      projectIds: [7, 9],
      taskIds: [3, 8],
    }),
  );
  await screen.findByRole("rowheader", { name: "未关联任务" });
  for (const name of untyped) expect(workLogApi[name]).not.toHaveBeenCalled();
  expect(screen.getAllByText(/数据暂未提供，待后端联调确认/)).toHaveLength(6);
});
it("本月和所选范围独立失败/重试；失败保留后续草稿，后台失败标明旧数据", async () => {
  vi.mocked(workLogApi.getProjectStatisticsList).mockImplementation(async (p) => {
    if (p.startDate === "2026-09-01") throw new Error("范围无权限");
    return [statisticsFixture()];
  });
  await mount();
  await addProject();
  fireEvent.change(field("开始日期"), { target: { value: "2026-09-01" } });
  await apply();
  await screen.findByText(/所选范围总工时加载失败/);
  expect(
    within(screen.getByRole("region", { name: "本月总工时" })).getByText("1.25 小时"),
  ).toBeTruthy();
  fireEvent.change(field("结束日期"), { target: { value: "2026-10-20" } });
  fireEvent.click(screen.getByText("重试所选范围总工时"));
  await waitFor(() => expect(workLogApi.getProjectStatisticsList).toHaveBeenCalledTimes(3));
  expect(field("结束日期").value).toBe("2026-10-20");
  fireEvent.click(screen.getByText("恢复已应用筛选"));
  await screen.findByRole("dialog", { name: "是否放弃修改？" });
  fireEvent.click(screen.getByText("放弃修改"));
  expect(field("结束日期").value).toBe("2026-10-31");
});
it.each([
  { data: [], text: "该范围暂无工时记录", value: "0 小时" },
  { data: null, text: "数据暂未提供；部分小时缺失时不展示小计为总工时。", value: "—（未提供）" },
  {
    data: [statisticsFixture({ totalHours: null })],
    text: "数据暂未提供；部分小时缺失时不展示小计为总工时。",
    value: "—（未提供）",
  },
  {
    data: [statisticsFixture({ totalHours: -1 })],
    text: "统计响应异常，无法确认完整总工时。",
    value: "—（响应异常）",
  },
  { data: [statisticsFixture({ totalHours: 0 })], text: null, value: "0 小时" },
])("响应状态 $value / $text", async ({ data, text, value }) => {
  vi.mocked(workLogApi.getProjectStatisticsList).mockResolvedValue(data as never);
  await mount();
  await addProject();
  await apply();
  await waitFor(() => expect(rangeCard().getByText(value)).toBeTruthy());
  if (text) expect(screen.getByText(text)).toBeTruthy();
});
it("分页只切表格，全部实体柱图与总工时保留", async () => {
  vi.mocked(workLogApi.getProjectStatisticsList).mockResolvedValue(
    Array.from({ length: 11 }, (_, i) => statisticsFixture({ projectId: i + 1, totalHours: 1 })),
  );
  await mount();
  await addProject();
  await apply();
  await waitFor(() => expect(rangeCard().getByText("11 小时")).toBeTruthy());
  fireEvent.click(screen.getByText("实体下一页"));
  expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2);
  expect(rangeCard().getByText("11 小时")).toBeTruthy();
  expect(screen.getByRole("img", { name: /按实体分组/ }).querySelectorAll("rect")).toHaveLength(11);
});
it("综合卡片只读 overview，趋势只读 dailyTrend，不读取未知摘要/效率/协作指标", async () => {
  await mount();
  await addProject();
  fireEvent.change(field("统计视图"), { target: { value: "analytics" } });
  await apply();
  await waitFor(() => expect(rangeCard().getByText("4 小时")).toBeTruthy());
  expect(screen.getByRole("img", { name: /日工时趋势/ })).toBeTruthy();
  expect(screen.getByText("真实洞察")).toBeTruthy();
  expect(screen.queryByText(/999|888/)).toBeNull();
  expect(workLogApi.getProjectStatisticsList).not.toHaveBeenCalled();
  expect(workLogApi.getAnalytics).toHaveBeenCalledWith({
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    projectIds: [7],
  });
});
it("综合 overview 缺失不回退 summary；全未知日趋势不制造图形", async () => {
  vi.mocked(workLogApi.getAnalytics).mockResolvedValue(
    analyticsFixture({
      overview: null,
      dailyTrend: [{ ...analyticsFixture().dailyTrend![0], hours: null }],
      insights: null,
    }),
  );
  await mount();
  await addProject();
  fireEvent.change(field("统计视图"), { target: { value: "analytics" } });
  await apply();
  await screen.findByText("综合概览数据暂未提供");
  expect(screen.getByText("日工时趋势数据暂未提供")).toBeTruthy();
  expect(screen.queryByRole("img")).toBeNull();
});
it.each(["date", "project", "view"] as const)(
  "dirty %s 后退/刷新拦截，继续保留、放弃离开",
  async (kind) => {
    const view = await mount(true);
    if (kind === "project") await addProject();
    else
      fireEvent.change(field(kind === "date" ? "开始日期" : "统计视图"), {
        target: { value: kind === "date" ? "2026-09-01" : "users" },
      });
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    act(() => view.router.history.back());
    await screen.findByRole("dialog", { name: "是否放弃修改？" });
    fireEvent.click(screen.getByText("继续编辑"));
    await waitFor(() => expect(window.location.pathname).toBe("/form"));
    expect(screen.getByRole("heading", { name: "工时统计分析" })).toBeTruthy();
    act(() => view.router.history.back());
    await screen.findByRole("dialog", { name: "是否放弃修改？" });
    fireEvent.click(screen.getByText("放弃修改"));
    await screen.findByText("已离开");
  },
);
it("应用/恢复后干净，下一次编辑重新布防；路由跳转及异步返回不清后来的草稿", async () => {
  let resolve!: (rows: ReturnType<typeof statisticsFixture>[]) => void;
  vi.mocked(workLogApi.getProjectStatisticsList).mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const view = await mount();
  await addProject();
  await apply();
  const clean = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(clean);
  expect(clean.defaultPrevented).toBe(false);
  fireEvent.change(field("开始日期"), { target: { value: "2026-09-01" } });
  await act(async () => resolve([statisticsFixture()]));
  expect(field("开始日期").value).toBe("2026-09-01");
  act(() => view.router.history.push("/away"));
  await screen.findByRole("dialog", { name: "是否放弃修改？" });
  fireEvent.click(screen.getByText("继续编辑"));
  fireEvent.click(screen.getByText("恢复已应用筛选"));
  await screen.findByRole("dialog", { name: "是否放弃修改？" });
  fireEvent.click(screen.getByText("放弃修改"));
  expect(field("开始日期").value).toBe("2026-10-01");
  fireEvent.change(field("结束日期"), { target: { value: "2026-10-20" } });
  act(() => view.router.history.push("/away"));
  await screen.findByRole("dialog", { name: "是否放弃修改？" });
});
it("登录失效后表单保留草稿，重新登录恢复字段", async () => {
  await mount();
  await addProject();
  fireEvent.change(field("开始日期"), { target: { value: "2026-09-01" } });
  act(() => useAuthStore.setState({ isAuthenticated: false }));
  expect(field("开始日期").value).toBe("2026-09-01");
  act(() => useAuthStore.setState({ isAuthenticated: true }));
  expect(field("开始日期").value).toBe("2026-09-01");
});
it("生成路由是根下独立叶页面；真实路由入口、直接访问、返回及登录恢复", async () => {
  window.scrollTo = vi.fn();
  vi.spyOn(useAuthStore.getState(), "hydrate");
  localStorage.setItem(TOKEN_STORAGE_KEY, "test-token");
  localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, "test-refresh");
  localStorage.setItem(USER_INFO_STORAGE_KEY, JSON.stringify(useAuthStore.getState().user));
  useAuthStore.setState({ isAuthenticated: false, user: null });
  const generated = readFileSync("src/routeTree.gen.ts", "utf8");
  expect(generated).toMatch(
    /const WorklogsAnalyticsRoute = WorklogsAnalyticsRouteImport.update\(\{\s*id: '\/worklogs_\/analytics',\s*path: '\/worklogs\/analytics',\s*getParentRoute: \(\) => rootRouteImport/,
  );
  const root = createRootRoute({ component: Outlet });
  const analytics = analyticsRoute.update({
    id: "/worklogs_/analytics",
    path: "/worklogs/analytics",
    getParentRoute: () => root,
  } as never);
  const list = createRoute({
    getParentRoute: () => root,
    path: "/worklogs",
    component: WorkLogListPage,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const router = createRouter({
    routeTree: root.addChildren([list, analytics]),
    history: createMemoryHistory({ initialEntries: ["/worklogs/analytics"] }),
  });
  await router.load();
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await screen.findByRole("heading", { name: "工时统计分析" });
  expect(analytics.fullPath).toBe("/worklogs/analytics");
  fireEvent.click(screen.getByText("返回工时列表"));
  await screen.findByRole("heading", { name: "工时管理" });
  fireEvent.click(screen.getByText("统计分析"));
  await screen.findByRole("heading", { name: "工时统计分析" });
  expect(useAuthStore.getState().hydrate).toHaveBeenCalled();
});

it("后台同 key 重取失败保留数据并明确旧数据；重试恢复", async () => {
  const view = await mount();
  await addProject();
  await apply();
  await waitFor(() => expect(rangeCard().getByText("3.75 小时")).toBeTruthy());
  vi.mocked(workLogApi.getProjectStatisticsList).mockRejectedValue(new Error("刷新失败"));
  await act(async () => {
    await view.client.invalidateQueries({
      queryKey: queryKeys.workLog.all,
      predicate: (q) => q.queryKey[2] === "statisticsGroup",
    });
  });
  await waitFor(() => expect(screen.getAllByText(/旧数据，刷新失败/)).toHaveLength(2));
  expect(rangeCard().getByText("3.75 小时")).toBeTruthy();
  expect(screen.getByRole("img", { name: /按实体分组/ })).toBeTruthy();
  vi.mocked(workLogApi.getProjectStatisticsList).mockResolvedValue([
    statisticsFixture({ totalHours: 5 }),
  ]);
  fireEvent.click(screen.getByText("重试所选范围总工时"));
  await waitFor(() => expect(rangeCard().getByText("5 小时")).toBeTruthy());
  expect(screen.queryByText(/旧数据，刷新失败/)).toBeNull();
});
it("新项目应用后不显示旧 key；旧请求迟到不覆盖数据或草稿", async () => {
  let resolveOld!: (rows: ReturnType<typeof statisticsFixture>[]) => void;
  vi.mocked(projectApi.getProjectList).mockResolvedValue({
    list: [
      { id: 7, projectName: "项目七", projectKey: "P7" },
      { id: 9, projectName: "项目九", projectKey: "P9" },
    ] as never[],
    total: 2,
    pageNumber: 1,
    pageSize: 20,
  });
  vi.mocked(workLogApi.getProjectStatisticsList).mockImplementation((p) =>
    p.projectIds?.[0] === 7
      ? new Promise((resolve) => {
          resolveOld = resolve;
        })
      : Promise.resolve([statisticsFixture({ projectId: 9, totalHours: 9 })]),
  );
  await mount();
  await addProject();
  await apply();
  await waitFor(() => expect(resolveOld).toBeTypeOf("function"));
  fireEvent.click(screen.getByText("移除项目 #7"));
  await addProject("9");
  await apply();
  await waitFor(() => expect(rangeCard().getByText("9 小时")).toBeTruthy());
  fireEvent.change(field("结束日期"), { target: { value: "2026-10-20" } });
  await act(async () => resolveOld([statisticsFixture({ totalHours: 999 })]));
  expect(rangeCard().getByText("9 小时")).toBeTruthy();
  expect(field("结束日期").value).toBe("2026-10-20");
  expect(document.body.textContent).not.toContain("999");
});
it("自然月变化后更新月 key，不将旧月份卡片标为本月", async () => {
  await mount();
  await addProject();
  await apply();
  await waitFor(() => expect(rangeCard().getByText("3.75 小时")).toBeTruthy());
  vi.setSystemTime(new Date(2026, 10, 1));
  fireEvent.click(screen.getByText("应用筛选"));
  await waitFor(() =>
    expect(workLogApi.getProjectStatisticsList).toHaveBeenLastCalledWith({
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      projectIds: [7],
    }),
  );
  expect(screen.getByText("本月口径：2026-11-01 至 2026-11-30")).toBeTruthy();
  expect(screen.getByText(/2026-10-01 至 2026-10-31 · 项目 ID/)).toBeTruthy();
});
it("项目权限/加载失败给出错误与重试；无项目校验仍能聚焦项目字段", async () => {
  vi.mocked(projectApi.getProjectList).mockRejectedValue(new Error("项目无权限"));
  await mount();
  await screen.findByText(/项目加载失败/);
  fireEvent.click(screen.getByText("应用筛选"));
  expect(document.activeElement).toBe(screen.getByLabelText("项目集合"));
  expect(screen.getByText("请至少选择一个项目")).toBeTruthy();
  expect(workLogApi.getProjectStatisticsList).not.toHaveBeenCalled();
  vi.mocked(projectApi.getProjectList).mockResolvedValue({
    list: [{ id: 7, projectName: "项目七", projectKey: "P7" }] as never[],
    total: 1,
    pageNumber: 1,
    pageSize: 20,
  });
  fireEvent.click(screen.getByText("重试项目"));
  await addProject();
  expect(screen.queryByText("请至少选择一个项目")).toBeNull();
});
