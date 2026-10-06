import { Button } from "@heroui/react";
import { Loading } from "@/components/biz/loading";
import { AppModal } from "@/components/biz/app-modal";
import type { NotificationResponse } from "@/lib/api/notification-types";
import {
  canMarkNotificationRead,
  notificationCreatedTime,
  notificationReadTime,
  notificationStatusLabel,
  notificationTypeLabel,
} from "@/lib/notification-data";

export function NotificationDetailDialog({
  record,
  busy,
  message,
  onRetryRefresh,
  onClose,
  onMarkRead,
}: {
  record: NotificationResponse | null;
  busy: boolean;
  message?: string;
  onRetryRefresh?: () => void;
  onClose: () => void;
  onMarkRead: (record: NotificationResponse) => void;
}) {
  if (!record) return null;
  return (
    <AppModal
      open
      title={record.title || "通知详情"}
      label="通知详情"
      onClose={onClose}
      bodyClassName="max-h-[70vh] overflow-auto"
    >
      <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt>类型</dt>
        <dd>{notificationTypeLabel(record.type)}</dd>
        <dt>状态</dt>
        <dd>
          {notificationStatusLabel(record.status)}（
          {record.isRead === null ? "阅读状态未知" : record.isRead ? "已读" : "未读"}）
        </dd>
        <dt>创建时间</dt>
        <dd>{notificationCreatedTime(record.createdAt)}</dd>
        {record.readTime ? (
          <>
            <dt>阅读时间</dt>
            <dd>{notificationReadTime(record.readTime)}</dd>
          </>
        ) : null}
      </dl>
      <p className="whitespace-pre-wrap break-words">{record.content ?? "—"}</p>
      {message ? <p role="status">{message}</p> : null}
      {message?.includes("刷新失败") && onRetryRefresh ? (
        <Button variant="outline" isDisabled={busy} onPress={onRetryRefresh}>
          重试刷新
        </Button>
      ) : null}
      {busy ? <Loading variant="inline" label="正在提交或刷新通知…" /> : null}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onPress={onClose}>
          关闭详情
        </Button>
        <Button
          isDisabled={busy || !canMarkNotificationRead(record)}
          onPress={() => onMarkRead(record)}
        >
          标为已读
        </Button>
      </div>
    </AppModal>
  );
}
