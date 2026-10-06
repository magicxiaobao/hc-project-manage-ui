// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  type AnyRoute,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Route as TaskIndex } from "@/routes/p/$projectKey/issues/index";
import { Route as DefectIndex } from "@/routes/p/$projectKey/defects/index";
import { Route as RequirementIndex } from "@/routes/p/$projectKey/requirements/index";
import { Route as TestCaseIndex } from "@/routes/p/$projectKey/testcases/index";
import { parseProjectViewSearch } from "@/lib/pm/navigation";
import { useAuthStore } from "@/lib/api/auth-store";
import { projectApi } from "@/lib/api/project";
import { taskApi } from "@/lib/api/task";
import { defectApi } from "@/lib/api/defect";
import { requirementApi } from "@/lib/api/requirement";
import { testCaseApi } from "@/lib/api/testCase";
import type { ProjectResponse } from "@/lib/api/types";
const clients: QueryClient[] = [];
const domains = [
  ["issues", TaskIndex, taskApi],
  ["defects", DefectIndex, defectApi],
  ["requirements", RequirementIndex, requirementApi],
  ["testcases", TestCaseIndex, testCaseApi],
] as const;
const keyword = '登录 内部空格 " & ? # + / % _ 😀';
beforeEach(() => {
  useAuthStore.setState({
    isAuthenticated: true,
    user: {
      userId: "42",
      userName: "用户",
      cnName: null,
      roles: [],
      authorities: [],
      extraInfo: {},
    },
  });
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
  domains.forEach(([, , api]) =>
    vi
      .spyOn(api, "findByPage")
      .mockResolvedValue({ list: [], total: 41, pageNumber: 1, pageSize: 20 }),
  );
  vi.spyOn(defectApi, "getStatusOptions").mockResolvedValue([]);
  vi.spyOn(requirementApi, "getRequirementTypes").mockResolvedValue([]);
  vi.spyOn(requirementApi, "getRequirementPriorities").mockResolvedValue([]);
  vi.spyOn(requirementApi, "getRequirementStatuses").mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useAuthStore.setState({ isAuthenticated: false, user: null });
});
const listRoutes = {
  issues: "/p/$projectKey/issues",
  defects: "/p/$projectKey/defects",
  requirements: "/p/$projectKey/requirements",
  testcases: "/p/$projectKey/testcases",
} as const;
async function mount(
  path: keyof typeof listRoutes,
  route: typeof TaskIndex | typeof DefectIndex | typeof RequirementIndex | typeof TestCaseIndex,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
  clients.push(client);
  const root = createRootRoute({ component: Outlet });
  const project = createRoute({
    getParentRoute: () => root,
    path: "/p/$projectKey",
    validateSearch: parseProjectViewSearch,
    component: Outlet,
  });
  const parent = createRoute({ getParentRoute: () => project, path, component: Outlet });
  // 安装真实 index 路由组件，其 Route.useSearch/params 与 live 列表保持真实。
  const fixture = {
    id: "/",
    path: "/",
    getParentRoute: () => parent,
    component: route.options.component,
  };
  const index = (route as AnyRoute).update(fixture);
  const history = createMemoryHistory({ initialEntries: [`/p/HC/${path}`] });
  const router = createRouter({
    routeTree: root.addChildren([project.addChildren([parent.addChildren([index])])]),
    history,
  });
  await router.navigate({
    to: listRoutes[path],
    params: { projectKey: "HC" },
    search: { keyword },
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, history };
}
for (const [path, route, api] of domains) {
  it(`${path} 真实 index 首请求带 title/projectId，输入回显/分页/URL变化/清空闭环`, async () => {
    const s = await mount(path, route);
    await waitFor(() => expect(api.findByPage).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.findByPage).mock.calls[0][0]).toEqual({
      page: 1,
      pageSize: 20,
      bean: { projectId: 7, title: keyword },
    });
    const input = screen.getByRole("textbox", { name: "按标题搜索" }) as HTMLInputElement;
    expect(input.value).toBe(keyword);
    fireEvent.click(await screen.findByRole("button", { name: "下一页" }));
    await waitFor(() =>
      expect(api.findByPage).toHaveBeenCalledWith({
        page: 2,
        pageSize: 20,
        bean: { projectId: 7, title: keyword },
      }),
    );
    expect(s.router.state.location.search.keyword).toBe(keyword);
    await act(async () => {
      await s.router.navigate({
        to: listRoutes[path],
        params: { projectKey: "HC" },
        search: { keyword: "注册" },
      });
    });
    await waitFor(() =>
      expect(api.findByPage).toHaveBeenCalledWith({
        page: 1,
        pageSize: 20,
        bean: { projectId: 7, title: "注册" },
      }),
    );
    expect(input.value).toBe("注册");
    expect(
      vi
        .mocked(api.findByPage)
        .mock.calls.some(([params]) => params.page === 2 && params.bean.title === "注册"),
    ).toBe(false);
    fireEvent.change(input, { target: { value: "  编辑 标题  " } });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    await waitFor(() => expect(s.router.state.location.search.keyword).toBe("编辑 标题"));
    await waitFor(() =>
      expect(api.findByPage).toHaveBeenCalledWith({
        page: 1,
        pageSize: 20,
        bean: { projectId: 7, title: "编辑 标题" },
      }),
    );
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    await waitFor(() => expect(s.router.state.location.search.keyword).toBeUndefined());
    await waitFor(() =>
      expect(api.findByPage).toHaveBeenCalledWith({
        page: 1,
        pageSize: 20,
        bean: { projectId: 7 },
      }),
    );
    expect(
      new URL(s.router.state.location.href, "https://test.invalid").searchParams.has("keyword"),
    ).toBe(false);
    act(() => s.history.back());
    await waitFor(() => expect(input.value).toBe("编辑 标题"));
    const count = vi.mocked(api.findByPage).mock.calls.length;
    fireEvent.change(input, { target: { value: "字".repeat(201) } });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    expect(screen.getByRole("alert").textContent).toContain("200");
    expect(vi.mocked(api.findByPage).mock.calls.length).toBe(count);
    fireEvent.change(input, { target: { value: "短" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });
}
