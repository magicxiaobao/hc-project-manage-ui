import { expect, it } from "vitest";
import {
  NOTIFICATION_TYPES,
  normalizeNotificationList,
  notificationUserId,
  validNotificationId,
  notificationTypeLabel,
  notificationStatusLabel,
  notificationPriorityLabel,
  notificationCreatedTime,
  notificationReadTime,
} from "../notification-data";
it("七种响应枚举分别映射中文查询值", () => {
  expect(Object.values(NOTIFICATION_TYPES)).toEqual([
    "系统通知",
    "任务分配",
    "任务完成",
    "缺陷报告",
    "项目更新",
    "评论回复",
    "截止日期提醒",
  ]);
  for (const [key, value] of Object.entries(NOTIFICATION_TYPES)) {
    expect(notificationTypeLabel(key)).toBe(value);
    expect(normalizeNotificationList({ type: key, read: "unread", page: 2, pageSize: 20 })).toEqual(
      { page: 2, pageSize: 20, bean: { type: value, isRead: false } },
    );
  }
});
it("仅 type/isRead 进入 bean，false 保留，清空/无效分页规范化", () => {
  expect(normalizeNotificationList()).toEqual({ page: 1, pageSize: 10, bean: {} });
  expect(normalizeNotificationList({ read: "read" }).bean).toEqual({ isRead: true });
  expect(normalizeNotificationList({ type: "UNKNOWN", page: -1, pageSize: 0 })).toEqual({
    page: 1,
    pageSize: 10,
    bean: {},
  });
});
it("空值/未知枚举保持中性原值", () => {
  for (const formatter of [
    notificationTypeLabel,
    notificationStatusLabel,
    notificationPriorityLabel,
  ]) {
    expect(formatter(null)).toBe("—");
    expect(formatter("FUTURE")).toBe("FUTURE");
  }
  expect(notificationStatusLabel("ARCHIVED")).toBe("已归档");
  expect(notificationPriorityLabel("URGENT")).toBe("紧急");
});
it("Unix 秒明确乘 1000，无效时间降级，LocalDateTime 原样显示", () => {
  expect(notificationCreatedTime(1728000000)).toBe(
    new Date(1728000000000).toLocaleString("zh-CN", { hour12: false }),
  );
  expect(notificationCreatedTime(0)).toBe(new Date(0).toLocaleString("zh-CN", { hour12: false }));
  for (const value of [null, NaN, Infinity, 1e30]) expect(notificationCreatedTime(value)).toBe("—");
  expect(notificationReadTime("2026-10-06T12:30:00")).toBe("2026-10-06T12:30:00");
});
it("复用鉴权规范 ID，包括 0，拒绝非规范/超安全整数", () => {
  expect(notificationUserId("0")).toBe(0);
  expect(notificationUserId("42")).toBe(42);
  for (const value of [null, undefined, 0, "01", "-1", " 1", "1e2", "9007199254740992"])
    expect(notificationUserId(value)).toBeNull();
  expect(validNotificationId(0)).toBe(true);
  for (const value of [null, "1", -1, 1.5, 9007199254740992])
    expect(validNotificationId(value)).toBe(false);
});
