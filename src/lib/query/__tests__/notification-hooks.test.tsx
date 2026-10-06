// @vitest-environment jsdom
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { notificationApi } from "@/lib/api/notification";
import { useAuthStore } from "@/lib/api/auth-store";
import { queryKeys } from "../keys";
import {
  useMarkAllNotificationsAsRead,
  useMarkNotificationAsRead,
  useNotificationList,
  useNotificationUnreadCount,
  useNotificationWritePending,
} from "../hooks/useNotifications";
const user = {
  userId: "42",
  userName: "真实用户",
  cnName: null,
  roles: [],
  authorities: [],
  extraInfo: {},
};
const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}
const empty = { list: [], total: 0, pageNumber: 1, pageSize: 10 };
beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: true, user });
  focusManager.setFocused(true);
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
  focusManager.setFocused(undefined);
  useAuthStore.setState({ isAuthenticated: false, user: null });
});
it.each([null, "01", "9007199254740992"])(
  "无效身份 %s 禁用请求，包括手动 refetch",
  async (userId) => {
    useAuthStore.setState({ user: userId === null ? null : { ...user, userId } });
    const list = vi.spyOn(notificationApi, "pageNotification");
    const count = vi.spyOn(notificationApi, "getUnreadCount");
    const h = renderHook(
      () => ({ list: useNotificationList(), count: useNotificationUnreadCount(true) }),
      setup(),
    );
    await act(async () => {
      await h.result.current.list.refetch();
      await h.result.current.count.refetch();
    });
    expect(list).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  },
);
it("未登录不请求，合法 0 使用当前身份和规范 wrapper/key", async () => {
  const list = vi.spyOn(notificationApi, "pageNotification").mockResolvedValue(empty);
  const count = vi.spyOn(notificationApi, "getUnreadCount").mockResolvedValue(3);
  useAuthStore.setState({ isAuthenticated: false });
  const s = setup();
  const h = renderHook(
    () => ({
      list: useNotificationList({ type: "SYSTEM", read: "unread", page: 2 }),
      count: useNotificationUnreadCount(),
    }),
    s,
  );
  expect(list).not.toHaveBeenCalled();
  expect(count).not.toHaveBeenCalled();
  act(() => useAuthStore.setState({ isAuthenticated: true, user: { ...user, userId: "0" } }));
  await waitFor(() => expect(h.result.current.list.isSuccess).toBe(true));
  expect(list).toHaveBeenCalledWith(0, {
    page: 2,
    pageSize: 10,
    bean: { type: "系统通知", isRead: false },
  });
  expect(s.client.getQueryData(queryKeys.notification.unreadCount(0))).toBe(3);
});
it("Shell 和页面同一个计数 key 合并在途请求", async () => {
  let resolve!: (value: number) => void;
  const count = vi.spyOn(notificationApi, "getUnreadCount").mockImplementation(
    () =>
      new Promise<number>((r) => {
        resolve = r;
      }),
  );
  const h = renderHook(
    () => ({ shell: useNotificationUnreadCount(true), page: useNotificationUnreadCount() }),
    setup(),
  );
  expect(count).toHaveBeenCalledTimes(1);
  await act(async () => resolve(123));
  await waitFor(() => expect(h.result.current.page.data).toBe(123));
  expect(h.result.current.shell.data).toBe(123);
});
it.each([0, 2, 3])(
  "单条重查后计数为 %s：最后一条/多条/成功无变化，不乐观减一",
  async (remaining) => {
    let countValue = 3;
    vi.spyOn(notificationApi, "getUnreadCount").mockImplementation(async () => countValue);
    const page = vi.spyOn(notificationApi, "pageNotification").mockResolvedValue(empty);
    vi.spyOn(notificationApi, "markAsRead").mockImplementation(async () => {
      countValue = remaining;
      return "操作成功";
    });
    const s = setup();
    const a = queryKeys.notification.list({
      userId: 42,
      page: 2,
      pageSize: 20,
      bean: { isRead: true },
    });
    const b = queryKeys.notification.list({ userId: 7, page: 1, pageSize: 10, bean: {} });
    s.client.setQueryData(a, empty);
    s.client.setQueryData(b, empty);
    s.client.setQueryData(queryKeys.project.all, "项目");
    const h = renderHook(
      () => ({
        list: useNotificationList(),
        other: useNotificationList({ page: 2, pageSize: 20, read: "read" }),
        count: useNotificationUnreadCount(),
        write: useMarkNotificationAsRead(),
      }),
      s,
    );
    await waitFor(() => expect(h.result.current.count.data).toBe(3));
    await act(async () => {
      await h.result.current.write.mutateAsync(9);
    });
    await waitFor(() => expect(h.result.current.count.data).toBe(remaining));
    expect(page).toHaveBeenCalledWith(42, { page: 2, pageSize: 20, bean: { isRead: true } });
    expect(s.client.getQueryState(b)?.isInvalidated).toBe(false);
    expect(s.client.getQueryState(queryKeys.project.all)?.isInvalidated).toBe(false);
  },
);
it("全部操作无筛选参数，刷新全局计数至零", async () => {
  let remaining = 11;
  vi.spyOn(notificationApi, "getUnreadCount").mockImplementation(async () => remaining);
  vi.spyOn(notificationApi, "pageNotification").mockResolvedValue(empty);
  const post = vi.spyOn(notificationApi, "markAllAsRead").mockImplementation(async () => {
    remaining = 0;
    return "操作成功";
  });
  const h = renderHook(
    () => ({
      list: useNotificationList({ page: 2, type: "SYSTEM" }),
      count: useNotificationUnreadCount(),
      all: useMarkAllNotificationsAsRead(),
    }),
    setup(),
  );
  await waitFor(() => expect(h.result.current.count.data).toBe(11));
  await act(async () => {
    await h.result.current.all.mutateAsync(undefined);
  });
  expect(post).toHaveBeenCalledWith(42);
  await waitFor(() => expect(h.result.current.count.data).toBe(0));
});
it("写失败不失效；写成功重查失败保留计数，查询重试不重复 POST", async () => {
  const count = vi.spyOn(notificationApi, "getUnreadCount").mockResolvedValue(3);
  const post = vi
    .spyOn(notificationApi, "markAsRead")
    .mockRejectedValueOnce(new Error("写失败"))
    .mockResolvedValue("操作成功");
  const s = setup();
  const invalidate = vi.spyOn(s.client, "invalidateQueries");
  const h = renderHook(
    () => ({ count: useNotificationUnreadCount(), write: useMarkNotificationAsRead() }),
    s,
  );
  await waitFor(() => expect(h.result.current.count.data).toBe(3));
  await act(async () => {
    await expect(h.result.current.write.mutateAsync(9)).rejects.toThrow("写失败");
  });
  expect(invalidate).not.toHaveBeenCalled();
  count.mockRejectedValue(new Error("重查失败"));
  await act(async () => {
    expect(await h.result.current.write.mutateAsync(9)).toMatchObject({ refreshFailed: true });
  });
  expect(h.result.current.count.data).toBe(3);
  expect(h.result.current.count.isError).toBe(true);
  count.mockResolvedValue(2);
  await act(async () => {
    await h.result.current.count.refetch();
  });
  expect(post).toHaveBeenCalledTimes(2);
});
it("刷新 pending 持续互斥，无效记录 ID 阻止 POST", async () => {
  let resolve!: (value: number) => void;
  let pending = false;
  vi.spyOn(notificationApi, "getUnreadCount").mockImplementation(() =>
    pending
      ? new Promise<number>((r) => {
          resolve = r;
        })
      : Promise.resolve(3),
  );
  const post = vi.spyOn(notificationApi, "markAsRead").mockResolvedValue("操作成功");
  const h = renderHook(
    () => ({
      count: useNotificationUnreadCount(),
      single: useMarkNotificationAsRead(),
      all: useMarkAllNotificationsAsRead(),
      busy: useNotificationWritePending(),
    }),
    setup(),
  );
  await waitFor(() => expect(h.result.current.count.data).toBe(3));
  await act(async () => {
    await expect(h.result.current.single.mutateAsync(Number.MAX_SAFE_INTEGER + 1)).rejects.toThrow(
      "ID",
    );
  });
  expect(post).not.toHaveBeenCalled();
  pending = true;
  let writing!: Promise<unknown>;
  act(() => {
    writing = h.result.current.single.mutateAsync(9);
  });
  await waitFor(() => expect(h.result.current.busy).toBe(true));
  await waitFor(() => expect(resolve).toBeTypeOf("function"));
  await act(async () => resolve(2));
  await act(async () => {
    await writing;
  });
  await waitFor(() => expect(h.result.current.busy).toBe(false));
});
it("换账号隔离数据，旧 mutation 迟到回调不刷新 B；旧闭包不能以 B 身份写入", async () => {
  const count = vi
    .spyOn(notificationApi, "getUnreadCount")
    .mockImplementation(async (id) => (id === 42 ? 3 : 8));
  let resolve!: (value: string) => void;
  const post = vi.spyOn(notificationApi, "markAsRead").mockImplementation(
    () =>
      new Promise<string>((r) => {
        resolve = r;
      }),
  );
  const s = setup();
  const invalidate = vi.spyOn(s.client, "invalidateQueries");
  const h = renderHook(
    () => ({ count: useNotificationUnreadCount(), write: useMarkNotificationAsRead() }),
    s,
  );
  await waitFor(() => expect(h.result.current.count.data).toBe(3));
  const oldWrite = h.result.current.write.mutateAsync;
  let promise!: Promise<unknown>;
  act(() => {
    promise = oldWrite(9);
  });
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  act(() => useAuthStore.setState({ user: { ...user, userId: "7" } }));
  expect(h.result.current.count.data).not.toBe(3);
  await waitFor(() => expect(h.result.current.count.data).toBe(8));
  await act(async () => {
    resolve("操作成功");
    await promise;
  });
  expect(invalidate).not.toHaveBeenCalled();
  expect(count).toHaveBeenCalledTimes(2);
});
it("60 秒轮询：页面无独立计时器，隐藏暂停，focus always 覆盖全局 false，卸载/登出停止", async () => {
  vi.useFakeTimers();
  const count = vi.spyOn(notificationApi, "getUnreadCount").mockResolvedValue(3);
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  focusManager.setFocused(undefined);
  const s = setup();
  const h = renderHook(
    () => ({ shell: useNotificationUnreadCount(true), page: useNotificationUnreadCount() }),
    s,
  );
  const advance = async (ms: number) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  };
  await advance(1);
  expect(count).toHaveBeenCalledTimes(1);
  await advance(59_999);
  expect(count).toHaveBeenCalledTimes(2);
  act(() => {
    visibility.mockReturnValue("hidden");
    window.dispatchEvent(new Event("visibilitychange"));
  });
  await advance(60_000);
  expect(count).toHaveBeenCalledTimes(2);
  act(() => {
    visibility.mockReturnValue("visible");
    window.dispatchEvent(new Event("visibilitychange"));
  });
  await advance(1);
  expect(count).toHaveBeenCalledTimes(3);
  // 刚刚成功的缓存仍 fresh，重新可见也立即刷新。
  act(() => focusManager.setFocused(false));
  act(() => focusManager.setFocused(true));
  await advance(1);
  expect(count).toHaveBeenCalledTimes(4);
  act(() => useAuthStore.setState({ isAuthenticated: false, user: null }));
  await advance(120_000);
  expect(count).toHaveBeenCalledTimes(4);
  h.unmount();
  await advance(120_000);
  expect(count).toHaveBeenCalledTimes(4);
});

it("仅页面订阅不轮询；Shell 在登录态卸载后也停止轮询", async () => {
  vi.useFakeTimers();
  const count = vi.spyOn(notificationApi, "getUnreadCount").mockResolvedValue(3);
  const s = setup();
  const shell = renderHook(() => useNotificationUnreadCount(true), s);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(count).toHaveBeenCalledTimes(1);
  shell.unmount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(120_000);
  });
  expect(count).toHaveBeenCalledTimes(1);
  renderHook(() => useNotificationUnreadCount(), s);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(count).toHaveBeenCalledTimes(2);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(120_000);
  });
  expect(count).toHaveBeenCalledTimes(2);
});
it("操作发起时身份 A 与执行时身份 B 不同，禁止以 B 的凭证提交 A 操作", async () => {
  const post = vi.spyOn(notificationApi, "markAsRead");
  const h = renderHook(() => useMarkNotificationAsRead(), setup());
  await act(async () => {
    useAuthStore.setState({ user: { ...user, userId: "7" } });
    await expect(h.result.current.mutateAsync(9)).rejects.toThrow("重新登录");
  });
  expect(post).not.toHaveBeenCalled();
});
