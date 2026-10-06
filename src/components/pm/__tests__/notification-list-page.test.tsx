// @vitest-environment jsdom
import { useEffect, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NotificationListPage, MARK_ALL_CONFIRMATION } from "../notification-list-page";
import { AppShell } from "../shell";
import { useAuthStore } from "@/lib/api/auth-store";
import { usePm } from "@/lib/pm/store";
import type { NotificationResponse } from "@/lib/api/notification-types";
vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return {
    ...actual,
    api: actual.createApiClient({ baseUrl: "http://test", getToken: () => "notification-token" }),
  };
});
vi.mock("@heroui/react", () => ({
  Button: ({
    children,
    onPress,
    isDisabled,
    "aria-label": label,
  }: {
    children: ReactNode;
    onPress?: () => void;
    isDisabled?: boolean;
    "aria-label"?: string;
  }) => (
    <button disabled={isDisabled} onClick={onPress} aria-label={label}>
      {children}
    </button>
  ),
}));
vi.mock("@/components/biz/app-modal", () => ({
  AppModal: ({
    open,
    title,
    label,
    onClose,
    isCloseDisabled,
    children,
  }: {
    open: boolean;
    title: string;
    label?: string;
    onClose: () => void;
    isCloseDisabled?: boolean;
    children: ReactNode;
  }) => {
    useEffect(() => {
      const handler = (event: KeyboardEvent) => {
        if (open && !isCloseDisabled && event.key === "Escape") onClose();
      };
      document.addEventListener("keydown", handler);
      return () => document.removeEventListener("keydown", handler);
    }, [open, isCloseDisabled, onClose]);
    return open ? (
      <div role="dialog" aria-label={label ?? title}>
        <h2>{title}</h2>
        <button disabled={isCloseDisabled} onClick={onClose}>
          关闭弹窗
        </button>
        {children}
      </div>
    ) : null;
  },
}));
// 导航集成使用真实 Shell/AppRail/router/query；仅省略无关演示布局。
vi.mock("@/components/biz", async () => ({
  AppRail: (await import("@/components/biz/app-rail")).AppRail,
  Loading: (await import("@/components/biz/loading")).Loading,
  CreateIssueDialog: () => null,
  NoticePanel: () => <p>演示通知面板</p>,
  ProjectSidebar: () => null,
  RouteProgress: () => null,
  SearchDialog: () => null,
}));
vi.mock("@/components/biz/person-avatar", () => ({ PersonAvatar: () => <span>头像</span> }));
vi.mock("@/components/pm/navigation-focus", () => ({ NavigationFocus: () => null }));
vi.mock("@/components/pm/use-go-item", () => ({ useGoToItem: () => vi.fn() }));
configure({ asyncUtilTimeout: 5_000 });

