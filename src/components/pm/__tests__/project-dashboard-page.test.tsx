// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectDashboardPage } from "../project-dashboard-page";
import { StatisticsProjectSelector } from "../project-dashboard/selector";
import { DefectDistributionPieSvg, TaskCompletionTrendSvg } from "../project-dashboard/charts";
import { useAuthStore } from "@/lib/api/auth-store";
import { projectStatsApi } from "@/lib/api/project-stats";
import { defectApi } from "@/lib/api/defect";
import {
  ApiBusinessError,
  HttpResponseError,
  REFRESH_TOKEN_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
  USER_INFO_STORAGE_KEY,
} from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import { setQueryCacheClearer } from "@/lib/query/session";
import {
  dashboardFixture,
  defectFixture,
  progressFixture,
  statisticsFixture,
} from "@/lib/__tests__/project-dashboard-fixtures";

// HeroUI 动画替换为 native button，query/API/选择状态及 SVG 均真实。
vi.mock("@heroui/react", () => ({
  Button: ({
    children,
    onPress,
    isDisabled,
    ...props
  }: {
    children: ReactNode;
    onPress?: () => void;
    isDisabled?: boolean;
    "aria-label"?: string;
  }) => (
    <button disabled={isDisabled} onClick={onPress} aria-label={props["aria-label"]}>
      {children}
    </button>
  ),
}));
let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  useAuthStore.setState({ isAuthenticated: true, user: null });
  vi.spyOn(projectStatsApi, "getDashboard").mockImplementation(async (id) => dashboardFixture(id));
  vi.spyOn(projectStatsApi, "getProgress").mockImplementation(async (id) => progressFixture(id));
  vi.spyOn(projectStatsApi, "compareDashboards").mockImplementation(async (ids) =>
    ids
      .slice()
      .reverse()
      .map((id) => dashboardFixture(id)),
  );
  vi.spyOn(projectStatsApi, "getStatistics").mockResolvedValue(statisticsFixture);
  vi.spyOn(projectStatsApi, "findStatisticsProjectOptions").mockResolvedValue({
    list: [
      { id: 3, projectName: "真实项目3" },
      { id: 4, projectName: "同名项目" },
      { id: 5, projectName: "同名项目" },
    ],
    total: 3,
    pageNumber: 1,
    pageSize: 20,
  });
  vi.spyOn(defectApi, "getDefectStatistics").mockResolvedValue(defectFixture);
});
afterEach(() => {
  cleanup();
  client.clear();
  setQueryCacheClearer(null);
  vi.restoreAllMocks();
  localStorage.clear();
  useAuthStore.setState({ isAuthenticated: false, user: null });
});
function mount(projectId = "3") {
  return render(
    <QueryClientProvider client={client}>
      <ProjectDashboardPage projectId={projectId} />
    </QueryClientProvider>,
  );
}
async function ready() {
  await screen.findByRole("heading", { name: "项目仪表盘 · 真实项目3" });
  await screen.findByText("主要：3 个（75.0%）");
}
async function refresh() {
  fireEvent.click(screen.getByRole("button", { name: "刷新统计" }));
  await waitFor(() => expect(client.isFetching()).toBe(0));
}
const forbidden = () =>
  new ApiBusinessError({ code: 10105, msg: "没有操作该功能的权限", result: null });

