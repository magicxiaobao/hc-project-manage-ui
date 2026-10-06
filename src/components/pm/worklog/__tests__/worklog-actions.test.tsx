// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { mockWorkLogApis, renderWorkLogContent, workLogRecord } from "./worklog-test-support";
import { WorkLogListPage } from "../../worklog-list-page";
import { workLogApi } from "@/lib/api/worklog";
import { useAuthStore } from "@/lib/api/auth-store";
beforeEach(mockWorkLogApis);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useAuthStore.setState({ isAuthenticated: false, user: null });
});
async function page() {
  const v = await renderWorkLogContent(<WorkLogListPage />);
  await waitFor(() =>
    expect(screen.getByLabelText("项目").querySelector('option[value="7"]')).toBeTruthy(),
  );
  fireEvent.change(screen.getByLabelText("项目"), { target: { value: "7" } });
  await screen.findByText("原描述");
  return v;
}
it("删除二次确认调用 invalid，成功仍展示服务端取消行，不本地移除/减 total", async () => {
  vi.mocked(workLogApi.invalidWorkLog).mockImplementation(async () => {
    vi.mocked(workLogApi.findByPage).mockResolvedValue({
      list: [workLogRecord({ status: "已取消" })],
      total: 1,
      pageNumber: 1,
      pageSize: 10,
    });
    return "ok";
  });
  await page();
  fireEvent.click(screen.getByText("删除"));
  await screen.findByText("将记录置为已取消，任务实际工时可能更新。");
  expect(workLogApi.invalidWorkLog).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("确认删除"));
  await screen.findByText("已取消");
  expect(screen.getByText("共 1 条")).toBeTruthy();
  expect(screen.queryByText("删除", { selector: "button" })).toBeNull();
  expect(workLogApi.invalidWorkLog).toHaveBeenCalledTimes(1);
  expect(workLogApi.invalidWorkLog).toHaveBeenCalledWith(11);
});
it("删除失败保留确认；在途关闭/路由/切项目拒绝，无 dirty 提示", async () => {
  let reject!: (e: Error) => void;
  vi.mocked(workLogApi.invalidWorkLog).mockImplementation(
    () =>
      new Promise((_r, fail) => {
        reject = fail;
      }),
  );
  const v = await page();
  fireEvent.click(screen.getByText("删除"));
  fireEvent.click(screen.getByText("确认删除"));
  await waitFor(() =>
    expect((screen.getByText("确认删除") as HTMLButtonElement).disabled).toBe(true),
  );
  fireEvent.click(screen.getByText("确认删除"));
  fireEvent.click(screen.getByText("关闭确认删除工时记录"));
  fireEvent.keyDown(document, { key: "Escape" });
  await act(async () => {
    v.router.history.push("/away");
  });
  expect(screen.queryByText("是否放弃修改？")).toBeNull();
  expect(workLogApi.invalidWorkLog).toHaveBeenCalledTimes(1);
  expect(v.router.state.location.pathname).toBe("/form");
  await act(async () => reject(new Error("失效失败")));
  await screen.findByText("失效失败");
  expect(screen.getByRole("dialog", { name: "确认删除工时记录" })).toBeTruthy();
});
it("自身审批禁用并明示", async () => {
  await page();
  expect((screen.getByRole("button", { name: "通过" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText("不能审批自己的工时记录")).toBeTruthy();
});
it("活动草稿切项目先确认；取消选择不丢草稿，放弃后清范围与选择", async () => {
  await page();
  fireEvent.click(screen.getByText("登记工时"));
  await screen.findByLabelText(/工作描述/);
  fireEvent.change(screen.getByLabelText(/工作描述/), { target: { value: "项目草稿" } });
  fireEvent.change(screen.getByLabelText("项目"), { target: { value: "" } });
  await screen.findByText("是否放弃修改？");
  fireEvent.click(screen.getByText("继续编辑"));
  expect((screen.getByLabelText("项目") as HTMLSelectElement).value).toBe("7");
  expect((screen.getByLabelText(/工作描述/) as HTMLTextAreaElement).value).toBe("项目草稿");
  fireEvent.change(screen.getByLabelText("项目"), { target: { value: "" } });
  fireEvent.click(screen.getByText("放弃修改"));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "登记工时" })).toBeNull());
  expect((screen.getByLabelText("项目") as HTMLSelectElement).value).toBe("");
  expect(screen.queryByText("原描述")).toBeNull();
});

it("未知状态保持原文，业务动作只读", async () => {
  vi.mocked(workLogApi.findByPage).mockResolvedValue({
    list: [workLogRecord({ status: "未知状态", userId: 99 })],
    total: 1,
    pageNumber: 1,
    pageSize: 10,
  });
  await page();
  await screen.findByText("未知状态");
  for (const name of ["编辑", "删除", "通过", "驳回"])
    expect(screen.queryByRole("button", { name })).toBeNull();
});
