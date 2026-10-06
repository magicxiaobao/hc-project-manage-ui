// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { mockWorkLogApis, renderWorkLogForm } from "./worklog-test-support";
import { workLogApi } from "@/lib/api/worklog";
import { useAuthStore } from "@/lib/api/auth-store";
beforeEach(mockWorkLogApis);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useAuthStore.setState({ isAuthenticated: false, user: null });
});
it("JSON 必填标记、校验错误在字段下；编辑清旧错误，提交始终禁用无 API 空成功", async () => {
  await renderWorkLogForm("import");
  const json = await screen.findByLabelText(/导入内容/);
  expect(json.previousElementSibling?.textContent).toContain("必填");
  expect((screen.getByText("导入") as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(json, { target: { value: "" } });
  fireEvent.click(screen.getByText("校验与预览"));
  expect(
    screen.getByText("导入内容不能为空").closest("[data-field]")?.getAttribute("data-field"),
  ).toBe("json");
  fireEvent.change(json, { target: { value: "{" } });
  expect(screen.queryByText("导入内容不能为空")).toBeNull();
  fireEvent.click(screen.getByText("校验与预览"));
  expect(screen.getByText("JSON 语法错误")).toBeTruthy();
  fireEvent.click(screen.getByText("导入"));
  expect(workLogApi.batchImport).not.toHaveBeenCalled();
});
it("多行全部错误分行分字段渲染，合法本地预览不报导入成功，解析/预览选择仍 dirty", async () => {
  await renderWorkLogForm("import");
  const json = await screen.findByLabelText(/导入内容/);
  fireEvent.change(json, {
    target: {
      value:
        '{"items":[{"projectId":8,"taskId":0,"hoursSpent":0},{"projectId":7,"taskId":8,"userId":42}]}',
    },
  });
  fireEvent.click(screen.getByText("校验与预览"));
  expect(screen.getAllByRole("alert").length).toBeGreaterThan(8);
  expect(screen.getByText(/第 1 条·projectId/)).toBeTruthy();
  expect(screen.getByText(/第 2 条·userId/)).toBeTruthy();
  fireEvent.click(screen.getByText("第 2 条"));
  fireEvent.click(screen.getByText("取消"));
  await screen.findByText("是否放弃修改？");
  fireEvent.click(screen.getByText("继续编辑"));
  expect(screen.queryByText("导入成功")).toBeNull();
  expect(workLogApi.batchImport).not.toHaveBeenCalled();
});
