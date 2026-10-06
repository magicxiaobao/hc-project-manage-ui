// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useSearch,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppShell } from "../shell";
import { notificationApi } from "@/lib/api/notification";
import { GlobalSearchPage } from "../global-search-page";
import { GlobalSearchField } from "../global-search-field";
import { GlobalSearchDraftProvider } from "../global-search-draft";
import { parseGlobalSearch } from "@/lib/search/keyword";
import { useAuthStore } from "@/lib/api/auth-store";
import { projectApi } from "@/lib/api/project";
import { taskApi } from "@/lib/api/task";
import { defectApi } from "@/lib/api/defect";
import { requirementApi } from "@/lib/api/requirement";
import { testCaseApi } from "@/lib/api/testCase";
import type { TaskResponse } from "@/lib/api/task-types";
import type { DefectResponse } from "@/lib/api/defect-types";
import type { RequirementResponse } from "@/lib/api/requirement-types";
import type { TestCaseResponse } from "@/lib/api/testCase-types";
import type { ProjectResponse } from "@/lib/api/types";
import { ApiBusinessError } from "@/lib/api/client";
const clients: QueryClient[] = [];
const apis = [taskApi, defectApi, requirementApi, testCaseApi] as const;
const user = {
  userId: "42",
  userName: "用户",
  cnName: null,
  roles: [],
  authorities: [],
  extraInfo: {},
};
const empty = { list: [], total: 0, pageNumber: 1, pageSize: 10 };
function results() {
  vi.mocked(taskApi.findByPage).mockImplementation(async (params) => ({
    ...empty,
    total: 20,
    list: [
      {
        id: 1,
        title: `任务${params.bean.projectId}`,
        projectId: params.bean.projectId,
        status: "TODO",
        statusLabel: "待开始",
      } as TaskResponse,
    ],
  }));
  vi.mocked(defectApi.findByPage).mockResolvedValue({
    ...empty,
    total: 1,
    list: [
      {
        id: 2,
        title: "缺陷命中",
        projectId: 7,
        status: "NEW",
        statusLabel: "新建",
        severity: "CRITICAL",
      } as DefectResponse,
    ],
  });
  vi.mocked(requirementApi.findByPage).mockResolvedValue({
    ...empty,
    total: 1,
    list: [
      {
        id: 3,
        title: "需求命中",
        projectId: 7,
        status: "DRAFT",
        statusLabel: "草稿",
      } as RequirementResponse,
    ],
  });
  vi.mocked(testCaseApi.findByPage).mockResolvedValue({
    ...empty,
    total: 1,
    list: [
      {
        id: 4,
        title: "用例命中",
        projectId: 7,
        status: "ACTIVE",
        caseNumber: "TC-004",
      } as TestCaseResponse,
    ],
  });
}
beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: true, user });
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
    list: [{ id: 7, projectKey: "HC", projectName: "恒川项目" } as ProjectResponse],
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
  vi.unstubAllGlobals();
  vi.useRealTimers();
  useAuthStore.setState({ isAuthenticated: false, user: null });
});
async function mount(entry = "/search?keyword=登录", entries?: string[], shell = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
  clients.push(client);
  const root = createRootRoute({
    component: () =>
      shell ? (
        <AppShell>
          <Outlet />
        </AppShell>
      ) : (
        <GlobalSearchDraftProvider>
          <GlobalSearchField />
          <Outlet />
        </GlobalSearchDraftProvider>
      ),
  });
  const search = createRoute({
    getParentRoute: () => root,
    path: "/search",
    validateSearch: parseGlobalSearch,
    component: function SearchResults() {
      return <GlobalSearchPage search={useSearch({ strict: false })} />;
    },
  });
  const away = createRoute({
    getParentRoute: () => root,
    path: "/away",
    component: () => <p>业务页</p>,
  });
  const paths = [
    "/p/$projectKey/issues",
    "/p/$projectKey/defects",
    "/p/$projectKey/requirements",
    "/p/$projectKey/testcases",
    "/p/$projectKey/issues/$taskId",
    "/p/$projectKey/defects/$defectId",
    "/p/$projectKey/requirements/$requirementId",
    "/p/$projectKey/testcases/$testCaseId",
    "/login",
  ];
  const targets = paths.map((path) =>
    createRoute({ getParentRoute: () => root, path, component: () => <p>目标页</p> }),
  );
  const history = createMemoryHistory({
    initialEntries: entries ?? [entry],
    initialIndex: entries ? entries.length - 1 : 0,
  });
  const router = createRouter({ routeTree: root.addChildren([search, away, ...targets]), history });
  await router.load();
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, history, client };
}
it("深链立即请求四域，Tab 顺序/计数/类型字段/详情与查看全部是干净 Router Link", async () => {
  results();
  const s = await mount("/search?keyword=登录&projectKey=HC");
  await screen.findByText("任务7");
  expect(screen.getAllByRole("tab").map((tab) => tab.textContent?.split(" · ")[0])).toEqual([
    "任务",
    "缺陷",
    "需求",
    "测试用例",
  ]);
  apis.forEach((api) => expect(api.findByPage).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("link", { name: "任务7" }).getAttribute("href")).toBe("/p/HC/issues/1");
  expect(screen.getByText(/共 20 条/)).toBeTruthy();
  const domains = [
    ["任务", "issues"],
    ["缺陷", "defects"],
    ["需求", "requirements"],
    ["测试用例", "testcases"],
  ] as const;
  for (const [label, path] of domains) {
    fireEvent.click(screen.getByRole("tab", { name: new RegExp(`^${label} ·`) }));
    await waitFor(() =>
      expect(
        screen.getByRole("tab", { name: new RegExp(`^${label} ·`) }).getAttribute("aria-selected"),
      ).toBe("true"),
    );
    const link = screen.getByRole("link", { name: "查看全部" });
    const url = new URL(link.getAttribute("href")!, "https://test.invalid");
    expect(url.pathname).toBe(`/p/HC/${path}`);
    expect(JSON.parse(JSON.stringify(Object.fromEntries(url.searchParams)))).toEqual({
      keyword: "登录",
    });
  }
  expect(screen.getByText("TC-004")).toBeTruthy();
  expect(screen.getByText("恒川项目", { selector: "li span" })).toBeTruthy();
  expect(s.history.length).toBe(1);
  apis.forEach((api) => expect(api.findByPage).toHaveBeenCalledTimes(1));
});
it("全局每个有命中项目均有列表入口，包括未进入 top 10 的项目", async () => {
  vi.mocked(projectApi.findByPage).mockResolvedValue({
    list: [
      { id: 7, projectKey: "HC", projectName: "恒川项目" },
      { id: 8, projectKey: "ZZ", projectName: "尾部项目" },
    ] as ProjectResponse[],
    total: 2,
    pageNumber: 1,
    pageSize: 100,
  });
  vi.mocked(taskApi.findByPage).mockImplementation(async (params) => ({
    ...empty,
    total: 50,
    list: Array.from(
      { length: 10 },
      (_, i) =>
        ({
          id: i + 1,
          title: `${params.bean.projectId}-${i}`,
          projectId: params.bean.projectId,
          status: "TODO",
          statusLabel: "待开始",
        }) as TaskResponse,
    ),
  }));
  await mount();
  await screen.findByText("7-0");
  expect(screen.getAllByRole("listitem")).toHaveLength(10);
  expect(screen.queryByText("8-0")).toBeNull();
  expect(screen.getByText(/共 100 条/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "查看全部（尾部项目）" }).getAttribute("href")).toContain(
    "/p/ZZ/issues",
  );
});
it("失败显示错误和项目级重试，刷新失败明确保留上次数据，其他域可用", async () => {
  results();
  const s = await mount();
  await screen.findByText("任务7");
  vi.mocked(taskApi.findByPage).mockRejectedValue(
    new ApiBusinessError({ code: 403, msg: "无权限", result: null }, 403),
  );
  await act(async () => {
    await s.client.invalidateQueries({ queryKey: ["hc", "task"] });
  });
  await screen.findByText(/上次成功结果，刷新失败/);
  expect(screen.getByRole("link", { name: "任务7" })).toBeTruthy();
  expect(screen.queryByText("未找到相关任务。")).toBeNull();
  expect(screen.queryByRole("link", { name: "查看全部（恒川项目）" })).toBeNull();
  vi.mocked(taskApi.findByPage).mockResolvedValue(empty);
  fireEvent.click(screen.getByRole("button", { name: "重试（恒川项目）" }));
  await screen.findByText("未找到相关任务。");
  fireEvent.click(screen.getByRole("tab", { name: /^缺陷/ }));
  await screen.findByText("缺陷命中");
});
it.each([
  "/search",
  "/search?keyword=登录&projectKey=NO",
  `/search?keyword=${"字".repeat(201)}`,
  "/search?keyword=中%00文",
])("空/非法深链 %s 不请求四域，错误就地展示", async (entry) => {
  await mount(entry);
  await screen.findByRole("heading", { name: "全局搜索" });
  await waitFor(() => expect(projectApi.findByPage).toHaveBeenCalledTimes(1));
  apis.forEach((api) => expect(api.findByPage).not.toHaveBeenCalled());
  if (entry === "/search") expect(screen.getByText("输入关键词搜索")).toBeTruthy();
  else expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
});
it("未登录显示登录提示，无项目/四域请求，输入禁用", async () => {
  useAuthStore.setState({ isAuthenticated: false, user: null });
  await mount();
  expect(screen.getByRole("link", { name: "登录" })).toBeTruthy();
  expect(screen.getByRole("searchbox").hasAttribute("disabled")).toBe(true);
  expect(projectApi.findByPage).not.toHaveBeenCalled();
  apis.forEach((api) => expect(api.findByPage).not.toHaveBeenCalled());
});
const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
it("连续输入 299ms 不提交、300ms 提交，首次 push、后续 replace，规范化相同不导航", async () => {
  const s = await mount("/away");
  vi.useFakeTimers();
  const input = screen.getByRole("searchbox");
  fireEvent.change(input, { target: { value: "登" } });
  await advance(200);
  fireEvent.change(input, { target: { value: "登录" } });
  await advance(299);
  expect(s.router.state.location.pathname).toBe("/away");
  expect(taskApi.findByPage).not.toHaveBeenCalled();
  await advance(1);
  await advance(20);
  expect(s.router.state.location.pathname).toBe("/search");
  expect(s.history.length).toBe(2);
  fireEvent.change(input, { target: { value: "注册" } });
  await advance(320);
  expect(s.router.state.location.search.keyword).toBe("注册");
  expect(s.history.length).toBe(2);
  const navigate = vi.spyOn(s.router, "navigate");
  fireEvent.change(input, { target: { value: " 注册 " } });
  await advance(320);
  expect(navigate).not.toHaveBeenCalled();
});
it("Enter 立即且仅提交一次，composition 期间零提交，清空即时移除 keyword", async () => {
  const s = await mount("/away");
  vi.useFakeTimers();
  const input = screen.getByRole("searchbox");
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: "登录" } });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  await advance(1000);
  expect(s.router.state.location.pathname).toBe("/away");
  fireEvent.compositionEnd(input, { data: "登录" });
  await advance(299);
  expect(s.router.state.location.pathname).toBe("/away");
  fireEvent.keyDown(input, { key: "Enter" });
  await advance(20);
  expect(s.router.state.location.search.keyword).toBe("登录");
  await advance(400);
  expect(taskApi.findByPage).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "清空全局搜索" }));
  await advance(20);
  expect(s.router.state.location.search.keyword).toBeUndefined();
  expect(screen.getByText("输入关键词搜索")).toBeTruthy();
});
it("等待 debounce 时旧行和查看全部不可交互；非法输入显示 FieldError，编辑清除", async () => {
  results();
  await mount();
  await screen.findByText("任务7");
  vi.useFakeTimers();
  const input = screen.getByRole("searchbox");
  fireEvent.change(input, { target: { value: "注册" } });
  expect(screen.queryByRole("link", { name: "任务7" })).toBeNull();
  expect(screen.queryByRole("link", { name: "查看全部（恒川项目）" })).toBeNull();
  expect(screen.getAllByText("等待搜索").length).toBeGreaterThan(0);
  fireEvent.change(input, { target: { value: "字".repeat(201) } });
  expect(screen.getByRole("alert").textContent).toContain("200");
  expect((screen.getByRole("button", { name: "提交全局搜索" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  await advance(500);
  expect(taskApi.findByPage).toHaveBeenCalledTimes(1);
  fireEvent.change(input, { target: { value: "短词" } });
  expect(screen.queryByRole("alert")).toBeNull();
});
it("历史跳转/账号变化/卸载清 timer，URL 恢复 draft；非搜索页清空不导航、空 Enter 可进搜索", async () => {
  const s = await mount("/search?keyword=登录", ["/away", "/search?keyword=登录"]);
  await screen.findByText("未找到相关任务。");
  vi.useFakeTimers();
  const input = screen.getByRole("searchbox") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "旧计时" } });
  act(() => s.history.back());
  await advance(400);
  expect(s.router.state.location.pathname).toBe("/away");
  expect(input.value).toBe("");
  fireEvent.change(input, { target: { value: "换账号计时" } });
  act(() => useAuthStore.setState({ user: { ...user, userId: "7" } }));
  await advance(400);
  expect(s.router.state.location.pathname).toBe("/away");
  expect(input.value).toBe("");
  fireEvent.change(input, { target: { value: "x" } });
  fireEvent.change(input, { target: { value: "" } });
  await advance(400);
  expect(s.router.state.location.pathname).toBe("/away");
  fireEvent.keyDown(input, { key: "Enter" });
  await advance(20);
  expect(s.router.state.location.pathname).toBe("/search");
  expect(s.router.state.location.search.keyword).toBeUndefined();
  fireEvent.change(input, { target: { value: "卸载计时" } });
  cleanup();
  await advance(400);
  expect(s.router.state.location.search.keyword).toBeUndefined();
});

it("真实 Shell 在全断点提供顶栏，登录 rail 进入 /search 并聚焦真实输入", async () => {
  vi.spyOn(notificationApi, "getUnreadCount").mockResolvedValue(0);
  const s = await mount("/away", undefined, true);
  await screen.findByRole("searchbox", { name: "全局搜索" });
  const menu = screen.getByRole("button", { name: "打开导航" });
  expect(menu.className).toContain("lg:hidden");
  expect(menu.parentElement?.className).not.toContain("lg:hidden");
  fireEvent.click(screen.getByRole("button", { name: "搜索事项" }));
  await waitFor(() => expect(s.router.state.location.pathname).toBe("/search"));
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: "全局搜索" })),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  apis.forEach((api) => expect(api.findByPage).not.toHaveBeenCalled());
});

