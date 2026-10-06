import { isCanonicalUserId } from "./api/auth";
import type {
  NotificationQueryRequest,
  NotificationQueryType,
  NotificationResponse,
} from "./api/notification-types";
import type { PageRequest } from "./api/types";

export const NOTIFICATION_TYPES = {
  SYSTEM: "系统通知",
  TASK_ASSIGNED: "任务分配",
  TASK_COMPLETED: "任务完成",
  DEFECT_REPORTED: "缺陷报告",
  PROJECT_UPDATE: "项目更新",
  COMMENT_REPLY: "评论回复",
  DEADLINE_REMINDER: "截止日期提醒",
} as const satisfies Record<string, NotificationQueryType>;
export type NotificationReadFilter = "" | "unread" | "read";
export interface NotificationFilters {
  type?: string;
  read?: NotificationReadFilter;
  page?: number;
  pageSize?: number;
}
export function normalizeNotificationList(
  filters: NotificationFilters = {},
): PageRequest<NotificationQueryRequest> {
  const bean: NotificationQueryRequest = {};
  if (filters.type && Object.hasOwn(NOTIFICATION_TYPES, filters.type))
    bean.type = NOTIFICATION_TYPES[filters.type as keyof typeof NOTIFICATION_TYPES];
  if (filters.read === "unread") bean.isRead = false;
  if (filters.read === "read") bean.isRead = true;
  return {
    page: Number.isSafeInteger(filters.page) && filters.page! > 0 ? filters.page! : 1,
    pageSize:
      Number.isSafeInteger(filters.pageSize) && filters.pageSize! > 0 ? filters.pageSize! : 10,
    bean,
  };
}
export function notificationUserId(raw: unknown): number | null {
  return isCanonicalUserId(raw) ? Number(raw) : null;
}
export function validNotificationId(id: unknown): id is number {
  return typeof id === "number" && Number.isSafeInteger(id) && id >= 0;
}
export function canMarkNotificationRead(record: NotificationResponse): boolean {
  return record.isRead === false && validNotificationId(record.id);
}
function label(value: string | null, labels: Record<string, string>): string {
  return value == null || value === "" ? "—" : Object.hasOwn(labels, value) ? labels[value] : value;
}
export const notificationTypeLabel = (value: string | null) => label(value, NOTIFICATION_TYPES);
export const notificationStatusLabel = (value: string | null) =>
  label(value, { UNREAD: "未读", READ: "已读", ARCHIVED: "已归档" });
export const notificationPriorityLabel = (value: string | null) =>
  label(value, { LOW: "低", NORMAL: "普通", HIGH: "高", URGENT: "紧急" });
export function notificationCreatedTime(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { hour12: false });
}
/** 服务端 LocalDateTime 无时区，保持文本，不经过 Date 解析。 */
export const notificationReadTime = (value: string | null) => value || "—";
