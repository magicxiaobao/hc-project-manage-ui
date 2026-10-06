import { Button } from "@heroui/react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AppModal } from "@/components/biz/app-modal";
import { PageHeading } from "@/components/biz/page-heading";
import { EmptyHint } from "@/components/biz/empty-hint";
import { Loading } from "@/components/biz/loading";
import { NotificationDetailDialog } from "./notification-detail-dialog";
import { useAuthStore } from "@/lib/api/auth-store";
import type { NotificationResponse } from "@/lib/api/notification-types";
import {
  NOTIFICATION_TYPES,
  canMarkNotificationRead,
  notificationCreatedTime,
  notificationStatusLabel,
  notificationTypeLabel,
  type NotificationFilters,
  type NotificationReadFilter,
} from "@/lib/notification-data";
import {
  NOTIFICATION_REFRESH_ERROR,
  useMarkAllNotificationsAsRead,
  useMarkNotificationAsRead,
  useNotificationIdentity,
  useNotificationList,
  useNotificationUnreadCount,
  useNotificationWritePending,
} from "@/lib/query/hooks/useNotifications";

export const MARK_ALL_CONFIRMATION =
  "将把当前用户全部类型、所有分页的未归档未读通知标为已读，不限当前筛选。本页面内不可恢复（无“标为未读”操作）。";