const user = {
  userId: "42",
  userName: "登录用户",
  cnName: null,
  roles: [],
  authorities: [],
  extraInfo: {},
};
const fixture = (overrides: Partial<NotificationResponse> = {}): NotificationResponse => ({
  id: 9,
  title: "真实通知",
  content: "第一行\n<img src=x onerror=alert(1)>\n完整正文",
  type: "SYSTEM",
  status: "UNREAD",
  isRead: false,
  createdAt: 1728000000,
  updatedAt: null,
  receiverId: 42,
  senderId: null,
  readTime: null,
  priority: null,
  ...overrides,
});
let records: NotificationResponse[];
let unread: number;
let failList: boolean;
let failCount: boolean;
let failWrite: boolean;
let pauseRefresh: boolean;
let releaseRefresh: (() => void) | undefined;
let requests: {
  path: string;
  method?: string;
  body?: { page: number; pageSize: number; bean: { type?: string; isRead?: boolean } };
}[];
const sent = (part: string) => requests.filter((r) => r.path.includes(part));
const clients: QueryClient[] = [];
beforeEach(() => {
  records = [fixture()];
  unread = 3;
  failList = false;
  failCount = false;
  failWrite = false;
  pauseRefresh = false;
  releaseRefresh = undefined;
  requests = [];
  useAuthStore.setState({ isAuthenticated: true, user });
  usePm.setState({ ready: true, persistenceError: null, noticeOpen: true });
  window.scrollTo = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (input, init) => {
      const path = new URL(String(input)).pathname;
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ path, method: init?.method, body });
      expect(new Headers(init?.headers).get("token")).toBe("notification-token");
      let result: unknown;
      let failed = false;
      if (path === "/notification/v1/pageNotification/42") {
        if (pauseRefresh)
          await new Promise<void>((resolve) => {
            releaseRefresh = resolve;
          });
        failed = failList;
        const filtered = records.filter(
          (row) =>
            (body.bean.isRead === undefined || row.isRead === body.bean.isRead) &&
            (!body.bean.type || (body.bean.type === "系统通知" && row.type === "SYSTEM")),
        );
        result = {
          list: filtered.slice((body.page - 1) * body.pageSize, body.page * body.pageSize),
          total: filtered.length,
          pageNumber: body.page,
          pageSize: body.pageSize,
        };
      } else if (path === "/notification/v1/unreadCount/42") {
        failed = failCount;
        result = unread;
      } else if (path === "/notification/v1/markAsRead/9/42") {
        failed = failWrite;
        if (!failed) {
          records = records.map((row) =>
            row.id === 9
              ? { ...row, isRead: true, status: "READ", readTime: "2026-10-06T10:00:00" }
              : row,
          );
          unread = Math.max(0, unread - 1);
        }
        result = "操作成功";
      } else if (path === "/notification/v1/markAllAsRead/42") {
        failed = failWrite;
        if (!failed) {
          records = records.map((row) => ({ ...row, isRead: true, status: "READ" }));
          unread = 0;
        }
        result = "操作成功";
      } else throw new Error(`越界端点 ${path}`);
      return new Response(
        JSON.stringify({
          code: failed ? 10009 : 1,
          msg: failed ? "请求失败" : "ok",
          result: failed ? null : result,
        }),
        { status: failed ? 403 : 200, headers: { "Content-Type": "application/json" } },
      );
    }),
  );
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.unstubAllGlobals();
  useAuthStore.setState({ isAuthenticated: false, user: null });
});
async function mount(shell = false, rootEffect?: () => void) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const Root = () => {
    useEffect(() => rootEffect?.(), []);
    return <Outlet />;
  };
  const root = createRootRoute({ component: Root });
  const start = createRoute({
    getParentRoute: () => root,
    path: "/test",
    component: () =>
      shell ? (
        <AppShell>
          <p>工作台</p>
        </AppShell>
      ) : (
        <NotificationListPage />
      ),
  });
  const notifications = createRoute({
    getParentRoute: () => root,
    path: "/notifications",
    component: () => (
      <AppShell>
        <NotificationListPage />
      </AppShell>
    ),
  });
  const login = createRoute({
    getParentRoute: () => root,
    path: "/login",
    component: () => <p>登录页面</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([start, notifications, login]),
    history: createMemoryHistory({ initialEntries: ["/test"] }),
  });
  await router.load();
  return {
    ...render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
    client,
    router,
  };
}
async function loaded() {
  await screen.findByRole("button", { name: "真实通知" });
}
it("默认 wrapper；筛选、页大小、清空均回第一页，false/中文类型准确", async () => {
  records = Array.from({ length: 25 }, (_, i) => fixture({ id: i + 1, title: `通知${i + 1}` }));
  await mount();
  await screen.findByRole("button", { name: "通知1" });
  expect(sent("pageNotification")[0].body).toEqual({ page: 1, pageSize: 10, bean: {} });
  fireEvent.click(screen.getByRole("button", { name: "下一页" }));
  await screen.findByRole("button", { name: "通知11" });
  fireEvent.change(screen.getByLabelText("已读状态"), { target: { value: "unread" } });
  await waitFor(() =>
    expect(sent("pageNotification").at(-1)?.body).toEqual({
      page: 1,
      pageSize: 10,
      bean: { isRead: false },
    }),
  );
  fireEvent.change(screen.getByLabelText("通知类型"), { target: { value: "SYSTEM" } });
  await waitFor(() =>
    expect(sent("pageNotification").at(-1)?.body?.bean).toEqual({
      isRead: false,
      type: "系统通知",
    }),
  );
  fireEvent.change(screen.getByLabelText("每页条数"), { target: { value: "20" } });
  await waitFor(() =>
    expect(sent("pageNotification").at(-1)?.body).toEqual({
      page: 1,
      pageSize: 20,
      bean: { isRead: false, type: "系统通知" },
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "清空筛选" }));
  await waitFor(() => expect(sent("pageNotification").at(-1)?.body?.bean).toEqual({}));
});
it("详情纯文本完整换行；打开/关闭无写入，焦点返回；显式已读刷新最新记录", async () => {
  await mount();
  await loaded();
  const trigger = screen.getByRole("button", { name: "真实通知" });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog", { name: "通知详情" });
  expect(dialog.querySelector("img")).toBeNull();
  expect(within(dialog).getByText(/第一行/).textContent).toBe(records[0].content);
  expect(sent("markAsRead")).toHaveLength(0);
  fireEvent.click(within(dialog).getByRole("button", { name: "关闭详情" }));
  expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "标为已读" }));
  await screen.findByText("2026-10-06T10:00:00");
  expect(
    (
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "标为已读",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(sent("markAsRead")).toHaveLength(1);
});
it("单条资格只依赖 isRead 和安全 ID；未知/已读禁用，状态冲突不伪造", async () => {
  records = [
    fixture({ title: "已读", isRead: true }),
    fixture({ id: 10, title: "未知", isRead: null }),
    fixture({ id: Number.MAX_SAFE_INTEGER + 1, title: "坏ID" }),
    fixture({ id: 11, title: "冲突", status: "READ", isRead: false }),
  ];
  await mount();
  await screen.findByRole("button", { name: "已读" });
  for (const title of ["已读", "未知", "坏ID"])
    expect(
      (screen.getByRole("button", { name: `标为已读：${title}` }) as HTMLButtonElement).disabled,
    ).toBe(true);
  expect(
    (screen.getByRole("button", { name: "标为已读：冲突" }) as HTMLButtonElement).disabled,
  ).toBe(false);
  expect(sent("markAsRead")).toHaveLength(0);
});
it("全部已读必须确认，取消/关闭不 POST；覆盖分页类型并刷新 Shell 数字", async () => {
  unread = 123;
  records.push(fixture({ id: 10, type: "PROJECT_UPDATE", title: "其他类型" }));
  const view = await mount(true);
  const bell = await screen.findByRole("button", { name: "通知，123 条未读" });
  expect(screen.getByText("99+")).toBeTruthy();
  expect(screen.queryByText("演示通知面板")).toBeNull();
  fireEvent.click(bell);
  await loaded();
  expect(view.router.state.location.pathname).toBe("/notifications");
  fireEvent.change(screen.getByLabelText("通知类型"), { target: { value: "SYSTEM" } });
  await waitFor(() => expect(sent("pageNotification").at(-1)?.body?.bean.type).toBe("系统通知"));
  await waitFor(() =>
    expect((screen.getByRole("button", { name: "全部已读" }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
  for (const cancel of ["取消", "关闭弹窗"]) {
    fireEvent.click(screen.getByRole("button", { name: "全部已读" }));
    expect(screen.getByText(MARK_ALL_CONFIRMATION)).toBeTruthy();
    expect(sent("markAllAsRead")).toHaveLength(0);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: cancel }));
  }
  fireEvent.click(screen.getByRole("button", { name: "全部已读" }));
  fireEvent.click(screen.getByRole("button", { name: "确认全部已读" }));
  await screen.findByRole("button", { name: "通知，0 条未读" });
  expect(screen.queryByText("99+")).toBeNull();
  expect(unread).toBe(0);
  expect(records.every((row) => row.isRead)).toBe(true);
  expect(sent("markAllAsRead")).toEqual([
    { path: "/notification/v1/markAllAsRead/42", method: "POST", body: undefined },
  ]);
  expect((screen.getByRole("button", { name: "全部已读" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
});
it("全部提交/刷新 pending 时互斥；成功重查失败提示，重试仅查询", async () => {
  await mount();
  await loaded();
  fireEvent.click(screen.getByRole("button", { name: "全部已读" }));
  pauseRefresh = true;
  failCount = true;
  fireEvent.click(screen.getByRole("button", { name: "确认全部已读" }));
  await waitFor(() => expect(releaseRefresh).toBeTypeOf("function"));
  expect(
    (screen.getByRole("button", { name: "标为已读：真实通知" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect((screen.getByRole("button", { name: "确认全部已读" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  await act(async () => {
    pauseRefresh = false;
    releaseRefresh?.();
  });
  await screen.findByText("操作已提交，数据刷新失败，请重试");
  failCount = false;
  fireEvent.click(screen.getByRole("button", { name: "重试刷新" }));
  await screen.findByText("没有未读通知");
  expect(sent("markAllAsRead")).toHaveLength(1);
});
it("全部确认弹窗内计数归零后禁止提交", async () => {
  const view = await mount();
  await loaded();
  fireEvent.click(screen.getByRole("button", { name: "全部已读" }));
  unread = 0;
  await act(async () => {
    await view.client.invalidateQueries({ queryKey: ["hc", "notification", "unreadCount"] });
  });
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "确认全部已读" }) as HTMLButtonElement).disabled,
    ).toBe(true),
  );
  fireEvent.click(screen.getByRole("button", { name: "确认全部已读" }));
  expect(sent("markAllAsRead")).toHaveLength(0);
});
it("未读筛选删除最后页记录后关闭详情，回到合法页重查", async () => {
  records = Array.from({ length: 11 }, (_, i) =>
    fixture({ id: i === 10 ? 9 : 100 + i, title: i === 10 ? "真实通知" : `通知${i}` }),
  );
  unread = 11;
  await mount();
  fireEvent.change(screen.getByLabelText("已读状态"), { target: { value: "unread" } });
  await screen.findByRole("button", { name: "通知0" });
  fireEvent.click(screen.getByRole("button", { name: "下一页" }));
  await loaded();
  fireEvent.click(screen.getByRole("button", { name: "真实通知" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "标为已读" }));
  await screen.findByRole("button", { name: "通知0" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(sent("pageNotification").at(-1)?.body?.page).toBe(1);
});
it("列表错误/保留旧列表错误与计数独立，未知数量禁用全部并可重试", async () => {
  failList = true;
  const view = await mount();
  await screen.findByText("通知列表加载失败。");
  expect(screen.getByText("3 条未读通知")).toBeTruthy();
  failList = false;
  fireEvent.click(screen.getByRole("button", { name: "重试列表" }));
  await loaded();
  failList = true;
  failCount = true;
  fireEvent.click(screen.getByRole("button", { name: "刷新" }));
  await screen.findByText("通知列表刷新失败，保留上次结果。");
  expect(screen.getByRole("button", { name: "真实通知" })).toBeTruthy();
  expect(screen.getByText("未读数暂不可用")).toBeTruthy();
  expect((screen.getByRole("button", { name: "全部已读" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  failCount = false;
  fireEvent.click(screen.getByRole("button", { name: "重试未读数" }));
  await screen.findByText("3 条未读通知");
  expect(view.client.getQueryData(["hc", "notification", "unreadCount", { userId: 42 }])).toBe(3);
});
it("写失败保留列表计数，不自动重发", async () => {
  failWrite = true;
  await mount();
  await loaded();
  fireEvent.click(screen.getByRole("button", { name: "标为已读：真实通知" }));
  await screen.findByText("已读操作失败：请求失败");
  expect(screen.getByText("3 条未读通知")).toBeTruthy();
  expect(sent("markAsRead")).toHaveLength(1);
});
it("成功空态与未登录引导；根登录恢复后查询，非法身份不请求", async () => {
  useAuthStore.setState({ isAuthenticated: false, user: null });
  const anonymous = await mount();
  await screen.findByText("请登录后查看通知中心。");
  expect(requests).toHaveLength(0);
  anonymous.unmount();
  records = [];
  await mount(false, () => useAuthStore.setState({ isAuthenticated: true, user }));
  await screen.findByText("当前筛选没有通知。");
  cleanup();
  requests = [];
  useAuthStore.setState({ user: { ...user, userId: "01" } });
  await mount();
  await screen.findByText(/登录身份无效/);
  expect(requests).toHaveLength(0);
});

it("列表初始 skeleton 与计数互相独立，关闭详情 Escape 返回触发点", async () => {
  pauseRefresh = true;
  await mount();
  await screen.findByText("正在加载通知列表…");
  await screen.findByText("3 条未读通知");
  await act(async () => {
    pauseRefresh = false;
    releaseRefresh?.();
  });
  await loaded();
  const trigger = screen.getByRole("button", { name: "真实通知" });
  trigger.focus();
  fireEvent.click(trigger);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(sent("markAsRead")).toHaveLength(0);
});
it("导航计数失败仍可进入通知中心，不借用演示数或声称零", async () => {
  failCount = true;
  await mount(true);
  const bell = await screen.findByRole("button", { name: "通知，未读数暂不可用" });
  expect(screen.queryByRole("button", { name: "通知，0 条未读" })).toBeNull();
  fireEvent.click(bell);
  await loaded();
  expect((screen.getByRole("button", { name: "全部已读" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
});
it("全部写入失败提示在确认弹窗内，单条写入失败提示在详情内", async () => {
  failWrite = true;
  await mount();
  await loaded();
  fireEvent.click(screen.getByRole("button", { name: "全部已读" }));
  fireEvent.click(screen.getByRole("button", { name: "确认全部已读" }));
  await within(screen.getByRole("dialog")).findByText("已读操作失败：请求失败");
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  fireEvent.click(screen.getByRole("button", { name: "真实通知" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "标为已读" }));
  await within(screen.getByRole("dialog")).findByText("已读操作失败：请求失败");
  expect(sent("markAllAsRead")).toHaveLength(1);
  expect(sent("markAsRead")).toHaveLength(1);
});