describe("ProjectDashboardPage", () => {
  it("真实字段、取消口径、路由项目和 G1/G2 提示；图形有文字数据", async () => {
    mount();
    await ready();
    expect(projectStatsApi.getDashboard).toHaveBeenCalledWith(3);
    expect(projectStatsApi.getProgress).toHaveBeenCalledWith(3);
    expect(defectApi.getDefectStatistics).toHaveBeenCalledWith(3);
    const kpi = screen.getByRole("region", { name: "项目 KPI" });
    expect(within(kpi).getByText("未完成").parentElement?.textContent).toBe("未完成3");
    expect(within(kpi).getByText("已取消").parentElement?.textContent).toBe("已取消1");
    expect(within(kpi).getByText("版本数").parentElement?.textContent).toBe("版本数0");
    expect(screen.getByText("任务完成率：33%")).toBeTruthy();
    expect(screen.queryByText("任务完成率：99%")).toBeNull();
    expect(screen.getByText("任务完成趋势数据暂未提供")).toBeTruthy();
    expect(screen.getByText(/维度待业务确认/)).toBeTruthy();
    expect(
      screen
        .getByRole("img", { name: /同日任务：2026-10-05/ })
        .querySelector("rect")
        ?.getAttribute("width"),
    ).toBe("600");
    expect(screen.getByText("未排期：缺少预计开始或结束日期")).toBeTruthy();
    expect(screen.queryByRole("img", { name: "任务完成趋势（任务数）" })).toBeNull();
  });
  it("首次 pending 骨架，不请求缺陷区直到登录和项目有效", async () => {
    vi.mocked(projectStatsApi.getDashboard).mockImplementation(() => new Promise(() => {}));
    mount();
    expect(screen.getByRole("status", { name: "项目仪表盘加载中" })).toBeTruthy();
    expect(defectApi.getDefectStatistics).not.toHaveBeenCalled();
  });
  it.each(["0", "-1", "1.5", "9007199254740992", "bad"])("非法路由 %s 不请求", (id) => {
    mount(id);
    expect(screen.getByText("项目 ID 无效")).toBeTruthy();
    expect(projectStatsApi.getDashboard).not.toHaveBeenCalled();
    expect(projectStatsApi.getStatistics).not.toHaveBeenCalled();
    expect(defectApi.getDefectStatistics).not.toHaveBeenCalled();
  });
  it("未登录不挂载任何业务 query", () => {
    useAuthStore.setState({ isAuthenticated: false });
    mount();
    expect(screen.getByText("请登录后查看项目仪表盘。")).toBeTruthy();
    expect(projectStatsApi.getDashboard).not.toHaveBeenCalled();
    expect(defectApi.getDefectStatistics).not.toHaveBeenCalled();
  });
  it.each(["getDashboard", "getProgress", "compareDashboards"] as const)(
    "首次核心 %s 失败全页错误，重试成功恢复",
    async (method) => {
      vi.mocked(projectStatsApi[method]).mockRejectedValueOnce(new Error("首次读取失败"));
      mount();
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("首次读取失败");
      expect(screen.queryByRole("region", { name: "项目 KPI" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "重试项目仪表盘" }));
      await ready();
    },
  );
  it("同 query 后台失败保留 KPI/图表，横幅重试后更新；空任务清旧条", async () => {
    mount();
    await ready();
    vi.mocked(projectStatsApi.getDashboard).mockRejectedValueOnce(new Error("后台断网"));
    await refresh();
    expect(await screen.findByText(/刷新失败，显示上次成功数据/)).toBeTruthy();
    expect(screen.getByText("任务完成率：33%")).toBeTruthy();
    vi.mocked(projectStatsApi.getDashboard).mockResolvedValueOnce(
      dashboardFixture(3, { progress: 66 }),
    );
    fireEvent.click(screen.getByRole("button", { name: "重试项目仪表盘" }));
    await screen.findByText("任务完成率：66%");
    vi.mocked(projectStatsApi.getProgress).mockResolvedValueOnce({
      ...progressFixture(),
      tasks: [],
    });
    await refresh();
    await screen.findByText("暂无任务");
    expect(screen.queryByRole("img", { name: /同日任务/ })).toBeNull();
  });
  it("0/null 和成功 null 项目清除旧结果", async () => {
    vi.mocked(projectStatsApi.getDashboard).mockResolvedValueOnce(
      dashboardFixture(3, { totalTasks: 0, progress: 0, milestoneProgress: null, bugCount: null }),
    );
    mount();
    await ready();
    expect(screen.getByText("任务完成率：0%")).toBeTruthy();
    expect(screen.getByText("里程碑完成率：—（未知或异常）")).toBeTruthy();
    vi.mocked(projectStatsApi.getDashboard).mockResolvedValueOnce(null as never);
    await refresh();
    await screen.findByText("项目不存在或仪表盘数据未提供");
    expect(screen.queryByRole("region", { name: "项目 KPI" })).toBeNull();
  });
  it("主 dashboard 拒绝是全页无权", async () => {
    vi.mocked(projectStatsApi.getDashboard).mockRejectedValueOnce(forbidden());
    mount();
    await screen.findByText(/项目仪表盘：无权限/);
    expect(screen.queryByRole("region", { name: "项目 KPI" })).toBeNull();
  });
  it("权威 null 后刷新失败仍保留空结论和错误横幅，不恢复旧 KPI", async () => {
    vi.mocked(projectStatsApi.getDashboard).mockResolvedValueOnce(null as never);
    mount();
    await screen.findByText("项目不存在或仪表盘数据未提供");
    vi.mocked(projectStatsApi.getDashboard).mockRejectedValueOnce(new Error("空结论后刷新失败"));
    fireEvent.click(screen.getByRole("button", { name: "重试项目仪表盘" }));
    await screen.findByText(/空结论后刷新失败/);
    expect(screen.getByText("项目不存在或仪表盘数据未提供")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "项目 KPI" })).toBeNull();
  });
  it("甘特/缺陷/compare 首次拒绝仅影响各区；不剔除对比项目", async () => {
    vi.mocked(projectStatsApi.getProgress).mockRejectedValueOnce(
      new HttpResponseError("甘特拒绝", 403),
    );
    vi.mocked(defectApi.getDefectStatistics).mockRejectedValueOnce(forbidden());
    vi.mocked(projectStatsApi.compareDashboards).mockRejectedValueOnce(forbidden());
    mount();
    await screen.findByRole("region", { name: "项目 KPI" });
    await screen.findByText(/缺陷分布：无权限/);
    expect(screen.getByText(/任务计划：无权限/)).toBeTruthy();
    expect(screen.getByText(/项目对比：无权限/)).toBeTruthy();
    expect(projectStatsApi.compareDashboards).toHaveBeenCalledWith([3]);
    expect(screen.queryByRole("img", { name: /同日任务/ })).toBeNull();
    expect(screen.queryByRole("img", { name: "缺陷严重程度候选分布" })).toBeNull();
  });
  it("权限撤回后隐藏受限旧甘特、饼图和对比，保留 KPI", async () => {
    mount();
    await ready();
    vi.mocked(projectStatsApi.getProgress).mockRejectedValueOnce(forbidden());
    vi.mocked(defectApi.getDefectStatistics).mockRejectedValueOnce(forbidden());
    vi.mocked(projectStatsApi.compareDashboards).mockRejectedValueOnce(forbidden());
    await refresh();
    await screen.findByText(/缺陷分布：无权限/);
    expect(screen.getByRole("region", { name: "项目 KPI" })).toBeTruthy();
    expect(screen.queryByRole("img", { name: /同日任务/ })).toBeNull();
    expect(screen.queryByRole("img", { name: "缺陷严重程度候选分布" })).toBeNull();
    expect(screen.queryByRole("article", { name: "对比项目 真实项目3" })).toBeNull();
  });
  it("缺陷后台失败保留分布；零总量清饼图；独立重试", async () => {
    mount();
    await ready();
    vi.mocked(defectApi.getDefectStatistics).mockRejectedValueOnce(new Error("统计暂不可用"));
    await refresh();
    await screen.findByText(/缺陷分布：刷新失败/);
    expect(screen.getByRole("img", { name: "缺陷严重程度候选分布" })).toBeTruthy();
    vi.mocked(defectApi.getDefectStatistics).mockResolvedValueOnce({
      ...defectFixture,
      totalDefects: 0,
      severityStats: {},
    });
    fireEvent.click(screen.getByRole("button", { name: "重试缺陷分布" }));
    await screen.findByText("当前项目暂无缺陷");
    expect(screen.queryByRole("img", { name: "缺陷严重程度候选分布" })).toBeNull();
  });
  it("辅助 statistics/options 失败仅各区提示，可重试", async () => {
    vi.mocked(projectStatsApi.getStatistics).mockRejectedValueOnce(new Error("统计失败"));
    vi.mocked(projectStatsApi.findStatisticsProjectOptions).mockRejectedValueOnce(
      new Error("候选失败"),
    );
    mount();
    await ready();
    expect(screen.getByText(/统计概览：读取失败/)).toBeTruthy();
    expect(screen.getByText(/候选项目：读取失败/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "重试候选项目" }));
    await screen.findByRole("checkbox", { name: "同名项目 #4" });
  });
  it("选择从 A 到 B/C 更新图形和名称；保留主项目；清空不请求", async () => {
    vi.mocked(projectStatsApi.compareDashboards).mockImplementation(async (ids) =>
      ids
        .slice()
        .reverse()
        .map((id) =>
          dashboardFixture(id, { progress: id * 10, completedTasks: id, bugCount: id + 1 }),
        ),
    );
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "清空对比" }));
    expect(screen.getByText("请选择项目进行对比")).toBeTruthy();
    const calls = vi.mocked(projectStatsApi.compareDashboards).mock.calls.length;
    fireEvent.click(screen.getByRole("checkbox", { name: "同名项目 #4" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "同名项目 #5" }));
    await screen.findByRole("article", { name: "对比项目 真实项目4" });
    await screen.findByRole("article", { name: "对比项目 真实项目5" });
    expect(projectStatsApi.compareDashboards).toHaveBeenLastCalledWith([4, 5]);
    expect(screen.getByText("主项目 #3")).toBeTruthy();
    expect(screen.queryByRole("article", { name: "对比项目 真实项目3" })).toBeNull();
    const b = within(screen.getByRole("article", { name: "对比项目 真实项目4" }));
    expect(b.getByText("项目进度：40%")).toBeTruthy();
    expect(b.getByText("数量（个）：已完成任务 4 · 缺陷 5")).toBeTruthy();
    const c = within(screen.getByRole("article", { name: "对比项目 真实项目5" }));
    expect(c.getByText("项目进度：50%")).toBeTruthy();
    expect(c.getByText("数量（个）：已完成任务 5 · 缺陷 6")).toBeTruthy();
    expect(
      vi
        .mocked(projectStatsApi.compareDashboards)
        .mock.calls.slice(calls)
        .every(([ids]) => ids.length > 0),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "清空对比" }));
    const after = vi.mocked(projectStatsApi.compareDashboards).mock.calls.length;
    await act(async () => {});
    expect(projectStatsApi.compareDashboards).toHaveBeenCalledTimes(after);
  });
  it("新集合首次失败全页错误，不显示 A 的图表", async () => {
    mount();
    await ready();
    vi.mocked(projectStatsApi.compareDashboards).mockRejectedValueOnce(new Error("新集合失败"));
    fireEvent.click(screen.getByRole("checkbox", { name: "同名项目 #4" }));
    await screen.findByText(/新集合失败/);
    expect(screen.queryByRole("article", { name: "对比项目 真实项目3" })).toBeNull();
  });
  it("分页/名称搜索保留已选项，按 options.total 翻页，搜索回第 1 页", async () => {
    vi.mocked(projectStatsApi.findStatisticsProjectOptions).mockImplementation(async (params) => ({
      list: [{ id: params.page === 2 ? 5 : 4, projectName: "候选" }],
      total: 21,
      pageNumber: params.page,
      pageSize: 20,
    }));
    mount();
    await ready();
    fireEvent.click(screen.getByRole("checkbox", { name: "候选 #4" }));
    await screen.findByRole("article", { name: "对比项目 真实项目4" });
    fireEvent.click(screen.getByRole("button", { name: "下一页候选" }));
    await screen.findByRole("checkbox", { name: "候选 #5" });
    expect(screen.getByRole("button", { name: "移除 候选 #4" })).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "搜索项目名称" }), {
      target: { value: " 名称 " },
    });
    await waitFor(() =>
      expect(projectStatsApi.findStatisticsProjectOptions).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 20,
        bean: { projectName: "名称" },
      }),
    );
    expect(screen.getByRole("button", { name: "移除 候选 #4" })).toBeTruthy();
  });
  it("options 后台失败保留当前候选，合法空页清旧候选", async () => {
    mount();
    await ready();
    vi.mocked(projectStatsApi.findStatisticsProjectOptions).mockRejectedValueOnce(
      new Error("候选断网"),
    );
    await act(async () => {
      await client.refetchQueries({ queryKey: ["hc", "project", "statisticsOptions"] });
    });
    await screen.findByText(/候选项目：刷新失败/);
    expect(screen.getByRole("checkbox", { name: "同名项目 #4" })).toBeTruthy();
    vi.mocked(projectStatsApi.findStatisticsProjectOptions).mockResolvedValueOnce({
      list: [],
      total: 0,
      pageNumber: 1,
      pageSize: 20,
    });
    fireEvent.click(screen.getByRole("button", { name: "重试候选项目" }));
    await screen.findByText("暂无可选择项目");
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
  it("路由切换不沿用旧主项目、甘特、缺陷和选择快照", async () => {
    const view = mount();
    await ready();
    vi.mocked(projectStatsApi.getDashboard).mockImplementationOnce(() => new Promise(() => {}));
    view.rerender(
      <QueryClientProvider client={client}>
        <ProjectDashboardPage projectId="4" />
      </QueryClientProvider>,
    );
    expect(screen.queryByText("主项目 #3")).toBeNull();
    expect(screen.queryByRole("img", { name: /同日任务/ })).toBeNull();
    expect(screen.queryByText("主要：3 个（75.0%）")).toBeNull();
    expect(projectStatsApi.getDashboard).toHaveBeenLastCalledWith(4);
  });
  it("跨账号 hydrate 清缓存和局部选择，旧响应不在新账号呈现", async () => {
    setQueryCacheClearer(() => {
      void client.cancelQueries();
      client.clear();
    });
    useAuthStore.setState({
      user: {
        userId: "101",
        userName: "A",
        cnName: null,
        extraInfo: {},
        roles: [],
        authorities: [],
      },
    });
    mount();
    await ready();
    fireEvent.click(screen.getByRole("checkbox", { name: "同名项目 #4" }));
    await screen.findByRole("article", { name: "对比项目 真实项目4" });
    localStorage.setItem(TOKEN_STORAGE_KEY, "session-b");
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, "refresh-b");
    localStorage.setItem(
      USER_INFO_STORAGE_KEY,
      JSON.stringify({
        userId: "102",
        userName: "B",
        cnName: null,
        extraInfo: {},
        roles: [],
        authorities: [],
      }),
    );
    act(() => useAuthStore.getState().hydrate());
    await ready();
    expect(screen.getByText("已选 1/50 个项目")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "移除 同名项目 #4" })).toBeNull();
    expect(projectStatsApi.getDashboard).toHaveBeenCalledTimes(2);
  });
  it("成功空 compare 清旧图表；缺陷首次失败可独立恢复", async () => {
    vi.mocked(defectApi.getDefectStatistics).mockRejectedValueOnce(new Error("缺陷读取失败"));
    mount();
    await screen.findByText(/缺陷分布：读取失败/);
    expect(screen.getByRole("region", { name: "项目 KPI" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "重试缺陷分布" }));
    await ready();
    vi.mocked(projectStatsApi.compareDashboards).mockResolvedValueOnce([]);
    await refresh();
    await screen.findByText("暂无项目对比数据");
    expect(screen.queryByRole("article", { name: "对比项目 真实项目3" })).toBeNull();
  });
});

