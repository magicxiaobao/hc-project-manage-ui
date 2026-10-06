// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { NotificationBadge, notificationAccessibleLabel } from "../notification-badge";
afterEach(cleanup);
it.each([
  [3, "3"],
  [123, "99+"],
  [99, "99"],
])("徽标 %s，可访问名称保留完整数", (count, text) => {
  const view = render(<NotificationBadge count={count as number} />);
  expect(view.getByText(text as string)).toBeTruthy();
  expect(notificationAccessibleLabel({ count: count as number })).toBe(`通知，${count} 条未读`);
});
it("确认零值隐藏徽标；未知/错误不声称零，即使曾经成功为零", () => {
  const view = render(<NotificationBadge count={0} />);
  expect(view.container.textContent).toBe("");
  view.rerender(<NotificationBadge count={0} failed />);
  expect(view.getByText("?")).toBeTruthy();
  expect(notificationAccessibleLabel({ count: 0, failed: true })).toBe("通知，未读数暂不可用");
  view.rerender(<NotificationBadge loading />);
  expect(view.getByText("…")).toBeTruthy();
  expect(notificationAccessibleLabel({ loading: true })).toBe("通知，未读数加载中");
});
