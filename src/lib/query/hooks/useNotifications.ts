import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
  type Query,
  type QueryClient,
} from "@tanstack/react-query";
import { notificationApi } from "../../api/notification";
import { useAuthStore } from "../../api/auth-store";
import {
  notificationUserId,
  normalizeNotificationList,
  validNotificationId,
  type NotificationFilters,
} from "../../notification-data";
import { queryKeys } from "../keys";

export function useNotificationIdentity() {
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  const raw = useAuthStore((s) => s.user?.userId);
  return authenticated ? notificationUserId(raw) : null;
}
function requireIdentity(userId: number | null) {
  const state = useAuthStore.getState();
  if (
    userId === null ||
    !state.isAuthenticated ||
    notificationUserId(state.user?.userId) !== userId
  ) {
    throw new Error("登录身份已失效，请重新登录");
  }
  return userId;
}
export function useNotificationList(filters: NotificationFilters = {}) {
  const userId = useNotificationIdentity();
  const request = normalizeNotificationList(filters);
  return useQuery({
    queryKey: queryKeys.notification.list({ userId, ...request }),
    enabled: userId !== null,
    queryFn: () => notificationApi.pageNotification(requireIdentity(userId), request),
  });
}
/** 只有 Shell 传入 poll=true；页面观察同一 key，不创建轮询。 */
export function useNotificationUnreadCount(poll = false) {
  const userId = useNotificationIdentity();
  return useQuery({
    queryKey: queryKeys.notification.unreadCount(userId),
    enabled: userId !== null,
    queryFn: async () => {
      const count = await notificationApi.getUnreadCount(requireIdentity(userId));
      if (!Number.isSafeInteger(count) || count < 0) throw new Error("未读数量暂不可用");
      return count;
    },
    refetchInterval: poll && userId !== null ? 60_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
  });
}
function belongsToUser(query: Query, userId: number) {
  const params = query.queryKey[3] as { userId?: number } | undefined;
  return params?.userId === userId;
}
export async function refreshNotifications(client: QueryClient, userId: number) {
  requireIdentity(userId);
  const scope = {
    queryKey: queryKeys.notification.all,
    predicate: (query: Query) => belongsToUser(query, userId),
  };
  await client.invalidateQueries({ ...scope, refetchType: "none" });
  // 等待所有必要查询结束，即使其中一个先失败，也不提前解除写入互斥。
  const outcomes = await Promise.allSettled(
    client
      .getQueryCache()
      .findAll(scope)
      .map((query) =>
        client.refetchQueries(
          { queryKey: query.queryKey, exact: true, type: "all" },
          { throwOnError: true },
        ),
      ),
  );
  if (outcomes.some((outcome) => outcome.status === "rejected"))
    throw new Error(NOTIFICATION_REFRESH_ERROR);
}
export const NOTIFICATION_REFRESH_ERROR = "操作已提交，数据刷新失败，请重试";
function useReadMutation(all: boolean) {
  const client = useQueryClient();
  const userId = useNotificationIdentity();
  return useMutation({
    mutationKey: ["hc", "notification", "markRead", { userId }],
    retry: false,
    mutationFn: async (id: number | undefined) => {
      const currentId = requireIdentity(userId);
      if (client.isMutating({ mutationKey: ["hc", "notification", "markRead", { userId }] }) > 1)
        throw new Error("已读操作正在进行");
      if (!all && !validNotificationId(id)) throw new Error("通知 ID 无效");
      if (all) await notificationApi.markAllAsRead(currentId);
      else await notificationApi.markAsRead(id!, currentId);
      // POST 成功无更新行数，必须以重查为准；旧账户回调不失效新账户数据。
      if (
        !useAuthStore.getState().isAuthenticated ||
        notificationUserId(useAuthStore.getState().user?.userId) !== currentId
      )
        return { refreshFailed: false, sessionChanged: true };
      try {
        await refreshNotifications(client, currentId);
        return { refreshFailed: false, sessionChanged: false };
      } catch {
        return { refreshFailed: true, sessionChanged: false };
      }
    },
  });
}
export const useMarkNotificationAsRead = () => useReadMutation(false);
export const useMarkAllNotificationsAsRead = () => useReadMutation(true);
export function useNotificationWritePending() {
  const userId = useNotificationIdentity();
  return useIsMutating({ mutationKey: ["hc", "notification", "markRead", { userId }] }) > 0;
}