it("项目范围切换 push，后退/前进恢复范围，缓存复用且没有无 projectId 查询", async () => {
  vi.mocked(projectApi.findByPage).mockResolvedValue({
    list: [
      { id: 7, projectKey: "HC", projectName: "恒川项目" },
      { id: 8, projectKey: "ZZ", projectName: "尾部项目" },
    ] as ProjectResponse[],
    total: 2,
    pageNumber: 1,
    pageSize: 100,
  });
  const s = await mount();
  await waitFor(() => expect(taskApi.findByPage).toHaveBeenCalledTimes(2));
  fireEvent.change(screen.getByRole("combobox", { name: "搜索范围" }), { target: { value: "HC" } });
  await waitFor(() => expect(s.router.state.location.search.projectKey).toBe("HC"));
  expect(s.history.length).toBe(2);
  expect(screen.getByText("当前范围：恒川项目")).toBeTruthy();
  act(() => s.history.back());
  await waitFor(() => expect(s.router.state.location.search.projectKey).toBeUndefined());
  act(() => s.history.forward());
  await waitFor(() => expect(s.router.state.location.search.projectKey).toBe("HC"));
  apis.forEach((api) => expect(api.findByPage).toHaveBeenCalledTimes(2));
});
it("四域全部失败显示页级失败，绝不显示为零命中", async () => {
  apis.forEach((api) =>
    vi
      .mocked(api.findByPage)
      .mockRejectedValue(new ApiBusinessError({ code: 403, msg: "无权限", result: null }, 403)),
  );
  await mount();
  await screen.findByText("四个域均查询失败，请分别重试。");
  expect(screen.queryByText("未找到相关结果。")).toBeNull();
  expect(screen.queryByText("未找到相关任务。")).toBeNull();
  apis.forEach((api) => expect(api.findByPage).toHaveBeenCalledTimes(1));
});
it.each(["empty", "error"])("范围 %s 状态不请求四域，展示无项目或加载失败", async (state) => {
  if (state === "empty")
    vi.mocked(projectApi.findByPage).mockResolvedValue({
      list: [],
      total: 0,
      pageNumber: 1,
      pageSize: 100,
    });
  else
    vi.mocked(projectApi.findByPage).mockRejectedValue(
      new ApiBusinessError({ code: 403, msg: "无权限", result: null }, 403),
    );
  await mount();
  await screen.findByText(state === "empty" ? "无可搜索项目。" : /范围加载失败/);
  apis.forEach((api) => expect(api.findByPage).not.toHaveBeenCalled());
});
