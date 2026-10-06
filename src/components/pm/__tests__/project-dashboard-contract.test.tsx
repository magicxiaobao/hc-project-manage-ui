// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectDashboardPage } from "../project-dashboard-page";
import { useAuthStore } from "@/lib/api/auth-store";
import {
  dashboardFixture,
  defectFixture,
  progressFixture,
  statisticsFixture,
} from "@/lib/__tests__/project-dashboard-fixtures";

// 使用真实六端点 API/统一 client，只替换网络和客户端配置。
vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return {
    ...actual,
    api: actual.createApiClient({ baseUrl: "http://test", getToken: () => "contract-token" }),
  };
});
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
let requests: { url: URL; init?: RequestInit }[];
let resolveA: ((response: Response) => void) | undefined;
let delayA = false;
const reply = (result: unknown) =>
  new Response(JSON.stringify({ code: 1, msg: "ok", result }), {
    headers: { "Content-Type": "application/json" },
  });
beforeEach(() => {
  requests = [];
  resolveA = undefined;
  delayA = false;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useAuthStore.setState({ isAuthenticated: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      requests.push({ url, init });
      if (url.pathname === "/project/v1/dashboard/compare") {
        if (delayA) {
          delayA = false;
          return new Promise<Response>((resolve) => {
            resolveA = resolve;
          });
        }
        return reply(
          url.searchParams
            .getAll("projectIds")
            .map(Number)
            .reverse()
            .map((id) =>
              dashboardFixture(id, { progress: id * 10, completedTasks: id, bugCount: id + 1 }),
            ),
        );
      }
      if (url.pathname === "/project/v1/dashboard/3") return reply(dashboardFixture());
      if (url.pathname === "/project/v1/progress/3") return reply(progressFixture());
      if (url.pathname === "/project/v1/statistics") return reply(statisticsFixture);
      if (url.pathname === "/project/v1/statistics/options")
        return reply({
          list: [4, 5].map((id) => ({ id, projectName: `候选${id}` })),
          total: 2,
          pageNumber: 1,
          pageSize: 20,
        });
      if (url.pathname === "/defect/v1/statistics") return reply(defectFixture);
      throw new Error(`禁止的测试请求：${url.pathname}`);
    }),
  );
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
  useAuthStore.setState({ isAuthenticated: false });
});
it("页面仅调用六个允许端点，路径+动词+token+wrapper；重复 projectIds 及迟到 A 不覆盖 B/C", async () => {
  render(
    <QueryClientProvider client={client}>
      <ProjectDashboardPage projectId="3" />
    </QueryClientProvider>,
  );
  await screen.findByText("主要：3 个（75.0%）");
  await screen.findByRole("article", { name: "对比项目 真实项目3" });
  const allowed = new Map([
    ["/project/v1/dashboard/3", "GET"],
    ["/project/v1/progress/3", "GET"],
    ["/project/v1/dashboard/compare", "GET"],
    ["/project/v1/statistics", "GET"],
    ["/project/v1/statistics/options", "POST"],
    ["/defect/v1/statistics", "GET"],
  ]);
  expect(new Set(requests.map((request) => request.url.pathname))).toEqual(new Set(allowed.keys()));
  for (const { url, init } of requests) {
    expect(init?.method).toBe(allowed.get(url.pathname));
    expect(new Headers(init?.headers).get("token")).toBe("contract-token");
    expect(new Headers(init?.headers).has("Authorization")).toBe(false);
    if (url.pathname === "/project/v1/statistics/options")
      expect(JSON.parse(String(init?.body))).toEqual({ page: 1, pageSize: 20, bean: {} });
    else expect(init?.body).toBeUndefined();
    if (url.pathname === "/defect/v1/statistics")
      expect(url.searchParams.get("projectId")).toBe("3");
  }
  delayA = true;
  fireEvent.click(screen.getByRole("button", { name: "刷新统计" }));
  await waitFor(() => expect(resolveA).toBeTypeOf("function"));
  fireEvent.click(screen.getByRole("button", { name: "清空对比" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "候选4 #4" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "候选5 #5" }));
  const b = await screen.findByRole("article", { name: "对比项目 真实项目4" });
  const c = await screen.findByRole("article", { name: "对比项目 真实项目5" });
  expect(within(b).getByText("项目进度：40%")).toBeTruthy();
  expect(within(c).getByText("数量（个）：已完成任务 5 · 缺陷 6")).toBeTruthy();
  const comparisonRequests = requests.filter(
    (request) => request.url.pathname === "/project/v1/dashboard/compare",
  );
  expect(comparisonRequests.at(-1)!.url.searchParams.getAll("projectIds")).toEqual(["4", "5"]);
  resolveA!(reply([dashboardFixture(3, { progress: 99 })]));
  await waitFor(() => expect(client.isFetching()).toBe(0));
  expect(screen.queryByRole("article", { name: "对比项目 真实项目3" })).toBeNull();
  expect(screen.getByText("主项目 #3")).toBeTruthy();
  expect(within(b).getByText("项目进度：40%")).toBeTruthy();
});