export function NotificationListPage() {
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useNotificationIdentity();
  const [restored, setRestored] = useState(false);
  // 根路由负责 hydrate；被动 effect 结束前不显示未登录提示。
  useEffect(() => setRestored(true), []);
  if (!restored) return <Loading label="正在恢复登录状态…" />;
  if (!authenticated)
    return (
      <div className="p-6">
        <p>请登录后查看通知中心。</p>
        <Link to="/login" className="type-link">
          登录
        </Link>
      </div>
    );
  if (userId === null)
    return (
      <div role="alert" className="p-6">
        登录身份无效，请重新登录。<Link to="/login">登录</Link>
      </div>
    );
  return <NotificationCenter key={userId} />;
}
function NotificationCenter() {
  const client = useQueryClient();
  const userId = useNotificationIdentity();
  const [filters, setFilters] = useState<NotificationFilters>({
    page: 1,
    pageSize: 10,
    type: "",
    read: "",
  });
  const list = useNotificationList(filters);
  const count = useNotificationUnreadCount();
  const single = useMarkNotificationAsRead();
  const all = useMarkAllNotificationsAsRead();
  const busy = useNotificationWritePending();
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const detailTrigger = useRef<HTMLElement | null>(null);
  const selected = list.data?.list.find((row) => row.id === selectedId) ?? null;
  const closeDetail = () => {
    setSelectedId(null);
    detailTrigger.current?.focus();
  };
  useEffect(() => {
    if (selectedId !== null && !selected) {
      setSelectedId(null);
      detailTrigger.current?.focus();
    }
  }, [selectedId, selected]);
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 10;
  const lastPage = list.data ? Math.max(1, Math.ceil(list.data.total / pageSize)) : 1;
  useEffect(() => {
    if (list.isSuccess && !list.isFetching && page > lastPage)
      setFilters((previous) => ({ ...previous, page: lastPage }));
  }, [page, lastPage, list.isSuccess, list.isFetching]);
  const writeDisabled = busy || refreshing || list.isFetching;
  const allDisabled =
    writeDisabled || count.isError || count.data === undefined || count.data === 0;
  const changeFilter = (next: Partial<NotificationFilters>) =>
    setFilters((previous) => ({ ...previous, ...next, page: 1 }));
  const refresh = async () => {
    setRefreshing(true);
    const outcomes = await Promise.allSettled([
      list.refetch({ throwOnError: true }),
      count.refetch({ throwOnError: true }),
    ]);
    setMessage(
      outcomes.some((outcome) => outcome.status === "rejected") ? "数据刷新失败，请重试" : "",
    );
    setRefreshing(false);
  };
  const mark = async (record?: NotificationResponse) => {
    // isMutating 同步守卫覆盖 React 尚未重渲染时的重复点击。
    if (
      writeDisabled ||
      client.isMutating({ mutationKey: ["hc", "notification", "markRead", { userId }] })
    )
      return;
    if (record ? !canMarkNotificationRead(record) : allDisabled) return;
    setMessage("");
    try {
      const outcome = record
        ? await single.mutateAsync(record.id)
        : await all.mutateAsync(undefined);
      if (outcome.sessionChanged) return;
      setMessage(
        outcome.refreshFailed ? NOTIFICATION_REFRESH_ERROR : "操作已提交，已按服务端结果刷新",
      );
      if (!record) setConfirmOpen(false);
    } catch (error) {
      setMessage(`已读操作失败：${error instanceof Error ? error.message : "请重试"}`);
    }
  };
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeading title="通知中心" hint="查看当前登录用户的通知。打开详情不会自动标为已读。" />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" isDisabled={writeDisabled} onPress={() => void refresh()}>
            刷新
          </Button>
          <Button isDisabled={allDisabled} onPress={() => setConfirmOpen(true)}>
            全部已读
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted">全部已读覆盖全部类型与所有分页。</p>
      <div aria-live="polite">
        {count.isError ? (
          <div role="alert">
            未读数暂不可用
            <Button
              variant="outline"
              isDisabled={writeDisabled || count.isFetching}
              onPress={() => void count.refetch()}
            >
              重试未读数
            </Button>
          </div>
        ) : count.data === undefined ? (
          <Loading variant="inline" label="未读数加载中" />
        ) : (
          <p>{count.data === 0 ? "没有未读通知" : `${count.data} 条未读通知`}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">
          通知类型
          <select
            className="rounded border border-border bg-surface p-2"
            value={filters.type}
            onChange={(e) => changeFilter({ type: e.target.value })}
          >
            <option value="">全部类型</option>
            {Object.entries(NOTIFICATION_TYPES).map(([key, value]) => (
              <option key={key} value={key}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          已读状态
          <select
            className="rounded border border-border bg-surface p-2"
            value={filters.read}
            onChange={(e) => changeFilter({ read: e.target.value as NotificationReadFilter })}
          >
            <option value="">全部</option>
            <option value="unread">未读</option>
            <option value="read">已读</option>
          </select>
        </label>
        <Button variant="outline" onPress={() => changeFilter({ type: "", read: "" })}>
          清空筛选
        </Button>
      </div>
      {message && !confirmOpen && !selected ? (
        <div role="status" className="flex flex-wrap items-center gap-2">
          {message}
          {message.includes("刷新失败") ? (
            <Button variant="outline" isDisabled={writeDisabled} onPress={() => void refresh()}>
              重试刷新
            </Button>
          ) : null}
        </div>
      ) : null}
      {busy || refreshing ? <Loading variant="inline" label="正在提交或刷新通知…" /> : null}
      {list.isError ? (
        <div role="alert">
          {list.data ? "通知列表刷新失败，保留上次结果。" : "通知列表加载失败。"}
          <Button
            variant="outline"
            isDisabled={writeDisabled || list.isFetching}
            onPress={() => void list.refetch()}
          >
            重试列表
          </Button>
        </div>
      ) : null}
      {list.isPending ? (
        <div className="animate-pulse rounded border border-border bg-surface p-6">
          <Loading label="正在加载通知列表…" />
        </div>
      ) : list.data ? (
        <section className="rounded border border-border bg-surface" aria-label="通知列表">
          {list.data.list.length === 0 ? (
            <EmptyHint>{page > lastPage ? "正在调整分页…" : "当前筛选没有通知。"}</EmptyHint>
          ) : (
            list.data.list.map((record, index) => (
              <article
                key={`${record.id}:${index}`}
                className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4 last:border-b-0"
              >
                <div className="min-w-0 flex-1 basis-60">
                  <button
                    type="button"
                    className="type-emphasis break-words text-left hover:underline"
                    onClick={(event) => {
                      detailTrigger.current = event.currentTarget;
                      setSelectedId(record.id);
                    }}
                  >
                    {record.title ?? "—"}
                  </button>
                  <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-sm">
                    {record.content ?? "—"}
                  </p>
                  <p className="mt-2 text-sm text-muted">
                    {notificationTypeLabel(record.type)} · {notificationStatusLabel(record.status)}{" "}
                    · {record.isRead === null ? "阅读状态未知" : record.isRead ? "已读" : "未读"} ·{" "}
                    {notificationCreatedTime(record.createdAt)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  aria-label={`标为已读：${record.title ?? "通知"}`}
                  isDisabled={writeDisabled || !canMarkNotificationRead(record)}
                  onPress={() => void mark(record)}
                >
                  标为已读
                </Button>
              </article>
            ))
          )}
        </section>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3" aria-label="分页">
        <label>
          每页条数{" "}
          <select
            value={pageSize}
            onChange={(e) => changeFilter({ pageSize: Number(e.target.value) })}
            className="rounded border border-border bg-surface p-2"
          >
            {[10, 20, 50].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <span>
          第 {page} 页{list.data ? `，共 ${lastPage} 页（${list.data.total} 条）` : ""}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            isDisabled={page <= 1 || list.isFetching || writeDisabled}
            onPress={() => setFilters((previous) => ({ ...previous, page: Math.max(1, page - 1) }))}
          >
            上一页
          </Button>
          <Button
            variant="outline"
            isDisabled={!list.data || page >= lastPage || list.isFetching || writeDisabled}
            onPress={() => setFilters((previous) => ({ ...previous, page: page + 1 }))}
          >
            下一页
          </Button>
        </div>
      </div>
      <NotificationDetailDialog
        record={selected}
        busy={writeDisabled}
        message={message}
        onRetryRefresh={() => void refresh()}
        onClose={closeDetail}
        onMarkRead={(record) => void mark(record)}
      />
      <AppModal
        open={confirmOpen}
        title="确认全部已读"
        onClose={() => setConfirmOpen(false)}
        isCloseDisabled={busy}
        size="md"
      >
        <p>{MARK_ALL_CONFIRMATION}</p>
        {message ? <p role="alert">{message}</p> : null}
        {busy ? <Loading variant="inline" label="正在提交或刷新通知…" /> : null}
        {count.isError ? <p role="alert">未读数暂不可用，请关闭弹窗后重试未读数。</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" isDisabled={busy} onPress={() => setConfirmOpen(false)}>
            取消
          </Button>
          <Button isDisabled={allDisabled} onPress={() => void mark()}>
            确认全部已读
          </Button>
        </div>
      </AppModal>
    </div>
  );
}