describe("候选和 SVG 边界", () => {
  it("键盘可操作候选复选框，空匹配页面有明确提示", async () => {
    mount();
    await ready();
    const user = userEvent.setup();
    const checkbox = screen.getByRole("checkbox", { name: "同名项目 #4" });
    checkbox.focus();
    await user.keyboard(" ");
    await screen.findByRole("article", { name: "对比项目 真实项目4" });
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    vi.mocked(projectStatsApi.findStatisticsProjectOptions).mockResolvedValueOnce({
      list: [],
      total: 0,
      pageNumber: 1,
      pageSize: 20,
    });
    fireEvent.change(screen.getByRole("textbox", { name: "搜索项目名称" }), {
      target: { value: "不存在" },
    });
    await screen.findByText("没有匹配项目");
    expect(screen.getByRole("button", { name: "移除 同名项目 #4" })).toBeTruthy();
  });
  it("第 51 项和非法 ID 使用 FieldError，不更改集合，修正后清错误", async () => {
    vi.mocked(projectStatsApi.findStatisticsProjectOptions).mockResolvedValue({
      list: [
        { id: 51, projectName: "第51项" },
        { id: 0, projectName: "非法项目" },
      ],
      total: 2,
      pageNumber: 1,
      pageSize: 20,
    });
    const onChange = vi.fn();
    const selected = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, name: `项目${i + 1}` }));
    render(
      <QueryClientProvider client={client}>
        <StatisticsProjectSelector selected={selected} onChange={onChange} />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("checkbox", { name: "第51项 #51" }));
    expect(screen.getByRole("alert").textContent).toContain("50");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: "非法项目 #0" }));
    expect(screen.getByRole("alert").textContent).toContain("ID 无效");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "清空对比" }));
    expect(onChange).toHaveBeenCalledWith([]);
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("单类 SVG 完整圆和单点可见，并带名称/文字", () => {
    render(
      <>
        <DefectDistributionPieSvg categories={[{ label: "主要", value: 4 }]} />
        <TaskCompletionTrendSvg points={[{ date: "2026-10-05", value: 0 }]} />
      </>,
    );
    expect(
      screen.getByRole("img", { name: "缺陷严重程度候选分布" }).querySelector("circle"),
    ).toBeTruthy();
    expect(screen.getByText("主要：4 个（100.0%）")).toBeTruthy();
    expect(
      screen.getByRole("img", { name: "任务完成趋势（任务数）" }).querySelector("circle"),
    ).toBeTruthy();
    expect(screen.getByText("2026-10-05：0 个任务")).toBeTruthy();
  });
});
