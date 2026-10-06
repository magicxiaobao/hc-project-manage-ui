// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkbenchPage } from "../../workbench-page";
import { ProjectSidebar } from "@/components/biz/project-sidebar";
import { useAuthStore } from "@/lib/api/auth-store";
import { projectApi } from "@/lib/api/project";
import { taskApi } from "@/lib/api/task";
import { workLogApi } from "@/lib/api/worklog";
import { notificationApi } from "@/lib/api/notification";
import { useNotificationUnreadCount } from "@/lib/query/hooks/useNotifications";
import type { ProjectResponse } from "@/lib/api/types";
import type { TaskResponse } from "@/lib/api/task-types";
import { Route as WorkbenchRoute } from "@/routes/workbench";
// 路由守卫使用真实组件；Shell 仅保留共享通知 observer，避免演示状态干扰卡片断言。
vi.mock("@/components/pm/shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => {
    useNotificationUnreadCount(true);
    return <>{children}</>;
  },
}));
const user = {
  userId: "42",
  userName: "当前用户",
  cnName: null,
  roles: [],
  authorities: [],
  extraInfo: {},
};
const empty = { list: [], total: 0, pageNumber: 1, pageSize: 10 };
const clients: QueryClient[] = [];
const project = { id: 7, projectKey: "REAL", projectName: "真实项目" } as ProjectResponse;
const card = (name: string) => screen.getByRole("region", { name });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: true, user });
  vi.spyOn(useAuthStore.getState(), "hydrate").mockImplementation(() => {});
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  }));
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.getAnimations = vi.fn(() => []);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.spyOn(projectApi, "findByPage").mockResolvedValue({
    list: [project],
    total: 1,
    pageNumber: 1,
    pageSize: 100,
  });
  vi.spyOn(taskApi, "findByPage").mockImplementation(async (p) => ({
    ...empty,
    total: 20,
    list: [
      {
        id: p.bean.status === "TODO" ? 1 : p.bean.status === "IN_PROGRESS" ? 2 : 3,
        title: `任务 ${p.bean.status}`,
        ...p.bean,
      } as TaskResponse,
    ],
  }));
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
async function mount({ guard = false, nav = false, entry = "/workbench" } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
  clients.push(client);
  const root = createRootRoute({
    component: () => (
      <>
        {nav ? (
          <ProjectSidebar
            open={false}
            pathname={entry}
            projects={[]}
            itemOrigin={null}
            onClose={() => {}}
          />
        ) : null}
        <Outlet />
      </>
    ),
  });
  const workbench = createRoute({
    getParentRoute: () => root,
    path: "/workbench",
    component: guard ? WorkbenchRoute.options.component : WorkbenchPage,
  });
  const targets = [
    "/",
    "/worklogs",
    "/worklogs/analytics",
    "/notifications",
    "/projects",
    "/login",
    "/p/$projectKey/issues",
    "/p/$projectKey/issues/new",
    "/p/$projectKey/issues/$taskId",
  ].map((path) =>
    createRoute({ getParentRoute: () => root, path, component: () => <p>目标页</p> }),
  );
  const router = createRouter({
    routeTree: root.addChildren([workbench, ...targets]),
    history: createMemoryHistory({ initialEntries: [entry] }),
  });
  await router.load();
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { client, router };
}
it("三卡同时展示，准确服务端 total 与分页预览、真实任务链接", async () => {
  await mount();
  await screen.findByText("总待办数：60");
  expect(within(card("我的待办")).getByText("已展示 3 / 共 60 条")).toBeTruthy();
  expect(screen.getAllByText("已展示 1 / 共 20 条")).toHaveLength(3);
  expect(screen.getByRole("link", { name: "任务 PAUSED" }).getAttribute("href")).toBe(
    "/p/REAL/issues/3",
  );
  expect(screen.getAllByRole("link", { name: "查看项目任务" })[0].getAttribute("href")).toBe(
    "/p/REAL/issues",
  );
  expect(within(card("未读通知")).getByText("3")).toBeTruthy();
  expect(screen.getAllByText("数据暂未提供，待联调确认")).toHaveLength(2);
  expect(screen.getByText(/范围：全部可见项目/)).toBeTruthy();
});
it("单组首次失败保留其余预览，总数未知，独立重试只请求失败组", async () => {
  vi.mocked(taskApi.findByPage).mockImplementation(async (p) => {
    if (p.bean.status === "PAUSED") throw new Error("暂停组拒绝");
    return {
      ...empty,
      total: 20,
      list: [{ id: 1, title: `成功 ${p.bean.status}`, ...p.bean } as TaskResponse],
    };
  });
  await mount();
  await screen.findByText(/暂停组拒绝/);
  expect(screen.getByText("总待办数：—")).toBeTruthy();
  expect(screen.getByRole("link", { name: "成功 TODO" })).toBeTruthy();
  expect(card("我的工时")).toBeTruthy();
  expect(within(card("未读通知")).getByText("3")).toBeTruthy();
  expect(screen.getByRole("link", { name: "登记工时" })).toBeTruthy();
  const hoursCount = vi.mocked(workLogApi.getUserStatistics).mock.calls.length;
  vi.mocked(taskApi.findByPage).mockResolvedValue({ ...empty, total: 20 });
  fireEvent.click(screen.getByRole("button", { name: "重试真实项目 · 已暂停" }));
  await screen.findByText("总待办数：60");
  expect(taskApi.findByPage).toHaveBeenCalledTimes(4);
  expect(workLogApi.getUserStatistics).toHaveBeenCalledTimes(hoursCount);
  expect(notificationApi.getUnreadCount).toHaveBeenCalledTimes(1);
});
it("任务 stale 刷新失败显示上次完整结果和更新时间", async () => {
  const s = await mount();
  await screen.findByText("总待办数：60");
  vi.mocked(taskApi.findByPage).mockRejectedValue(new Error("网络断开"));
  await act(async () => {
    await s.client.invalidateQueries({ queryKey: ["hc", "task"] });
  });
  await screen.findByText("上次完整结果：60");
  expect(screen.getAllByRole("alert")).toHaveLength(3);
  expect(screen.getAllByText(/更新时间：/)).toHaveLength(3);
  expect(screen.getByRole("link", { name: "任务 TODO" })).toBeTruthy();
});
it("HTTP 工时失败和未知字段占位区别明确，另一工时区块仍可看", async () => {
  // 此测试按当前日期决定今日/本周，只有非周一才是两条查询。
  const today = new Date();
  const isMonday = today.getDay() === 1;
  vi.mocked(workLogApi.getUserStatistics).mockImplementation(async (_id, p) => {
    if (p.startDate === p.endDate) throw new Error("今日统计无权限");
    return null;
  });
  await mount();
  await screen.findByText(/今日工时加载失败：/);
  expect(within(card("今日工时")).getByRole("alert")).toBeTruthy();
  if (!isMonday) expect(within(card("本周工时")).queryByRole("alert")).toBeNull();
  expect(screen.getByRole("link", { name: "统计分析" }).getAttribute("href")).toBe(
    "/worklogs/analytics",
  );
  expect(screen.getByRole("link", { name: "登记工时" })).toBeTruthy();
});
it("完整候选小时包含明确 0，部分缺字段保持 —，可确认行不作为总量", async () => {
  vi.mocked(workLogApi.getUserStatistics).mockImplementation(async (id, p) =>
    p.startDate === p.endDate
      ? [{ userId: id, statisticDate: p.endDate, totalHours: 0 }]
      : [
          { userId: id, statisticDate: p.endDate, totalHours: 2 },
          { userId: id, statisticDate: p.startDate },
        ],
  );
  await mount();
  await screen.findAllByText("0 小时（候选）");
  expect(within(card("今日工时")).getByText("字段口径待联调确认")).toBeTruthy();
  if (new Date().getDay() !== 1) {
    expect(within(card("本周工时")).getByText("—")).toBeTruthy();
    expect(within(card("本周工时")).getByText(/可确认行，不代表总量/)).toBeTruthy();
  }
});
it("工时 stale 刷新失败保留候选旧值与时间，刷新中也标注旧结果", async () => {
  vi.mocked(workLogApi.getUserStatistics).mockImplementation(async (id, p) => [
    { userId: id, statisticDate: p.endDate, totalHours: 4 },
  ]);
  const s = await mount();
  await screen.findAllByText("4 小时（候选）");
  const pending = deferred<unknown>();
  vi.mocked(workLogApi.getUserStatistics).mockReturnValue(pending.promise);
  let refresh!: Promise<void>;
  act(() => {
    refresh = s.client.invalidateQueries({ queryKey: ["hc", "workLog", "userStatistics"] });
  });
  await screen.findByText("今日工时正在刷新，显示上次结果…");
  // 当前刷新完成后再制造独立 HTTP 失败。
  await act(async () => {
    pending.resolve([
      {
        userId: 42,
        statisticDate:
          new Date().getFullYear() +
          "-" +
          String(new Date().getMonth() + 1).padStart(2, "0") +
          "-" +
          String(new Date().getDate()).padStart(2, "0"),
        totalHours: 4,
      },
    ]);
    await refresh;
  });
  vi.mocked(workLogApi.getUserStatistics).mockRejectedValue(new Error("刷新权限拒绝"));
  await act(async () => {
    await s.client.invalidateQueries({ queryKey: ["hc", "workLog", "userStatistics"] });
  });
  await screen.findByText(/今日工时旧数据，刷新失败：/);
  expect(within(card("今日工时")).getByText("4 小时（候选）")).toBeTruthy();
  expect(within(card("今日工时")).getByText(/更新时间：/)).toBeTruthy();
});
it("未读首次失败绝不显示 0；重试成功 0 才显示空状态", async () => {
  vi.mocked(notificationApi.getUnreadCount).mockRejectedValue(new Error("计数不可用"));
  await mount();
  await screen.findByText(/未读通知加载失败：/);
  expect(within(card("未读通知")).queryByText("暂无未读通知")).toBeNull();
  expect(within(card("未读通知")).getByText("—")).toBeTruthy();
  vi.mocked(notificationApi.getUnreadCount).mockResolvedValue(0);
  fireEvent.click(screen.getByRole("button", { name: "重试未读通知" }));
  await screen.findByText("暂无未读通知");
  expect(within(card("未读通知")).getByText("0")).toBeTruthy();
});
it("通知刷新失败保留旧 count，三卡和快捷入口不消失", async () => {
  const s = await mount();
  await waitFor(() => expect(within(card("未读通知")).getByText("3")).toBeTruthy());
  vi.mocked(notificationApi.getUnreadCount).mockRejectedValue(new Error("网络失败"));
  await act(async () => {
    await s.client.invalidateQueries({ queryKey: ["hc", "notification"] });
  });
  await screen.findByText(/未读通知旧数据，刷新失败：/);
  expect(within(card("未读通知")).getByText("3")).toBeTruthy();
  expect(within(card("未读通知")).getByText(/更新时间：/)).toBeTruthy();
  expect(card("我的待办")).toBeTruthy();
  expect(card("我的工时")).toBeTruthy();
  expect(card("快捷入口")).toBeTruthy();
});
it("项目范围首次失败局部提示，登记工时和通知入口仍可达", async () => {
  vi.mocked(projectApi.findByPage).mockRejectedValue(new Error("项目无权限"));
  await mount();
  await screen.findByText(/待办项目范围加载失败：/);
  await screen.findByText(/工时项目范围加载失败：/);
  expect(screen.getAllByRole("alert")).toHaveLength(2);
  expect(screen.getByRole("button", { name: "新建任务" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("link", { name: "登记工时" }).getAttribute("href")).toBe("/worklogs");
  expect(screen.getByRole("link", { name: "我的通知" }).getAttribute("href")).toBe(
    "/notifications",
  );
});
it("空范围提示不伪造 0，通知正常", async () => {
  vi.mocked(projectApi.findByPage).mockResolvedValue({
    list: [],
    total: 0,
    pageNumber: 1,
    pageSize: 100,
  });
  await mount();
  await screen.findByText("当前无可见项目");
  expect(screen.getByText("暂无可统计项目")).toBeTruthy();
  expect(workLogApi.getUserStatistics).not.toHaveBeenCalled();
  expect(within(card("未读通知")).getByText("3")).toBeTruthy();
});
it("各卡独立 loading，项目加载不会阻塞通知", async () => {
  const scope = deferred<Awaited<ReturnType<typeof projectApi.findByPage>>>();
  vi.mocked(projectApi.findByPage).mockReturnValue(scope.promise);
  await mount();
  await screen.findByText("待办项目范围正在加载…");
  expect(screen.getByText("工时项目范围正在加载…")).toBeTruthy();
  await waitFor(() => expect(within(card("未读通知")).getByText("3")).toBeTruthy());
  expect(screen.getByRole("link", { name: "登记工时" })).toBeTruthy();
});
it.each(["/worklogs", "/notifications", "/p/REAL/issues/new"])(
  "快捷入口到达真实路径 %s，未选项目禁用",
  async (path) => {
    const { router } = await mount();
    await screen.findByText("总待办数：60");
    const button = screen.getByRole("button", { name: "新建任务" });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(screen.getAllByText("请选择项目").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("新建任务项目"), { target: { value: "7" } });
    expect(screen.getByRole("link", { name: "新建任务" }).getAttribute("href")).toBe(
      "/p/REAL/issues/new",
    );
    fireEvent.click(
      screen.getByRole("link", {
        name:
          path === "/worklogs" ? "登记工时" : path === "/notifications" ? "我的通知" : "新建任务",
      }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe(path));
  },
);
it("实际路由 hydrate 守卫未登录不挂载业务查询；合法认证挂载且计数与 Shell 合并", async () => {
  useAuthStore.setState({ isAuthenticated: false, user: null });
  await mount({ guard: true });
  await screen.findByText("请登录后查看个人工作台。");
  expect(screen.getByRole("link", { name: "登录" }).getAttribute("href")).toBe("/login");
  expect(projectApi.findByPage).not.toHaveBeenCalled();
  expect(notificationApi.getUnreadCount).not.toHaveBeenCalled();
  act(() => useAuthStore.setState({ isAuthenticated: true, user }));
  await screen.findByText("总待办数：60");
  expect(notificationApi.getUnreadCount).toHaveBeenCalledTimes(1);
});
it.each(["01", "0", "9007199254740992"])("无效登录身份 %s 不挂载业务 hooks", async (id) => {
  useAuthStore.setState({ user: { ...user, userId: id } });
  await mount();
  await screen.findByRole("alert");
  expect(screen.getByText("登录身份无效，请重新登录。")).toBeTruthy();
  expect(projectApi.findByPage).not.toHaveBeenCalled();
  expect(taskApi.findByPage).not.toHaveBeenCalled();
  expect(workLogApi.getUserStatistics).not.toHaveBeenCalled();
  expect(notificationApi.getUnreadCount).not.toHaveBeenCalled();
});
it("真实全局导航可从 projects 进入工作台，演示首页仍是 /", async () => {
  const { router } = await mount({ nav: true, entry: "/projects" });
  expect(screen.getByRole("link", { name: "演示首页" }).getAttribute("href")).toBe("/");
  fireEvent.click(screen.getByRole("link", { name: "工作台" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/workbench"));
  await screen.findByText("个人工作台");
});
it("生成路由直接挂在 root，注册 fullPath/to/id；登录跳转仍是 projects", () => {
  const tree = readFileSync("src/routeTree.gen.ts", "utf8");
  expect(tree).toMatch(
    /const WorkbenchRoute = WorkbenchRouteImport.update\(\{\s*id: '\/workbench',\s*path: '\/workbench',\s*getParentRoute: \(\) => rootRouteImport/,
  );
  expect(tree.match(/'\/workbench': typeof WorkbenchRoute/g)).toHaveLength(3);
  expect(tree).toContain("WorkbenchRoute: WorkbenchRoute,");
  const login = readFileSync("src/routes/login.tsx", "utf8");
  expect(login.match(/to: ["']\/projects["']/g)).toHaveLength(2);
});
